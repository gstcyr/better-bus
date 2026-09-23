import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, PrimaryButton } from '../components/ui';
import { LanguageToggle } from '../components/LanguageToggle';
import { useI18n } from '../i18n/LanguageContext';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const REGISTER_URL = 'https://mybusstop.ca/registration.aspx';
const FORGOT_URL = 'https://www.mybusstop.ca/ForgotPassword.aspx';
const PRIVACY_URL = 'https://www.mybusstop.ca/Privacy.html';

export default function LoginScreen({ navigation }: Props) {
  const { signIn, savedCredentials, autoLoginError } = useAuth();
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (savedCredentials) {
      setUsername(savedCredentials.username);
      setPassword(savedCredentials.password);
      setRemember(true);
    }
  }, [savedCredentials]);

  useEffect(() => {
    if (autoLoginError) {
      setError(t('login.autoFailed'));
    }
  }, [autoLoginError, t]);

  async function onLogin() {
    Keyboard.dismiss();
    setError(null);
    if (!username.trim() || !password) {
      setError(t('login.enterCreds'));
      return;
    }
    setLoading(true);
    try {
      const ok = await signIn(username.trim(), password, remember);
      if (ok) {
        navigation.replace('Map');
      } else {
        setError(t('login.badCreds'));
      }
    } catch {
      setError(t('login.serverError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <LanguageToggle onSurface />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <Image
                source={require('../../assets/bus-logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.title}>MyBusStop</Text>
              <Text style={styles.subtitle}>{t('login.tagline')}</Text>
            </View>

            <Card>
              <Text style={styles.label}>{t('login.username')}</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('login.username').toLowerCase()}
                placeholderTextColor={colors.textMuted}
                returnKeyType="next"
              />

              <Text style={styles.label}>{t('login.password')}</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                returnKeyType="go"
                onSubmitEditing={onLogin}
              />

              <View style={styles.rememberRow}>
                <Text style={styles.rememberText}>{t('login.rememberMe')}</Text>
                <Switch
                  value={remember}
                  onValueChange={setRemember}
                  trackColor={{ true: colors.primaryLight }}
                  thumbColor={remember ? colors.primary : undefined}
                />
              </View>

              {error && <Text style={styles.error}>{error}</Text>}

              <PrimaryButton
                title={t('login.signIn')}
                onPress={onLogin}
                loading={loading}
              />
            </Card>

            <View style={styles.links}>
              <Text style={styles.link} onPress={() => Linking.openURL(REGISTER_URL)}>
                {t('login.notRegistered')}
              </Text>
              <Text style={styles.link} onPress={() => Linking.openURL(FORGOT_URL)}>
                {t('login.forgotPassword')}
              </Text>
              <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)}>
                {t('login.privacy')}
              </Text>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.xl,
  },
  topBar: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  header: { alignItems: 'center', gap: spacing.sm },
  logo: {
    width: 220,
    height: 128,
  },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 15, color: colors.textMuted },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.lg,
  },
  rememberText: { fontSize: 15, color: colors.text },
  error: { color: colors.danger, marginBottom: spacing.md, fontSize: 14 },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  link: { color: colors.primary, fontSize: 14, fontWeight: '600' },
});
