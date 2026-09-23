import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, {
  Marker,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
} from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getBusLocation,
  getDelaySummary,
  getParentRoutes,
  getStops,
  isTruthyFlag,
  parseAspNetDate,
  setMyStop,
} from '../api/client';
import {
  cacheHomeStop,
  findNextService,
  loadNextService,
  saveNextService,
  type NextService,
} from '../api/nextService';
import { cacheRoutes, loadCachedRoutes } from '../api/routeCache';
import {
  estimatedArrival,
  nowMinutes,
  parseDelayMinutes,
  serviceWindowMinutes,
} from '../notifications/eta';
import type { BusLocation, DelaySummary, Route, Stop } from '../api/types';
import { Pill, ProgressBar } from '../components/ui';
import { useI18n } from '../i18n/LanguageContext';
import { useIntervalPoll } from '../hooks/useIntervalPoll';
import {
  refreshAdvanceAlerts,
  scheduleArrivingSoon,
} from '../notifications/schedule';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, radius, shadow, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

const REFRESH_MS = 30_000;
// How far outside the timetable window we still auto-refresh (bus can run early/late).
const PRE_WINDOW_MIN = 20;
const POST_WINDOW_MIN = 30;

interface RouteBundle {
  delay: DelaySummary | null;
  stops: Stop[];
  bus: BusLocation | null;
}

/** Whole minutes from now until `d` (rounded), or null if not in the future. */
function minutesUntil(d: Date | null): number | null {
  if (!d) return null;
  const diff = Math.round((d.getTime() - Date.now()) / 60000);
  return diff > 0 ? diff : null;
}

/**
 * Pick the route that matches the current time of day: an "AM" route in the
 * morning, a "PM" route from noon onward, matched on the route name suffix.
 * Falls back to the first route when there's no AM/PM naming.
 */
function pickRouteForTimeOfDay(routes: Route[]): Route {
  const wantPM = new Date().getHours() >= 12;
  const suffix = wantPM ? 'PM' : 'AM';
  const match = routes.find((r) =>
    (r.routeName ?? '').trim().toUpperCase().endsWith(suffix),
  );
  return match ?? routes[0];
}

