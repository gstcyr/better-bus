import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parseAspNetDate } from '../api/client';
import { useI18n } from '../i18n/LanguageContext';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Stops'>;

export default function StopsScreen({ navigation, route }: Props) {
  const { stops } = route.params;
  const { t, formatClock, formatTime } = useI18n();

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={stops}
        keyExtractor={(item, i) => `${item.stop_id}-${i}`}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => {
          const isSchool =
            (item.stop_location_type_description ?? '').toLowerCase() === 'school';
          const arrivalDate = parseAspNetDate(item.stop_arrival_time);
          const actual = arrivalDate ? formatTime(arrivalDate) : null;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => navigation.navigate('StopDetail', { stop: item })}
            >
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: item.is_mystop
                      ? colors.accent
                      : isSchool
                        ? colors.primaryDark
                        : colors.primary,
                  },
                ]}
              >
                <Text style={styles.badgeText}>
                  {isSchool ? '★' : item.id}
                </Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.stop_location}
                </Text>
                <Text style={styles.sub}>
                  {item.stop_schedule_time_format
                    ? t('stops.sched', {
                        t: formatClock(item.stop_schedule_time_format) ?? '',
                      })
                    : t('stops.noSchedule')}
                  {actual ? `   ·   ${t('stops.actual', { t: actual })}` : ''}
                </Text>
              </View>
              {item.is_mystop && (
                <Text style={styles.myStopTag}>{t('stops.myStopTag')}</Text>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>{t('stops.empty')}</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg },
  sep: { height: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.scrim },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  rowText: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  myStopTag: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 0.5,
  },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
