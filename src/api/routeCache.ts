import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Route } from './types';

const KEY = 'mybusstop.routes.v1';

// The route list (getParentRoutes) is empty on non-service days, and there's no
// way to fetch route ids for a future date from the API. So we remember the
// user's routes from the last service day to power the "next service" lookup.

export async function cacheRoutes(routes: Route[]): Promise<void> {
  if (!routes.length) return;
  try {
    const slim = routes.map((r) => ({
      route_detail_id: r.route_detail_id,
      routeName: r.routeName,
    }));
    await AsyncStorage.setItem(KEY, JSON.stringify(slim));
  } catch {
    // best effort
  }
}

export async function loadCachedRoutes(): Promise<Route[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Route[]) : [];
  } catch {
    return [];
  }
}
