import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { authenticateUser } from '../api/client';

const STORAGE_KEY = 'mybusstop.credentials.v1';

interface StoredCredentials {
  username: string;
  password: string;
}

interface AuthState {
  username: string | null;
  /** True while restoring saved credentials and attempting auto-login on cold start. */
  restoring: boolean;
  signIn: (
    username: string,
    password: string,
    remember: boolean,
  ) => Promise<boolean>;
  signOut: () => Promise<void>;
  /** Credentials remembered on this device, if any (used to prefill login). */
  savedCredentials: StoredCredentials | null;
  /** Set when an automatic sign-in with saved credentials failed (e.g. offline). */
  autoLoginError: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [savedCredentials, setSavedCredentials] =
    useState<StoredCredentials | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [autoLoginError, setAutoLoginError] = useState(false);

  // On cold start: load remembered credentials and, if present, try to sign in
  // automatically. On any failure we fall through to the (prefilled) login screen.
  useEffect(() => {
    (async () => {
      let creds: StoredCredentials | null = null;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) creds = JSON.parse(raw);
      } catch {
        // ignore corrupt storage
      }
      if (creds) {
        setSavedCredentials(creds);
        try {
          const ok = await authenticateUser(creds.username, creds.password);
          if (ok) setUsername(creds.username);
          else setAutoLoginError(true);
        } catch {
          setAutoLoginError(true);
        }
      }
      setRestoring(false);
    })();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      username,
      restoring,
      savedCredentials,
      autoLoginError,
      async signIn(u, p, remember) {
        const ok = await authenticateUser(u, p);
        if (!ok) return false;
        setAutoLoginError(false);
        setUsername(u);
        if (remember) {
          const creds = { username: u, password: p };
          setSavedCredentials(creds);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
        } else {
          setSavedCredentials(null);
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
        return true;
      },
      async signOut() {
        // Full logout: forget the remembered credentials so the next cold start
        // does not immediately auto-login again.
        setUsername(null);
        setSavedCredentials(null);
        setAutoLoginError(false);
        await AsyncStorage.removeItem(STORAGE_KEY);
      },
    }),
    [username, restoring, savedCredentials, autoLoginError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
