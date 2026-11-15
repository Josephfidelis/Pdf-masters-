import React, { useEffect } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { useApp } from '../AppContext';
import { maybeShowInterstitial } from '../ads';
import { AdBanner } from '../components/Ads';
import { Button, Card } from '../components/ui';
import { TOOLS } from '../config';
import { fmtSize } from '../storage';
import { C } from '../theme';

export default function ResultScreen({ route, navigation }) {
  const { uri, name, size, tool, warning, meta, inputSize } = route.params;
  const { adFree } = useApp();
  const isPdf = name.toLowerCase().endsWith('.pdf');
  useEffect(() => { maybeShowInterstitial(adFree); }, [adFree]);
  const share = async () => {
    if (!(await Sharing.isAvailableAsync())) return Alert.alert('Not available', 'Sharing is not available on this device. Your file is saved in the Files tab.');
    Sharing.shareAsync(uri, { dialogTitle: 'Save or share ' + name });
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.light }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 44, color: C.ok }}>✔</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.navy }}>Conversion complete</Text>
          <Text style={{ color: C.ink, marginTop: 8, textAlign: 'center' }}>{name}</Text>
          <Text style={{ color: C.muted, marginTop: 4 }}>{fmtSize(size)}{tool === 'compress' && meta?.before ? ` (was ${fmtSize(meta.before)})` : inputSize ? ` · original ${fmtSize(inputSize)}` : ''}</Text>
          {meta?.pages ? <Text style={{ color: C.muted }}>{meta.pages} page{meta.pages > 1 ? 's' : ''}</Text> : null}
        </Card>
        {!!warning && <Card style={{ backgroundColor: '#FFF4D6' }}><Text style={{ color: C.warn }}>{warning}</Text></Card>}
        {isPdf && <Button title="Preview" kind="accent" onPress={() => navigation.navigate('Viewer', { uri, name })} style={{ marginBottom: 10 }} />}
        <Button title="Download / Share" onPress={share} style={{ marginBottom: 10 }} />
        <Button title="Back to Home" kind="ghost" onPress={() => navigation.popToTop()} />
        <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 14 }}>Saved in the Files tab on this device.</Text>
      </ScrollView>
      <AdBanner />
    </View>
  );
}
