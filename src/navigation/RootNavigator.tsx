import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, Text } from 'react-native';
import LoginScreen from '../screens/LoginScreen';
import MapScreen from '../screens/MapScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import RoutePickerScreen from '../screens/RoutePickerScreen';
import StopDetailScreen from '../screens/StopDetailScreen';
import StopsScreen from '../screens/StopsScreen';
import { useI18n } from '../i18n/LanguageContext';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function SignOutButton() {
  const { signOut } = useAuth();
  const { t } = useI18n();
  return (
    <Pressable onPress={() => signOut()} hitSlop={12}>
      <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 15 }}>
        {t('stops.signOut')}
      </Text>
    </Pressable>
  );
}

const headerBase = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.onPrimary,
  headerTitleStyle: { fontWeight: '800' as const },
};

export default function RootNavigator() {
  const { username } = useAuth();
  const { t } = useI18n();

  return (
    <Stack.Navigator screenOptions={headerBase}>
      {username == null ? (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="Map"
            component={MapScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="RoutePicker"
            component={RoutePickerScreen}
            options={{ title: t('route.title') }}
          />
          <Stack.Screen
            name="Stops"
            component={StopsScreen}
            options={{ title: t('stops.title'), headerRight: () => <SignOutButton /> }}
          />
          <Stack.Screen
            name="StopDetail"
            component={StopDetailScreen}
            options={{ title: t('stopDetail.title') }}
          />
          <Stack.Screen
            name="NotificationSettings"
            component={NotificationSettingsScreen}
            options={{ title: t('notif.settingsTitle') }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
