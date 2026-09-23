import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useI18n } from '../i18n/LanguageContext';
import type { Lang } from '../i18n/strings';
import { refreshAdvanceAlerts } from '../notifications/schedule';
import { useAuth } from '../state/AuthContext';
import { colors, radius, spacing } from '../theme';

const OPTIONS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
];

/** Compact EN / FR segmented control. */
export function LanguageToggle({
  style,
  onSurface = false,
}: {
  style?: ViewStyle;
  onSurface?: boolean;
}) {
  const { lang, setLang } = useI18n();
  const { username } = useAuth();

  function choose(code: Lang) {
    if (code === lang) return;
    setLang(code);
    // Reschedule so notification text reflects the new language immediately.
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
        const active = o.code === lang;
        return (
          <Pressable
            key={o.code}
            onPress={() => choose(o.code)}
            style={[styles.seg, active && styles.segActive]}
          >
            <Text
              style={[
                styles.segText,
                { color: active ? colors.primary : onSurface ? colors.textMuted : '#fff' },
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
  wrap: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    padding: 3,
  },
  seg: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  segActive: { backgroundColor: '#fff' },
  segText: { fontSize: 13, fontWeight: '800' },
});
