import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../i18n/LanguageContext';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RoutePicker'>;

export default function RoutePickerScreen({ navigation, route }: Props) {
  const { routes, currentRouteId } = route.params;
  const { t } = useI18n();

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={routes}
        keyExtractor={(item) => String(item.route_detail_id)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => {
          const selected = String(item.route_detail_id) === currentRouteId;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() =>
                navigation.navigate('Map', {
                  routeId: String(item.route_detail_id),
                })
              }
            >
              <View style={styles.rowText}>
                <Text style={styles.routeName}>{item.routeName}</Text>
                <Text style={styles.routeId}>
                  {t('route.routeId', { id: String(item.route_detail_id) })}
                </Text>
              </View>
              {selected && <Text style={styles.check}>✓</Text>}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>{t('route.empty')}</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: 0 },
  sep: { height: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.scrim },
  rowText: { flex: 1 },
  routeName: { fontSize: 16, fontWeight: '700', color: colors.text },
  routeId: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  check: { fontSize: 20, color: colors.primary, fontWeight: '800' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
