import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parseAspNetDate, setMyStop } from '../api/client';
import { cacheHomeStop } from '../api/nextService';
import { refreshAdvanceAlerts } from '../notifications/schedule';
import { Card, PrimaryButton } from '../components/ui';
import { useI18n } from '../i18n/LanguageContext';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'StopDetail'>;

export default function StopDetailScreen({ navigation, route }: Props) {
  const { stop } = route.params;
  const { username } = useAuth();
  const { t, formatClock, formatTime } = useI18n();
  const [isMyStop, setIsMyStop] = useState(!!stop.is_mystop);
  const [saving, setSaving] = useState(false);

  const scheduled = formatClock(stop.stop_schedule_time_format) ?? '—';
  const actualDate = parseAspNetDate(stop.stop_arrival_time);
  const actual = actualDate ? formatTime(actualDate) : '—';

  async function onSave() {
    if (!username) return;
    if (!isMyStop) {
      navigation.goBack();
      return;
    }
    setSaving(true);
    try {
      await setMyStop(username, stop.stop_id);
      // Remember the location so the "next service" card can show the pick-up time.
      if (stop.stop_location) void cacheHomeStop(stop.stop_location);
      // Reschedule the advance alerts now that this route has a "my stop".
      void refreshAdvanceAlerts(username);
      Alert.alert(t('stopDetail.savedTitle'), t('stopDetail.savedBody'), [
        { text: t('common.ok'), onPress: () => navigation.popToTop() },
      ]);
    } catch {
      Alert.alert(t('stopDetail.saveFailTitle'), t('stopDetail.saveFailBody'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.content}>
        <Card>
          <Text style={styles.title}>{stop.stop_location}</Text>
          <Text style={styles.meta}>{t('stopDetail.stopNum', { id: stop.id })}</Text>

          <View style={styles.timesRow}>
            <View style={styles.timeCol}>
              <Text style={styles.timeLabel}>{t('stopDetail.scheduled')}</Text>
              <Text style={styles.timeValue}>{scheduled}</Text>
            </View>
            <View style={styles.timeCol}>
              <Text style={styles.timeLabel}>{t('stopDetail.actual')}</Text>
              <Text style={styles.timeValue}>{actual}</Text>
            </View>
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('stopDetail.setMyStop')}</Text>
            <Switch
              value={isMyStop}
              onValueChange={setIsMyStop}
              trackColor={{ true: colors.primaryLight }}
              thumbColor={isMyStop ? colors.primary : undefined}
            />
          </View>
        </Card>

        <PrimaryButton title={t('stopDetail.done')} onPress={onSave} loading={saving} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  timesRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg },
  timeCol: { flex: 1 },
  timeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeValue: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 2 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  switchLabel: { fontSize: 16, color: colors.text, fontWeight: '600' },
});
