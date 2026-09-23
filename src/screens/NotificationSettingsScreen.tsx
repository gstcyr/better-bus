import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../components/ui';
import { LanguageToggle } from '../components/LanguageToggle';
import { TimeFormatToggle } from '../components/TimeFormatToggle';
import { useI18n } from '../i18n/LanguageContext';
import { localDateKey } from '../notifications/eta';
import {
  cancelArrivingSoon,
  refreshAdvanceAlerts,
  sendTestNotification,
} from '../notifications/schedule';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  sleepDateKeyForDays,
  type NotificationSettings,
} from '../notifications/settings';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationSettings'>;

function Stepper({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  compact,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.stepper, compact && styles.stepperCompact]}>
      <Pressable
        style={[styles.stepBtn, value <= min && styles.stepBtnOff]}
        onPress={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
      >
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Text style={[styles.stepValue, compact && styles.stepValueCompact]}>
        {value} {suffix}
      </Text>
      <Pressable
        style={[styles.stepBtn, value >= max && styles.stepBtnOff]}
        onPress={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
      >
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

export default function NotificationSettingsScreen(_props: Props) {
  const { username } = useAuth();
  const { t } = useI18n();
  const [s, setS] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [sleepDays, setSleepDays] = useState(7);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSettings().then((v) => {
      setS(v);
      setLoaded(true);
    });
  }, []);

  // Persist and re-apply scheduling on any change (once loaded).
  async function update(patch: Partial<NotificationSettings>) {
    const next = { ...s, ...patch };
    setS(next);
    await saveSettings(next);
    if (username) await refreshAdvanceAlerts(username, next);
  }

  const sleeping = !!s.sleepUntilDateKey && localDateKey() < s.sleepUntilDateKey;
  const skippedToday = s.skipDateKey === localDateKey();

  async function onSkipToday() {
    await update({ skipDateKey: localDateKey() });
    await cancelArrivingSoon();
  }

  async function onSleep() {
    await update({ sleepUntilDateKey: sleepDateKeyForDays(sleepDays) });
    await cancelArrivingSoon();
  }

  async function onResume() {
    await update({ sleepUntilDateKey: null, skipDateKey: null });
  }

  if (!loaded) return <SafeAreaView style={styles.safe} />;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.row}>
            <Text style={styles.rowTitle}>{t('notif.language')}</Text>
            <LanguageToggle onSurface />
          </View>
          <View style={[styles.row, { marginTop: spacing.lg }]}>
            <Text style={styles.rowTitle}>{t('notif.timeFormat')}</Text>
            <TimeFormatToggle onSurface />
          </View>
        </Card>

        <Card>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t('notif.masterTitle')}</Text>
              <Text style={styles.rowSub}>{t('notif.masterSub')}</Text>
            </View>
            <Switch
              value={s.enabled}
              onValueChange={(v) => update({ enabled: v })}
              trackColor={{ true: colors.primaryLight }}
              thumbColor={s.enabled ? colors.primary : undefined}
            />
          </View>
        </Card>

        <Card style={s.enabled ? undefined : styles.disabled}>
          <Text style={styles.sectionLabel}>{t('notif.advanceLabel')}</Text>
          <Text style={styles.rowSub}>{t('notif.advanceSub')}</Text>
          <Stepper
            value={s.leadMinutes}
            onChange={(v) => update({ leadMinutes: v })}
            min={5}
            max={60}
            step={5}
            suffix={t('notif.minBeforeSuffix')}
          />
        </Card>

        <Card style={s.enabled ? undefined : styles.disabled}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.sectionLabel}>{t('notif.soonLabel')}</Text>
              <Text style={styles.rowSub}>{t('notif.soonSub')}</Text>
            </View>
            <Switch
              value={s.soonEnabled}
              onValueChange={(v) => update({ soonEnabled: v })}
              trackColor={{ true: colors.primaryLight }}
              thumbColor={s.soonEnabled ? colors.primary : undefined}
            />
          </View>
          {s.soonEnabled && (
            <Stepper
              value={s.soonMinutes}
              onChange={(v) => update({ soonMinutes: v })}
              min={1}
              max={15}
              step={1}
              suffix={t('notif.minBeforeSuffix')}
            />
          )}
        </Card>

        <Card>
          <Text style={styles.sectionLabel}>{t('notif.pauseLabel')}</Text>
          {sleeping ? (
            <>
              <Text style={styles.pausedText}>
                {t('notif.pausedUntil', { date: s.sleepUntilDateKey ?? '' })}
              </Text>
              <Pressable style={styles.resumeBtn} onPress={onResume}>
                <Text style={styles.resumeText}>{t('notif.resumeNow')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                style={[styles.skipBtn, skippedToday && styles.skipBtnDone]}
                onPress={onSkipToday}
                disabled={skippedToday}
              >
                <Text style={styles.skipText}>
                  {skippedToday
                    ? t('notif.skippedToday')
                    : t('notif.skipToday')}
                </Text>
              </Pressable>

              <Text style={[styles.rowSub, { marginTop: spacing.lg }]}>
                {t('notif.sleepPrompt')}
              </Text>
              <View style={styles.sleepRow}>
                <Stepper
                  value={sleepDays}
                  onChange={setSleepDays}
                  min={1}
                  max={60}
                  step={1}
                  suffix={t('notif.daysSuffix')}
                  compact
                />
                <Pressable style={styles.sleepBtn} onPress={onSleep}>
                  <Text style={styles.sleepText}>{t('notif.sleep')}</Text>
                </Pressable>
              </View>
            </>
          )}
        </Card>

        <Pressable style={styles.testBtn} onPress={() => sendTestNotification()}>
          <Text style={styles.testText}>{t('notif.sendTest')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  disabled: { opacity: 0.45 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  stepperCompact: {
    justifyContent: 'flex-start',
    gap: spacing.sm,
    marginTop: 0,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnOff: { backgroundColor: colors.primaryLight, opacity: 0.5 },
  stepBtnText: { color: colors.onPrimary, fontSize: 24, fontWeight: '800' },
  stepValue: { fontSize: 17, fontWeight: '700', color: colors.text },
  stepValueCompact: { minWidth: 72, textAlign: 'center' },
  skipBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.scrim,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  skipBtnDone: { opacity: 0.6 },
  skipText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  sleepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  sleepBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  sleepText: { color: colors.onPrimary, fontWeight: '800', fontSize: 15 },
  pausedText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.warning,
    marginTop: spacing.sm,
  },
  resumeBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  resumeText: { color: colors.onPrimary, fontWeight: '800', fontSize: 15 },
  testBtn: { alignItems: 'center', paddingVertical: spacing.md },
  testText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
});
