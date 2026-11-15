import React, { useState } from 'react';
import { Alert, Linking, ScrollView, Text, TextInput, View } from 'react-native';
import { redeemCode } from '../api';
import { useApp } from '../AppContext';
import { rewardedInterstitialReady, showRewardedInterstitial } from '../ads';
import { Button, Card, Header } from '../components/ui';
import { PURCHASE_URL } from '../config';
import { C } from '../theme';

const Row = ({ t, free, prem }) => (
  <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderColor: C.line }}>
    <Text style={{ flex: 2, color: C.ink }}>{t}</Text><Text style={{ flex: 1, textAlign: 'center', color: C.muted }}>{free}</Text><Text style={{ flex: 1, textAlign: 'center', color: C.navy, fontWeight: '700' }}>{prem}</Text>
  </View>
);

export default function PremiumScreen() {
  const { me, premium, setToken, grantAdFree, adFree, online } = useApp();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const redeem = async () => {
    setBusy(true);
    try { const r = await redeemCode(code.trim()); await setToken(r.token); setCode(''); Alert.alert('Premium activated', `Valid until ${new Date(r.expires * 1000).toLocaleDateString()}.`); }
    catch (e) { Alert.alert('Could not activate', e.message); }
    setBusy(false);
  };
  const adFreeAd = async () => {
    if (!rewardedInterstitialReady()) return Alert.alert('Ad not ready', 'Please try again in a moment.');
    if (await showRewardedInterstitial()) { await grantAdFree(30); Alert.alert('Enjoy!', 'Ads are hidden for the next 30 minutes.'); }
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.light }}>
      <Header title="PDF MASTER Premium" sub={premium ? 'Premium is active' : 'Free plan'} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card>
          <Row t="" free="Free" prem="Premium" />
          <Row t="Daily conversions" free={me ? String(me.premium ? '5' : me.limit) : '5'} prem="Unlimited*" />
          <Row t="Max file size" free="20 MB" prem="100 MB" />
          <Row t="Batch conversion" free="–" prem="✔" />
          <Row t="Signatures & notes" free="–" prem="✔" />
          <Row t="Advertisements" free="Yes" prem="None" />
          <Text style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>*Subject to fair-use limits.</Text>
        </Card>
        {me && <Card><Text style={{ color: C.ink }}>Today: {me.used} used · {me.remaining} left</Text>
          <Text style={{ color: C.muted, marginTop: 4, fontSize: 12 }}>Privacy: uploads are processed over an encrypted connection, originals are deleted right after processing and converted files are removed from our server after {me.retention_minutes} minutes.</Text></Card>}
        {!premium && !!PURCHASE_URL && <Button title="Get Premium" kind="accent" onPress={() => Linking.openURL(PURCHASE_URL)} style={{ marginBottom: 10 }} />}
        <Card>
          <Text style={{ fontWeight: '700', color: C.navy }}>Have an activation code?</Text>
          <TextInput value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} placeholder="Paste your code" style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, marginVertical: 10 }} />
          <Button title="Activate" onPress={redeem} busy={busy} disabled={!code.trim() || !online} />
        </Card>
        {!adFree && <Card>
          <Text style={{ fontWeight: '700', color: C.navy }}>Prefer to stay free?</Text>
          <Text style={{ color: C.muted, marginVertical: 6 }}>Watch one short video to hide ads for 30 minutes.</Text>
          <Button title="Watch video – ad-free for 30 min" kind="ghost" onPress={adFreeAd} />
        </Card>}
      </ScrollView>
    </View>
  );
}
