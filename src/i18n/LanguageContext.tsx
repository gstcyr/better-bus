import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  formatClock as fmtClock,
  formatTime as fmtTime,
  loadLang,
  loadTimeFormat,
  persistLang,
  persistTimeFormat,
  translate,
  type Params,
  type TimeFormat,
} from './i18n';
import type { Lang } from './strings';

interface LanguageState {
  lang: Lang;
  ready: boolean;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Params) => string;
  timeFormat: TimeFormat;
  setTimeFormat: (tf: TimeFormat) => void;
  /** Format a "HH:MM" timetable string per the chosen time format. */
  formatClock: (hhmm?: string | null) => string | null;
  /** Format a Date per the chosen time format. */
  formatTime: (d?: Date | null) => string;
}

const LanguageContext = createContext<LanguageState | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  const [timeFormat, setTfState] = useState<TimeFormat>('12h');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([loadLang(), loadTimeFormat()]).then(([l, tf]) => {
      setLangState(l);
      setTfState(tf);
      setReady(true);
    });
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    void persistLang(l);
  }, []);

  const setTimeFormat = useCallback((tf: TimeFormat) => {
    setTfState(tf);
    void persistTimeFormat(tf);
  }, []);

  const value = useMemo<LanguageState>(
    () => ({
      lang,
      ready,
      setLang,
      t: (key, params) => translate(lang, key, params),
      timeFormat,
      setTimeFormat,
      formatClock: (hhmm) => fmtClock(hhmm, timeFormat),
      formatTime: (d) => fmtTime(d, timeFormat),
    }),
    [lang, ready, setLang, timeFormat, setTimeFormat],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n(): LanguageState {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useI18n must be used within LanguageProvider');
  return ctx;
}
