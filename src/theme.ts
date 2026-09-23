// Central design tokens. The original app was a flat blue; this refresh keeps the
// transit-blue identity but modernizes spacing, contrast, and status colors.

export const colors = {
  primary: '#1565C0',
  primaryDark: '#0D3F82',
  primaryLight: '#5E92F3',
  accent: '#FFB300',
  bg: '#F4F6F8',
  surface: '#FFFFFF',
  text: '#1A2027',
  textMuted: '#5B6B7B',
  border: '#E1E6EB',
  success: '#2E7D32',
  warning: '#ED6C02',
  danger: '#C62828',
  onPrimary: '#FFFFFF',
  scrim: 'rgba(13,63,130,0.06)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: '#0D3F82',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
};
