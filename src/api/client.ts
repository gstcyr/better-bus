// Typed client for the legacy STLGPS / MyBusStop ASMX web service.
//
// The service is an ASP.NET ScriptService: HTTP GET with query params for reads
// (returns a JSON array), HTTP POST with a JSON body for writes. There is no
// session/token — the username is passed on every read. See PROTOCOL.md.
//
// Native React Native has no CORS restriction, so we call the host directly.

import type {
  AuthResult,
  BusLocation,
  DelaySummary,
  Route,
  Stop,
} from './types';

const READ_BASE = 'https://ws.pwt.ca/stlgps/stlgps.asmx';
const WRITE_BASE = 'https://ws.pwt.ca/stlgps/stlgps_ajax.asmx';

const DEFAULT_TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getJsonArray<T>(url: string): Promise<T[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    // The service marks responses `Cache-Control: public, max-age=14400` (4h),
    // so the native HTTP stack (OkHttp) would otherwise serve stale data for
    // hours — e.g. a just-changed "my stop" never appearing. Force a fresh
    // fetch on every poll.
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache, no-store',
        Pragma: 'no-cache',
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new ApiError(`HTTP ${res.status} for ${url}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? (data as T[]) : [];
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Network request failed', err);
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(url: string, body: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new ApiError(`HTTP ${res.status} for ${url}`);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Network request failed', err);
  } finally {
    clearTimeout(timer);
  }
}

/** MM/DD/YYYY, the format the service expects for the `date` param. */
export function serviceDate(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

/** Parse the ASP.NET `/Date(1694457600000)/` wire format into a JS Date, or null. */
export function parseAspNetDate(value?: string | null): Date | null {
  if (!value) return null;
  const ms = Number(value.replace('/Date(', '').replace(')/', ''));
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** True regardless of whether the server sent a real boolean or the string "true". */
export function isTruthyFlag(v: unknown): boolean {
  return v === true || (typeof v === 'string' && v.toLowerCase() === 'true');
}

// ---- Read endpoints -------------------------------------------------------

export async function authenticateUser(
  username: string,
  password: string,
): Promise<boolean> {
  // The original client escapes only `&` -> `%26`; encodeURIComponent is a superset.
  const u = encodeURIComponent(username);
  const p = encodeURIComponent(password);
  const rows = await getJsonArray<AuthResult>(
    `${READ_BASE}/authenticateUser?u=${u}&p=${p}`,
  );
  return rows.some((r) => isTruthyFlag(r?.authenticated));
}

export function getParentRoutes(username: string): Promise<Route[]> {
  return getJsonArray<Route>(
    `${READ_BASE}/getParentRoutes?u=${encodeURIComponent(username)}`,
  );
}

export async function getDefaultRouteId(
  username: string,
): Promise<string | null> {
  const rows = await getJsonArray<{ route_detail_id: number | string }>(
    `${READ_BASE}/getRID?user=${encodeURIComponent(username)}`,
  );
  // Original app takes the last row as the current/default route.
  const last = rows[rows.length - 1];
  return last ? String(last.route_detail_id) : null;
}

export function getDelaySummary(
  routeId: string | number,
  date: string = serviceDate(),
): Promise<DelaySummary[]> {
  return getJsonArray<DelaySummary>(
    `${READ_BASE}/getDelaySummary?rid=${encodeURIComponent(
      String(routeId),
    )}&date=${encodeURIComponent(date)}`,
  );
}

export function getStops(
  routeId: string | number,
  username: string,
  date: string = serviceDate(),
): Promise<Stop[]> {
  return getJsonArray<Stop>(
    `${READ_BASE}/getStops?rid=${encodeURIComponent(
      String(routeId),
    )}&date=${encodeURIComponent(date)}&u=${encodeURIComponent(username)}`,
  );
}

/** Live GPS position of a bus, via the generic stored-proc gateway. */
export function getBusLocation(unitNumber: string): Promise<BusLocation[]> {
  if (!unitNumber) return Promise.resolve([]);
  const url =
    `${READ_BASE}/getTables?sp=sp_return_unit_current_location` +
    `&cs=STLRPConnectionString` +
    `&parm1=${encodeURIComponent('@unit_number')}` +
    `&val1=${encodeURIComponent(unitNumber)}` +
    `&parm2=&val2=&parm3=&val3=&parm4=&val4=`;
  return getJsonArray<BusLocation>(url);
}

/** Disclaimer / legal HTML text shown on first run. */
export async function getDisclaimerHtml(): Promise<string | null> {
  const url =
    `${READ_BASE}/getTables?sp=sp_GET_mobile_settings` +
    `&cs=MSBMConnectionString` +
    `&parm1=${encodeURIComponent('@get_what')}` +
    `&val1=disclaimer` +
    `&parm2=&val2=&parm3=&val3=&parm4=&val4=`;
  const rows = await getJsonArray<{ m_settings: string }>(url);
  return rows[0]?.m_settings ?? null;
}

// ---- Write endpoints ------------------------------------------------------

/** Register (or update) an FCM push token for a user. */
export function registerDeviceToken(
  username: string,
  fcmToken: string,
): Promise<void> {
  const body = {
    p: {
      sp: 'sp_UPSERT_MOBILE_DEVICES',
      cs: 'MSBMConnectionString',
      returnID: false,
      args: `@type:UPSERT~@UserName:${username}~@deviceID:${encodeURIComponent(
        fcmToken,
      )}~@devicetype:ANDROID`,
    },
  };
  return postJson(`${WRITE_BASE}/putSP2`, body);
}

/**
 * Set the user's "my stop" for their route.
 *
 * Uses the dedicated `putMyStop2` endpoint ({ msi: { stop_id, user_name } }),
 * which is simpler and more robust than the original app's generic
 * `putSP`/`spUpdateParentRouteStop` call. (That generic form is easy to get
 * subtly wrong: sending the trailing parm/val slots as anything other than an
 * empty string makes the service return HTTP 500.)
 */
export function setMyStop(
  username: string,
  stopId: string | number,
): Promise<void> {
  const body = {
    msi: {
      stop_id: String(stopId),
      user_name: username,
    },
  };
  return postJson(`${WRITE_BASE}/putMyStop2`, body);
}
