// Pure helpers for turning schedule/estimate data into notification timings.
// No side effects — easy to reason about and adjust.

import { parseAspNetDate } from '../api/client';
import type { Stop } from '../api/types';

/** Parse an "HH:MM" (or "H:MM") string into hour/minute, or null. */
export function parseHHMM(
  value?: string | null,
): { hour: number; minute: number } | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Subtract `lead` minutes from an HH:MM clock time, wrapping within a day.
 * Bus times minus a 5–60 min lead never cross midnight in practice, but we wrap
 * defensively so we never produce a negative hour.
 */
export function minusMinutes(
  hour: number,
  minute: number,
  lead: number,
): { hour: number; minute: number } {
  const total = (((hour * 60 + minute - lead) % 1440) + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

/** Parse a running-delay string like "1 Min", "10 min", "-2" into signed minutes. */
export function parseDelayMinutes(s?: string | null): number {
  if (!s) return 0;
  const m = /(-?\d+)/.exec(s);
  return m ? Number(m[1]) : 0;
}

/**
 * Estimated arrival time at a stop.
 * `stop_arrival_time` is the *actual* recorded arrival — present only once the
 * bus has passed the stop. For an upcoming stop it's null, so we estimate from
 * the timetable time plus the current running delay.
 */
export function estimatedArrival(stop: Stop, delayMinutes = 0): Date | null {
  const actual = parseAspNetDate(stop.stop_arrival_time);
  if (actual) return actual;
  const p = parseHHMM(stop.stop_schedule_time_format);
  if (!p) return null;
  const d = new Date();
  d.setHours(p.hour, p.minute, 0, 0);
  return new Date(d.getTime() + delayMinutes * 60000);
}

/**
 * The route's scheduled service window in minutes-of-day, from the earliest and
 * latest stop timetable times. Returns null if no stop has a schedule.
 */
export function serviceWindowMinutes(
  stops: Stop[],
): { start: number; end: number } | null {
  let start = Infinity;
  let end = -Infinity;
  for (const s of stops) {
    const hhmm = parseHHMM(s.stop_schedule_time_format);
    if (!hhmm) continue;
    const m = hhmm.hour * 60 + hhmm.minute;
    if (m < start) start = m;
    if (m > end) end = m;
  }
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
}

/** Current time as minutes-of-day, local. */
export function nowMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Today's date as YYYY-MM-DD in local time (used for the "skip today" flag). */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Route name ends in "AM" / "PM" → a short tag for notification text. */
export function routeTag(routeName?: string): string | null {
  const n = (routeName ?? '').trim().toUpperCase();
  if (n.endsWith('AM')) return 'AM';
  if (n.endsWith('PM')) return 'PM';
  return null;
}
