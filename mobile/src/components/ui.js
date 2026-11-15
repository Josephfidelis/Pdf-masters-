import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { C, R } from '../theme';

export function Logo({ size = 44 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect width="64" height="64" rx="14" fill={C.navy} />
      <Path d="M17 10h20l12 12v32H17z" fill="#fff" />
      <Path d="M37 10l12 12H37z" fill={C.blue} />
      <Rect x="23" y="30" width="20" height="4" rx="2" fill={C.navy} />
      <Rect x="23" y="39" width="14" height="4" rx="2" fill={C.blue} />
      <Rect x="23" y="48" width="18" height="3" rx="1.5" fill={C.navy} />
    </Svg>
  );
}
export function Header({ title, sub }) {
  return (
    <View style={s.header}>
      <Logo />
      <View style={{ marginLeft: 12 }}>
        <Text style={s.hTitle}>{title || 'PDF MASTER'}</Text>
        <Text style={s.hSub}>{sub || 'Convert • Edit • Manage'}</Text>
      </View>
    </View>
  );
}
export function Button({ title, onPress, kind = 'primary', disabled, busy, style }) {
  const bg = kind === 'primary' ? C.navy : kind === 'accent' ? C.blue : '#fff';
  const fg = kind === 'ghost' ? C.navy : '#fff';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, borderWidth: kind === 'ghost' ? 1 : 0, borderColor: C.line }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnT, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}
export const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;
export const OfflineBanner = ({ online }) => (online ? null : <View style={s.off}><Text style={s.offT}>You're offline. Scan, Image to PDF, viewing and your saved files still work.</Text></View>);

export const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.navy, padding: 16, paddingTop: 20 },
  hTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  hSub: { color: '#9CC9F0', fontSize: 13, marginTop: 2 },
  btn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  btnT: { fontSize: 16, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: R, padding: 16, marginBottom: 12, shadowColor: '#0B2A5B', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  off: { backgroundColor: '#FFF4D6', padding: 8 }, offT: { color: C.warn, fontSize: 13, textAlign: 'center' },
});
