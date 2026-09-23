import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { strings, type Lang } from './strings';

const KEY = 'mybusstop.lang.v1';
const TF_KEY = 'mybusstop.timeformat.v1';

// Module-level current language so non-React code (notification scheduling) can
// translate too. Kept in sync with the React LanguageProvider.
let current: Lang = 'en';

export type Params = Record<string, string | number>;

export type TimeFormat = '12h' | '24h';

// Module-level time-format preference, mirrored into the LanguageProvider.
let currentTimeFormat: TimeFormat = '12h';

export function getTimeFormat(): TimeFormat {
  return currentTimeFormat;
}

export async function loadTimeFormat(): Promise<TimeFormat> {
  try {
    const raw = await AsyncStorage.getItem(TF_KEY);
    if (raw === '12h' || raw === '24h') {
      currentTimeFormat = raw;
      return raw;
    }
  } catch {
    // ignore
  }
  currentTimeFormat = '12h';
  return currentTimeFormat;
}

export async function persistTimeFormat(tf: TimeFormat): Promise<void> {
  currentTimeFormat = tf;
  try {
    await AsyncStorage.setItem(TF_KEY, tf);
  } catch {
    // best effort
  }
}

/** Format a "HH:MM" (24h) timetable string per the chosen time format. */
export function formatClock(
  hhmm?: string | null,
  fmt: TimeFormat = currentTimeFormat,
): string | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h = Number(m[1]);
  const min = m[2];
  if (fmt === '24h') return `${String(h).padStart(2, '0')}:${min}`;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${ampm}`;
}

/** Format a Date per the chosen time format. */
export function formatTime(
  d?: Date | null,
  fmt: TimeFormat = currentTimeFormat,
): string {
  if (!d) return '--:--';
  return d.toLocaleTimeString(
    [],
    fmt === '24h'
      ? { hour: '2-digit', minute: '2-digit', hour12: false }
      : { hour: 'numeric', minute: '2-digit', hour12: true },
  );
}

export function deviceLang(): Lang {
  try {
    const code = Localization.getLocales?.()[0]?.languageCode ?? 'en';
    return code?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  } catch {
    return 'en';
  }
}

export function getLang(): Lang {
  return current;
}

export function translate(lang: Lang, key: string, params?: Params): string {
  let s = strings[lang][key] ?? strings.en[key] ?? key;
  if (params) {
    for (const k of Object.keys(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(params[k]));
    }
  }
  return s;
}

/** Translate with the current module language (for use outside React). */
export function t(key: string, params?: Params): string {
  return translate(current, key, params);
}

/** Load the saved language (or device default) at startup. */
export async function loadLang(): Promise<Lang> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === 'en' || raw === 'fr') {
      current = raw;
      return raw;
    }
  } catch {
    // ignore
  }
  current = deviceLang();
  return current;
}

export async function persistLang(lang: Lang): Promise<void> {
  current = lang;
  try {
    await AsyncStorage.setItem(KEY, lang);
  } catch {
    // best effort
  }
}
