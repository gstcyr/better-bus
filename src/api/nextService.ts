import AsyncStorage from '@react-native-async-storage/async-storage';
import { localDateKey } from '../notifications/eta';
import { getStops, serviceDate } from './client';
import type { Route } from './types';

export interface NextService {
  route: Route;
  date: Date;
  firstStopTimeFormat: string | null;
  /** The user's home-stop pick-up time on that day, if we can match it. */
  pickupTimeFormat?: string | null;
  pickupLocation?: string | null;
}

const NS_KEY = 'mybusstop.nextservice.v1';
const HOME_KEY = 'mybusstop.homestop.v1';

/** Remember the user's home-stop location so we can match it on future days. */
export async function cacheHomeStop(location: string): Promise<void> {
  if (!location) return;
  try {
    await AsyncStorage.setItem(HOME_KEY, location);
  } catch {
    // best effort
  }
}

async function loadHomeStop(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(HOME_KEY);
  } catch {
    return null;
  }
}

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');

/** Match two stop-location strings (same physical stop across dispatches). */
function sameLocation(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  const p = Math.min(30, na.length, nb.length);
  return p >= 20 && na.slice(0, p) === nb.slice(0, p);
}

/** Persist the resolved next service day so the weekend card renders instantly. */
export async function saveNextService(ns: NextService): Promise<void> {
  try {
    await AsyncStorage.setItem(
      NS_KEY,
      JSON.stringify({
        dateISO: ns.date.toISOString(),
        routeId: String(ns.route.route_detail_id),
        routeName: ns.route.routeName,
        firstStopTimeFormat: ns.firstStopTimeFormat,
        pickupTimeFormat: ns.pickupTimeFormat ?? null,
        pickupLocation: ns.pickupLocation ?? null,
      }),
    );
  } catch {
    // best effort
  }
}

/** Load the cached next service day, or null if none / already in the past. */
export async function loadNextService(): Promise<NextService | null> {
  try {
    const raw = await AsyncStorage.getItem(NS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as {
      dateISO: string;
      routeId: string;
      routeName: string;
      firstStopTimeFormat: string | null;
      pickupTimeFormat?: string | null;
      pickupLocation?: string | null;
    };
    const date = new Date(c.dateISO);
    if (isNaN(date.getTime())) return null;
    // Stale once that day has passed.
    if (localDateKey(date) < localDateKey(new Date())) return null;
    return {
      route: { route_detail_id: c.routeId, routeName: c.routeName },
      date,
      firstStopTimeFormat: c.firstStopTimeFormat,
      pickupTimeFormat: c.pickupTimeFormat ?? null,
      pickupLocation: c.pickupLocation ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Find the next day that has service, by probing `getStops` forward from
 * tomorrow. The backend only dispatches the next upcoming service day, so this
 * reliably finds it (e.g. Monday from a weekend) and returns null beyond that.
 * Prefers the AM route so "first bus" reflects the start of the day.
 */
export async function findNextService(
  username: string,
  routes: Route[],
  maxDays = 8,
): Promise<NextService | null> {
  if (!routes.length) return null;
  const probe =
    routes.find((r) => (r.routeName ?? '').trim().toUpperCase().endsWith('AM')) ??
    routes[0];
  const home = await loadHomeStop();

  for (let i = 1; i <= maxDays; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    try {
      const stops = await getStops(
        String(probe.route_detail_id),
        username,
        serviceDate(d),
      );
      if (stops.length > 0) {
        const times = stops
          .map((s) => s.stop_schedule_time_format)
          .filter((t): t is string => !!t)
          .sort();
        // The user's stop on that day: flagged, or matched by cached location.
        const mine =
          stops.find((s) => s.is_mystop) ??
          (home
            ? stops.find((s) => sameLocation(s.stop_location, home))
            : undefined);
        return {
          route: probe,
          date: d,
          firstStopTimeFormat: times[0] ?? null,
          pickupTimeFormat: mine?.stop_schedule_time_format ?? null,
          pickupLocation: mine?.stop_location ?? null,
        };
      }
    } catch {
      // ignore and keep probing
    }
  }
  return null;
}
