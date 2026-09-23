import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getParentRoutes, getStops } from '../api/client';
import type { Stop } from '../api/types';
import { formatClock, t } from '../i18n/i18n';
import { minusMinutes, parseHHMM, routeTag } from './eta';
import {
  isSleeping,
  isSuppressed,
  loadSettings,
  type NotificationSettings,
} from './settings';

const CHANNEL_ID = 'bus-alerts';
const CATEGORY_ID = 'bus-advance';
export const SKIP_ACTION = 'skip-today';

// Monday..Friday, in expo-notifications weekday numbering (1 = Sunday).
const WEEKDAYS = [2, 3, 4, 5, 6];

type Kind = 'advance' | 'soon';

/** One-time setup: foreground behavior, permission, Android channel, action button. */
export async function setupNotifications(): Promise<boolean> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: t('push.channelName'),
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1565C0',
    });
  }

  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: SKIP_ACTION,
      buttonTitle: t('push.skipAction'),
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ]);

  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.status === 'granted';
}

async function cancelByKind(kind: Kind): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as { kind?: Kind } | undefined)?.kind === kind)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

interface HomeStopInfo {
  routeId: string;
  routeName: string;
  stop: Stop;
}

/** Fetch every route's "my stop", for scheduling. */
async function findHomeStops(username: string): Promise<HomeStopInfo[]> {
  const routes = await getParentRoutes(username);
  const results: HomeStopInfo[] = [];
  for (const r of routes) {
    try {
      const stops = await getStops(String(r.route_detail_id), username);
      const home = stops.find((s) => s.is_mystop);
      if (home) {
        results.push({
          routeId: String(r.route_detail_id),
          routeName: r.routeName,
          stop: home,
        });
      }
    } catch {
      // skip a route we couldn't load
    }
  }
  return results;
}

/**
 * Rebuild the repeating weekday "advance" alerts from the current timetable.
 * Safe to call whenever the app opens; it cancels and re-creates them.
 */
export async function refreshAdvanceAlerts(
  username: string,
  settings?: NotificationSettings,
): Promise<void> {
  const s = settings ?? (await loadSettings());
  await cancelByKind('advance');

  // Master off or currently sleeping → leave them cancelled.
  if (!s.enabled || isSleeping(s)) return;

  const homeStops = await findHomeStops(username);
  for (const info of homeStops) {
    const hhmm = parseHHMM(info.stop.stop_schedule_time_format);
    if (!hhmm) continue;
    const at = minusMinutes(hhmm.hour, hhmm.minute, s.leadMinutes);
    const tag = routeTag(info.routeName);
    const title = tag
      ? t('push.advanceTitleTag', { tag })
      : t('push.advanceTitle');
    const body = t('push.advanceBody', {
      stop: info.stop.stop_location,
      time: formatClock(info.stop.stop_schedule_time_format) ?? '',
    });

    for (const weekday of WEEKDAYS) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          categoryIdentifier: CATEGORY_ID,
          data: {
            kind: 'advance',
            routeId: info.routeId,
            routeName: info.routeName,
            stopId: info.stop.stop_id,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: at.hour,
          minute: at.minute,
          channelId: CHANNEL_ID,
        },
      });
    }
  }
}

/**
 * Schedule (or refresh) the one-off "arriving soon" alert from the live estimate.
 * Called while the app is open and has fresh data for the viewed route.
 */
export async function scheduleArrivingSoon(
  arrival: Date | null,
  stopLocation: string,
  routeName: string,
  settings?: NotificationSettings,
): Promise<void> {
  const s = settings ?? (await loadSettings());
  await cancelByKind('soon');
  if (!s.soonEnabled || isSuppressed(s)) return;

  if (!arrival) return;
  const now = Date.now();
  if (arrival.getTime() <= now) return; // bus already reached the stop

  const fireAtMs = arrival.getTime() - s.soonMinutes * 60_000;
  // If we're already inside the window, fire almost immediately (once).
  const when = new Date(Math.max(fireAtMs, now + 2_000));
  const tag = routeTag(routeName);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: tag ? t('push.soonTitleTag', { tag }) : t('push.soonTitle'),
      body: t('push.soonBody', {
        n: s.soonMinutes,
        stop: stopLocation,
      }),
      data: { kind: 'soon' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: CHANNEL_ID,
    },
  });
}

/** Cancel the pending "arriving soon" alert (e.g. user tapped "Skip today"). */
export function cancelArrivingSoon(): Promise<void> {
  return cancelByKind('soon');
}

/** Fire an immediate notification so the user can confirm alerts are working. */
export async function sendTestNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: t('push.testTitle'),
      body: t('push.testBody'),
      categoryIdentifier: CATEGORY_ID,
      data: { kind: 'advance' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      channelId: CHANNEL_ID,
    },
  });
}
