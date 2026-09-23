import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider, useI18n } from './src/i18n/LanguageContext';
import { loadLang, loadTimeFormat } from './src/i18n/i18n';
import { navigate, navigationRef } from './src/navigation/navigationRef';
import RootNavigator from './src/navigation/RootNavigator';
import { localDateKey } from './src/notifications/eta';
import { cancelArrivingSoon, setupNotifications, SKIP_ACTION } from './src/notifications/schedule';
import { loadSettings, saveSettings } from './src/notifications/settings';
import { AuthProvider, useAuth } from './src/state/AuthContext';
import { colors } from './src/theme';

async function handleResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as
    | { routeId?: string }
    | undefined;

  if (response.actionIdentifier === SKIP_ACTION) {
    const s = await loadSettings();
    await saveSettings({ ...s, skipDateKey: localDateKey() });
    await cancelArrivingSoon();
    return;
  }
  if (data?.routeId) {
    navigate('Map', { routeId: data.routeId });
  }
}

function Gate() {
  const { restoring, username } = useAuth();
  const { ready: langReady } = useI18n();
  const pendingRouteId = useRef<string | null>(null);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      void handleResponse(r);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (!r || r.actionIdentifier === SKIP_ACTION) return;
      const data = r.notification.request.content.data as
        | { routeId?: string }
        | undefined;
      if (data?.routeId) pendingRouteId.current = data.routeId;
    });
  }, []);

  useEffect(() => {
    if (username && pendingRouteId.current) {
      const id = pendingRouteId.current;
      pendingRouteId.current = null;
      setTimeout(() => navigate('Map', { routeId: id }), 300);
    }
  }, [username]);

  if (restoring || !langReady) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return (
    <NavigationContainer ref={navigationRef}>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => {
    // Load language + time format before wiring notifications so text localizes.
    Promise.all([loadLang(), loadTimeFormat()]).then(() => setupNotifications());
  }, []);

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Gate />
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
