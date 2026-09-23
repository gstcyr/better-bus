import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useI18n } from '../i18n/LanguageContext';
import type { TimeFormat } from '../i18n/i18n';
import { refreshAdvanceAlerts } from '../notifications/schedule';
import { useAuth } from '../state/AuthContext';
import { colors, radius, spacing } from '../theme';

const OPTIONS: { code: TimeFormat; label: string }[] = [
  { code: '12h', label: '12h' },
  { code: '24h', label: '24h' },
];

/** Compact 12h / 24h segmented control. */
export function TimeFormatToggle({
  style,
  onSurface = false,
}: {
  style?: ViewStyle;
  onSurface?: boolean;
}) {
  const { timeFormat, setTimeFormat } = useI18n();
  const { username } = useAuth();

  function choose(code: TimeFormat) {
    if (code === timeFormat) return;
    setTimeFormat(code);
    // Reschedule so notification text reflects the new time format immediately.
    if (username) void refreshAdvanceAlerts(username);
  }

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: onSurface ? colors.scrim : 'rgba(255,255,255,0.2)' },
        style,
      ]}
    >
      {OPTIONS.map((o) => {
        const active = o.code === timeFormat;
        return (
          <Pressable
            key={o.code}
            onPress={() => choose(o.code)}
            style={[styles.seg, active && styles.segActive]}
          >
            <Text
              style={[
                styles.segText,
                {
                  color: active
                    ? colors.primary
                    : onSurface
                      ? colors.textMuted
                      : '#fff',
                },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderRadius: radius.pill, padding: 3 },
  seg: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  segActive: { backgroundColor: '#fff' },
  segText: { fontSize: 13, fontWeight: '800' },
});