export default function MapScreen({ navigation, route }: Props) {
  const { username, signOut } = useAuth();
  const { t, formatClock, formatTime } = useI18n();
  const mapRef = useRef<MapView>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeId, setRouteId] = useState<string | null>(route.params?.routeId ?? null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [noService, setNoService] = useState(false);
  const [nextService, setNextService] = useState<NextService | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Routes (of the user's available routes) that have no "my stop" set yet.
  const [routesNeedingStop, setRoutesNeedingStop] = useState<
    { route: Route; stops: Stop[] }[]
  >([]);
  const [stopCheckKey, setStopCheckKey] = useState(0);

  // Load the user's routes, pick a default, or resolve the "no service" state.
  useEffect(() => {
    if (!username) return;
    let active = true;
    setBooting(true);
    setNoService(false);
    setBootError(null);
    (async () => {
      try {
        const r = await getParentRoutes(username);
        if (!active) return;
        setRoutes(r);

        // Is there actually service today? Weekends return no routes at all;
        // PD days / holidays return routes but no dispatch (no stops / "No School").
        let serviceToday = false;
        let chosen: Route | null = null;
        if (r.length > 0) {
          void cacheRoutes(r);
          chosen = pickRouteForTimeOfDay(r);
          try {
            const ds = await getDelaySummary(String(chosen.route_detail_id));
            serviceToday = Number(ds[0]?.total_stop ?? 0) > 0;
          } catch {
            serviceToday = true; // network hiccup — assume service, let the poll handle it
          }
        }
        if (!active) return;

        if (serviceToday && chosen) {
          if (!routeId) setRouteId(String(chosen.route_detail_id));
        } else {
          // No service today (weekend, PD day, or holiday). Show the cached next
          // service day instantly, then re-probe to refresh it.
          setNoService(true);
          const cachedNs = await loadNextService();
          if (active && cachedNs) setNextService(cachedNs);
          const probeRoutes = r.length > 0 ? r : await loadCachedRoutes();
          if (probeRoutes.length) {
            const ns = await findNextService(username, probeRoutes);
            if (active && ns) {
              setNextService(ns);
              void saveNextService(ns);
            }
          }
        }
      } catch {
        if (active) setBootError(t('login.serverError'));
      } finally {
        if (active) setBooting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [username, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Adopt a route chosen on the picker screen.
  useEffect(() => {
    if (route.params?.routeId) setRouteId(route.params.routeId);
  }, [route.params?.routeId]);

  const fetchBundle = useCallback(async (): Promise<RouteBundle> => {
    if (!routeId || !username) return { delay: null, stops: [], bus: null };
    const [delayRows, stops] = await Promise.all([
      getDelaySummary(routeId),
      getStops(routeId, username),
    ]);
    const delay = delayRows[0] ?? null;
    let bus: BusLocation | null = null;
    if (delay && isTruthyFlag(delay.unit_visible) && delay.unit_number) {
      const busRows = await getBusLocation(delay.unit_number);
      bus = busRows[busRows.length - 1] ?? null;
    }
    return { delay, stops, bus };
  }, [routeId, username]);

  // Auto-refresh only during the route's service window, and stop once the bus
  // goes offline after having been live (trip finished). Saves battery/data.
  const [shouldPoll, setShouldPoll] = useState(true);
  const [pauseReason, setPauseReason] = useState<'outside' | 'ended' | null>(
    null,
  );

  const { data, error, loading, secondsToRefresh, refreshNow } =
    useIntervalPoll<RouteBundle>(fetchBundle, {
      intervalMs: REFRESH_MS,
      enabled: !!routeId && !!username && shouldPoll,
    });

  const stops = data?.stops ?? [];
  const delay = data?.delay ?? null;
  const bus = data?.bus ?? null;

  // Reset the polling gate whenever the route changes (a fresh trip).
  const wasLiveRef = useRef(false);
  useEffect(() => {
    wasLiveRef.current = false;
    setShouldPoll(true);
    setPauseReason(null);
  }, [routeId]);

  // Re-evaluate the polling gate from the latest data and current clock time.
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const delayRef = useRef(delay);
  delayRef.current = delay;
  const evaluatePolling = useCallback(() => {
    const st = stopsRef.current;
    const dl = delayRef.current;
    if (st.length === 0) {
      setShouldPoll(true);
      setPauseReason(null);
      return;
    }
    const currentlyLive = !!dl && isTruthyFlag(dl.unit_visible);
    if (currentlyLive) wasLiveRef.current = true;
    const tripEnded =
      (wasLiveRef.current && !currentlyLive) ||
      (!!dl && dl.total_stop > 0 && dl.cur_stop >= dl.total_stop);
    if (tripEnded) {
      setShouldPoll(false);
      setPauseReason('ended');
      return;
    }
    const win = serviceWindowMinutes(st);
    const withinWindow = win
      ? nowMinutes() >= win.start - PRE_WINDOW_MIN &&
        nowMinutes() <= win.end + POST_WINDOW_MIN
      : true;
    setShouldPoll(withinWindow);
    setPauseReason(withinWindow ? null : 'outside');
  }, []);

  useEffect(() => {
    evaluatePolling();
  }, [data, evaluatePolling]);

  // Slow ticker so we resume when the window opens even while paused (no network).
  useEffect(() => {
    if (!routeId || !username) return;
    const id = setInterval(evaluatePolling, 60_000);
    return () => clearInterval(id);
  }, [routeId, username, evaluatePolling]);

  // Refetch whenever the map regains focus (e.g. after saving "my stop" on the
  // detail screen), so the highlight updates without waiting for the next poll.
  const hasFocusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (hasFocusedOnce.current) refreshNow();
      else hasFocusedOnce.current = true;
    }, [refreshNow]),
  );

  const routeName = useMemo(() => {
    const found = routes.find((r) => String(r.route_detail_id) === routeId);
    return found?.routeName ?? t('map.myRoute');
  }, [routes, routeId]);

  const myStop = useMemo(() => stops.find((s) => s.is_mystop), [stops]);

  // Check every available route for a "my stop": a route with none gets no
  // pickup/drop-off alerts, so we surface a banner nudging the user to set one.
  useEffect(() => {
    if (!username || noService || routes.length === 0) {
      setRoutesNeedingStop([]);
      return;
    }
    let active = true;
    (async () => {
      const missing: { route: Route; stops: Stop[] }[] = [];
      for (const r of routes) {
        try {
          const s = await getStops(String(r.route_detail_id), username);
          if (!s.some((x) => x.is_mystop)) missing.push({ route: r, stops: s });
        } catch {
          // Skip a route we couldn't load; don't warn on a network hiccup.
        }
      }
      if (active) setRoutesNeedingStop(missing);
    })();
    return () => {
      active = false;
    };
  }, [username, noService, routes, stopCheckKey]);

  // Tap a stop pin → confirm and set it as the user's stop for the viewed route.
  const onSelectStop = useCallback(
    (stop: Stop) => {
      if (!username) return;
      if (stop.is_mystop) {
        Alert.alert(
          stop.stop_location,
          t('map.alreadyMyStop', { route: routeName }),
        );
        return;
      }
      const sched = formatClock(stop.stop_schedule_time_format);
      const message = sched
        ? `${t('map.schedAt', { time: sched })}\n\n${t('map.setStopMessage', { route: routeName })}`
        : t('map.setStopMessage', { route: routeName });
      Alert.alert(stop.stop_location, message, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('stopDetail.setMyStop'),
          onPress: async () => {
            try {
              await setMyStop(username, stop.stop_id);
              if (stop.stop_location) void cacheHomeStop(stop.stop_location);
              await refreshAdvanceAlerts(username);
              refreshNow();
              setStopCheckKey((k) => k + 1);
            } catch {
              Alert.alert(
                t('stopDetail.saveFailTitle'),
                t('stopDetail.saveFailBody'),
              );
            }
          },
        },
      ]);
    },
    [username, routeName, refreshNow, t, formatClock],
  );

  // Timetable time (AM/PM) and live minutes-away for the user's stop. Recomputed
  // each render — the 1s countdown ticker keeps the ETA fresh.
  const myStopSchedClock = formatClock(myStop?.stop_schedule_time_format);
  const delayMinutes = parseDelayMinutes(delay?.late_amount_est);
  // Actual recorded arrival at the user's stop, once the bus has passed it.
  const myStopActual = myStop ? parseAspNetDate(myStop.stop_arrival_time) : null;
  const arrived = !!myStopActual;
  const myStopMinAway = myStop
    ? minutesUntil(estimatedArrival(myStop, delayMinutes))
    : null;
  const busIsLive = !!delay && isTruthyFlag(delay.unit_visible);
  const etaDisplay = busIsLive && myStopMinAway != null
      ? t('map.minValue', { n: myStopMinAway })
      : t('map.arrivingNow');

  // Rebuild the repeating weekday "advance" alerts once per session, from the
  // current timetable (runs its own fetch across the user's routes).
  const didScheduleAdvance = useRef(false);
  useEffect(() => {
    // Only when there's service today — otherwise getParentRoutes is empty and a
    // refresh would cancel the user's standing weekly alerts without rescheduling.
    if (
      username &&
      !booting &&
      !bootError &&
      !noService &&
      routes.length > 0 &&
      !didScheduleAdvance.current
    ) {
      didScheduleAdvance.current = true;
      void refreshAdvanceAlerts(username);
    }
  }, [username, booting, bootError, noService, routes.length]);

  // Keep the live "arriving soon" alert in sync with the current estimate for
  // the viewed route's my-stop. Only reschedule when the estimate actually moves.
  const lastSoonArrival = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!myStop) {
      lastSoonArrival.current = undefined;
      return;
    }
    // Remember the home-stop location so the "next service" card can show the
    // pick-up time on future no-service days (when is_mystop isn't flagged).
    if (myStop.stop_location) void cacheHomeStop(myStop.stop_location);
    // Schedule the "arriving soon" alert from the live estimate (schedule +
    // delay), rescheduling only when that estimate actually shifts.
    const est = estimatedArrival(myStop, delayMinutes);
    const key = est ? String(est.getTime()) : undefined;
    if (key && key !== lastSoonArrival.current) {
      lastSoonArrival.current = key;
      void scheduleArrivingSoon(est, myStop.stop_location, routeName);
    }
  }, [myStop, routeName, delayMinutes]);

  // Fit the map to all stops whenever the stop set changes.
  const fitToStops = useCallback(() => {
    const coords = stops
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.long))
      .map((s) => ({ latitude: s.lat, longitude: s.long }));
    if (coords.length > 0) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 60, bottom: 260, left: 60 },
        animated: true,
      });
    }
  }, [stops]);

  useEffect(() => {
    const timer = setTimeout(fitToStops, 400);
    return () => clearTimeout(timer);
  }, [fitToStops]);

  const initialRegion = useMemo(() => {
    const first = stops.find((s) => Number.isFinite(s.lat));
    return {
      latitude: first?.lat ?? 51.04,
      longitude: first?.long ?? -114.07,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }, [stops]);

  const hasAnnouncement =
    !!delay?.announcement &&
    delay.announcement.trim() !== '' &&
    delay.announcement.toLowerCase() !== 'n/a';

  if (booting) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.bootMsg}>{t('map.loadingRoutes')}</Text>
      </SafeAreaView>
    );
  }

  if (noService) {
    return (
      <SafeAreaView style={styles.noServiceSafe} edges={['top', 'bottom']}>
        <View style={styles.noServiceCenter}>
          <Image
            source={require('../../assets/bus-logo.png')}
            style={styles.noServiceBus}
            resizeMode="contain"
          />
          <Text style={styles.bootTitle}>{t('map.noServiceTitle')}</Text>
          <Text style={styles.bootMsg}>{t('map.noServiceBody')}</Text>
          {nextService ? (
            <View style={styles.nextCard}>
              <Text style={styles.nextLine}>
                {t('map.nextService', {
                  day: t(`day.${nextService.date.getDay()}`),
                })}
              </Text>
              {nextService.pickupTimeFormat ? (
                <Text style={styles.nextSub}>
                  {t('map.pickupAt', {
                    time: formatClock(nextService.pickupTimeFormat) ?? '',
                  })}
                </Text>
              ) : nextService.firstStopTimeFormat ? (
                <Text style={styles.nextSub}>
                  {t('map.firstBus', {
                    time: formatClock(nextService.firstStopTimeFormat) ?? '',
                  })}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.bootMsg}>{t('map.noUpcoming')}</Text>
          )}
          <Pressable
            style={styles.linkBtn}
            onPress={() => setReloadKey((k) => k + 1)}
          >
            <Text style={styles.linkBtnText}>{t('map.checkAgain')}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.signOutBtn} onPress={() => signOut()}>
          <Text style={styles.linkBtnText}>{t('stops.signOut')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (bootError) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.bootMsg}>{bootError}</Text>
        <Pressable
          style={styles.linkBtn}
          onPress={() => setReloadKey((k) => k + 1)}
        >
          <Text style={styles.linkBtnText}>{t('map.checkAgain')}</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={() => signOut()}>
          <Text style={styles.linkBtnText}>{t('map.backToSignIn')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        showsTraffic
        showsUserLocation={false}
        onMapReady={fitToStops}
      >
        {stops.map((s, i) => {
          if (!Number.isFinite(s.lat) || !Number.isFinite(s.long)) return null;
          const seq = Number(s.id);
          const passed =
            delay != null && Number.isFinite(seq) && seq <= delay.cur_stop;
          const isSchool =
            (s.stop_location_type_description ?? '').toLowerCase() === 'school';
          const mine = !!s.is_mystop;
          const tone = isSchool
            ? colors.primaryDark
            : passed
              ? colors.textMuted
              : colors.primary;
          return (
            <Marker
              key={`${s.stop_id}-${i}`}
              coordinate={{ latitude: s.lat, longitude: s.long }}
              onPress={() => onSelectStop(s)}
              anchor={{ x: 0.5, y: mine ? 1 : 0.5 }}
              zIndex={mine ? 500 : 1}
            >
              {mine ? (
                <View style={styles.myStopMarker}>
                  <View style={styles.myStopBubble}>
                    <Text style={styles.myStopGlyph}>🏠</Text>
                  </View>
                  <View style={styles.myStopStem} />
                </View>
              ) : (
                <View style={[styles.stopPin, { backgroundColor: tone }]}>
                  <Text style={styles.stopPinText}>
                    {isSchool ? '★' : Number.isFinite(seq) ? seq : '•'}
                  </Text>
                </View>
              )}
            </Marker>
          );
        })}

        {bus && Number.isFinite(bus.lat) && (
          <Marker
            coordinate={{ latitude: bus.lat, longitude: bus.long }}
            title={t('map.busNumber', { n: delay?.unit_number ?? '' })}
            description={t('map.lastSeen', {
              t: formatTime(parseAspNetDate(bus.stamp)),
              n: delay?.unit_number ?? '',
            })}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={999}
          >
            <View style={styles.busPin}>
              <Text style={styles.busGlyph}>🚌</Text>
            </View>
          </Marker>
        )}
      </MapView>

      {/* Top bar: route title + options */}
      <SafeAreaView edges={['top']} style={styles.topSafe} pointerEvents="box-none">
        <View style={styles.topBar} pointerEvents="box-none">
          <Pressable
            style={styles.titleChip}
            onPress={() =>
              navigation.navigate('RoutePicker', {
                routes,
                currentRouteId: routeId ?? undefined,
              })
            }
          >
            <Text style={styles.titleText} numberOfLines={1}>
              {routeName}
            </Text>
            <Text style={styles.titleCaret}>▾</Text>
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => navigation.navigate('NotificationSettings')}
            accessibilityLabel={t('notif.settingsTitle')}
          >
            <Text style={styles.iconBtnGlyph}>⚙️</Text>
          </Pressable>
          <Pressable
            style={styles.optionsBtn}
            onPress={() =>
              routeId &&
              navigation.navigate('Stops', { routeId, stops })
            }
          >
            <Text style={styles.optionsBtnText}>{t('map.stops')}</Text>
          </Pressable>
        </View>

        {routesNeedingStop.length > 0 && (
          <Pressable
            style={styles.warnBanner}
            onPress={() => {
              const first = routesNeedingStop[0];
              navigation.navigate('Stops', {
                routeId: String(first.route.route_detail_id),
                stops: first.stops,
              });
            }}
          >
            <Text style={styles.warnGlyph}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.warnTitle} numberOfLines={2}>
                {routesNeedingStop.length === 1
                  ? t('map.needStopOne', {
                      route: routesNeedingStop[0].route.routeName,
                    })
                  : t('map.needStopMany', { n: routesNeedingStop.length })}
              </Text>
              <Text style={styles.warnCta}>{t('map.needStopCta')}</Text>
            </View>
            <Text style={styles.warnCaret}>›</Text>
          </Pressable>
        )}
      </SafeAreaView>

      {/* Bottom status sheet */}
      <SafeAreaView edges={['bottom']} style={styles.bottomSafe} pointerEvents="box-none">
        <View style={styles.sheet}>
          {hasAnnouncement && (
            <View style={styles.announceRow}>
              <Text style={styles.announceGlyph}>📢</Text>
              <Text style={styles.announceText} numberOfLines={3}>
                {delay!.announcement}
              </Text>
            </View>
          )}

          <View style={styles.statusRow}>
            <View style={styles.statusCol}>
              <Text style={styles.statusLabel}>{t('map.delay')}</Text>
              <Text style={styles.statusValue}>
                {delay?.late_amount_est ?? '—'}
              </Text>
              {!!delay?.late_amount && (
                <Text style={styles.statusSub}>{delay.late_amount}</Text>
              )}
            </View>
            <View style={styles.statusCol}>
              <Text style={styles.statusLabel}>
                {arrived ? t('map.arrived') : t('map.arrivingIn')}
              </Text>
              <Text style={styles.statusValue}>
                {arrived ? formatTime(myStopActual) : etaDisplay}
              </Text>
              <Pill
                label={busIsLive ? t('map.live') : t('map.offline')}
                tone={busIsLive ? 'success' : 'neutral'}
              />
            </View>
          </View>

          {myStop ? (
            <View style={styles.myStopBanner}>
              <Text style={styles.myStopBannerGlyph}>🏠</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.myStopBannerLabel}>
                  {t('map.myStopLabel')}
                </Text>
                <Text style={styles.myStopBannerText} numberOfLines={1}>
                  {myStop.stop_location}
                </Text>
              </View>
              {!!myStopSchedClock && (
                <View style={styles.myStopBannerRight}>
                  <Text style={styles.myStopBannerLabel}>
                    {t('map.schedShort')}
                  </Text>
                  <Text style={styles.myStopBannerTime}>{myStopSchedClock}</Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.noStopHint}>{t('map.noStopSelected')}</Text>
          )}

          <View style={styles.progressBlock}>
            <View style={styles.progressLabels}>
              <Text style={styles.statusSub}>
                {t('map.stopXofY', {
                  a: delay?.cur_stop ?? 0,
                  b: delay?.total_stop ?? 0,
                })}
              </Text>
              <Text style={styles.busLineText}>
                {t('map.busNumber', { n: delay?.unit_number || '—' })}
              </Text>
            </View>
            <ProgressBar
              value={delay?.cur_stop ?? 0}
              max={delay?.total_stop ?? 0}
            />
          </View>

          <Pressable style={styles.refreshRow} onPress={refreshNow}>
            <Text style={styles.refreshText}>
              {loading
                ? t('map.refreshing')
                : error
                  ? t('map.tapRetry')
                  : pauseReason === 'ended'
                    ? t('map.pausedTripEnded')
                    : pauseReason === 'outside'
                      ? t('map.pausedOutsideHours')
                      : t('map.refreshingIn', { s: secondsToRefresh })}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.bg,
  },
  bootTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  bootMsg: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  noServiceSafe: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl },
  noServiceCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  noServiceBus: { width: 160, height: 92 },
  signOutBtn: { alignItems: 'center', paddingVertical: spacing.md },
  linkBtn: { marginTop: spacing.md },
  linkBtnText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  nextCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.sm,
    ...shadow.card,
  },
  nextLine: { fontSize: 17, fontWeight: '800', color: colors.text },
  nextSub: { fontSize: 15, color: colors.textMuted, marginTop: 2 },

  topSafe: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  titleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadow.card,
  },
  titleText: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  titleCaret: { fontSize: 14, color: colors.primary, marginLeft: spacing.sm },
  optionsBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadow.card,
  },
  optionsBtnText: { color: colors.onPrimary, fontWeight: '800', fontSize: 15 },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  iconBtnGlyph: { fontSize: 20 },

  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: '#FFF4E5',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    ...shadow.card,
  },
  warnGlyph: { fontSize: 20 },
  warnTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  warnCta: { fontSize: 12, color: colors.warning, fontWeight: '700', marginTop: 1 },
  warnCaret: { fontSize: 22, color: colors.warning, fontWeight: '800' },

  stopPin: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 4,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  stopPinText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  myStopMarker: { alignItems: 'center' },
  myStopBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    ...shadow.card,
  },
  myStopGlyph: { fontSize: 22 },
  myStopStem: {
    width: 3,
    height: 10,
    backgroundColor: colors.accent,
    marginTop: -1,
  },
  busPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadow.card,
  },
  busGlyph: {
    fontSize: 20,
    color: 'yellow'
  },

  bottomSafe: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    margin: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.md,
    ...shadow.card,
  },
  announceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.accent + '22',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  announceGlyph: { fontSize: 16 },
  announceText: { flex: 1, color: colors.text, fontSize: 14 },
  statusRow: { flexDirection: 'row', gap: spacing.lg },
  statusCol: { flex: 1, gap: 2 },
  statusLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  busLineText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  noStopHint: { fontSize: 13, color: colors.textMuted },
  statusSub: { fontSize: 13, color: colors.textMuted },
  myStopBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.accent + '22',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  myStopBannerGlyph: { fontSize: 20 },
  myStopBannerLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  myStopBannerText: { fontSize: 15, fontWeight: '700', color: colors.text },
  myStopBannerRight: { alignItems: 'flex-end' },
  myStopBannerTime: { fontSize: 15, fontWeight: '800', color: colors.text },
  progressBlock: { gap: spacing.sm },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  refreshRow: { alignItems: 'center', paddingTop: spacing.xs },
  refreshText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
});
