import AsyncStorage from '@react-native-async-storage/async-storage';
import { localDateKey } from './eta';

const KEY = 'mybusstop.notifications.v1';

export interface NotificationSettings {
  /** Master switch for all bus-arrival notifications. */
  enabled: boolean;
  /** Advance alert: minutes before the timetable arrival time. */
  leadMinutes: number;
  /** Whether the refined "arriving soon" alert is scheduled while the app is open. */
  soonEnabled: boolean;
  /** "Arriving soon" alert: minutes before the live estimated arrival. */
  soonMinutes: number;
  /** YYYY-MM-DD the user chose to skip (one day), or null. */
  skipDateKey: string | null;
  /** YYYY-MM-DD (exclusive) alerts are paused until, or null. Resumes on/after. */
  sleepUntilDateKey: string | null;
}

export const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  leadMinutes: 20,
  soonEnabled: true,
  soonMinutes: 5,
  skipDateKey: null,
  sleepUntilDateKey: null,
};

export async function loadSettings(): Promise<NotificationSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(
  s: NotificationSettings,
): Promise<NotificationSettings> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // best effort
  }
  return s;
}

/** True if the user is asleep (paused) as of `now`. */
export function isSleeping(
  s: NotificationSettings,
  now: Date = new Date(),
): boolean {
  return !!s.sleepUntilDateKey && localDateKey(now) < s.sleepUntilDateKey;
}

/** True if alerts should be suppressed right now (master off, skip-today, or sleeping). */
export function isSuppressed(
  s: NotificationSettings,
  now: Date = new Date(),
): boolean {
  if (!s.enabled) return true;
  if (s.skipDateKey && s.skipDateKey === localDateKey(now)) return true;
  return isSleeping(s, now);
}

/** Compute the wake date (exclusive) N days from today, as a YYYY-MM-DD key. */
export function sleepDateKeyForDays(days: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + Math.max(1, Math.round(days)));
  return localDateKey(d);
}
