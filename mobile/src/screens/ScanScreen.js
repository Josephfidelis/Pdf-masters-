import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DocumentScanner from 'react-native-document-scanner-plugin';
import { downloadResult, runTool } from '../api';
import { useApp } from '../AppContext';
import { AdBanner } from '../components/Ads';
import { Button, Card, OfflineBanner } from '../components/ui';
import { localImagesToPdf } from '../localPdf';
import { addHistory } from '../storage';
import { C } from '../theme';

export default function ScanScreen({ navigation }) {
  const { online } = useApp();
  const [pages, setPages] = useState([]);
  const [busy, setBusy] = useState(null);

  const scan = async () => {
    try {
      // Native ML scanner: auto edge detection, perspective crop, works fully offline.
      const { scannedImages, status } = await DocumentScanner.scanDocument({ maxNumDocuments: 24, croppedImageQuality: 90 });
      if (status === 'success' && scannedImages?.length) setPages((p) => [...p, ...scannedImages.map((u) => ({ uri: u }))]);
    } catch {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Camera permission needed', 'Allow camera access in Settings to scan documents.');
      const r = await ImagePicker.launchCameraAsync({ quality: 0.9 });
      if (!r.canceled) setPages((p) => [...p, { uri: r.assets[0].uri }]);
    }
  };
  const importImgs = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1 });
    if (!r.canceled) setPages((p) => [...p, ...r.assets.map((a) => ({ uri: a.uri }))]);
  };
  const move = (i, d) => setPages((f) => { const n = [...f]; const j = i + d; if (j < 0 || j >= n.length) return f; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const saveLocal = async () => {
    setBusy('Creating PDF on your device…');
    try { const out = await localImagesToPdf(pages); await addHistory({ ...out, tool: 'scan' }); navigation.replace('Result', { ...out, tool: 'scan' }); }
    catch { Alert.alert('Could not create PDF', 'Something went wrong while saving. Please try again.'); }
    setBusy(null);
  };
  const saveOcr = async () => {
    setBusy('Recognising text…');
    try {
      const job = await runTool('scan-ocr', pages.map((p, i) => ({ uri: p.uri, name: `page${i + 1}.jpg`, mimeType: 'image/jpeg' })), { lang: 'eng' });
      const saved = await downloadResult({ ...job, filename: `Scan_${Date.now()}_searchable.pdf` });
      await addHistory({ ...saved, tool: 'scan-ocr' });
      navigation.replace('Result', { ...saved, tool: 'scan-ocr', meta: job.meta });
    } catch (e) { Alert.alert('Text recognition failed', e.message + '\n\nYou can still save a normal PDF.'); }
    setBusy(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.light }}>
      <OfflineBanner online={online} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: C.muted, marginBottom: 10 }}>Scan works without internet. Add pages, reorder them, then save as PDF.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="◎  Scan pages" onPress={scan} style={{ flex: 1 }} />
          <Button title="Import" kind="ghost" onPress={importImgs} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, marginHorizontal: -5 }}>
          {pages.map((p, i) => (
            <View key={p.uri + i} style={{ width: '33.33%', padding: 5 }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 10, padding: 4, borderWidth: 1, borderColor: C.line }}>
                <Image source={{ uri: p.uri }} style={{ width: '100%', aspectRatio: 0.72, borderRadius: 6 }} resizeMode="cover" />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Pressable onPress={() => move(i, -1)} hitSlop={6}><Text style={{ padding: 6, fontSize: 16 }}>‹</Text></Pressable>
                  <Text style={{ color: C.muted, fontSize: 12 }}>{i + 1}</Text>
                  <Pressable onPress={() => move(i, 1)} hitSlop={6}><Text style={{ padding: 6, fontSize: 16 }}>›</Text></Pressable>
                  <Pressable onPress={() => setPages(pages.filter((_, k) => k !== i))} hitSlop={6}><Text style={{ padding: 6, color: C.err }}>✕</Text></Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>
        {pages.length > 0 && (
          <Card style={{ marginTop: 14 }}>
            {busy ? <Text style={{ color: C.navy, fontWeight: '700' }}>{busy}</Text> : (<>
              <Button title={`Save ${pages.length} page${pages.length > 1 ? 's' : ''} as PDF`} onPress={saveLocal} />
              {online ? <Button title="Save as searchable PDF (OCR)" kind="accent" onPress={saveOcr} style={{ marginTop: 10 }} />
                : <Text style={{ color: C.muted, fontSize: 12, marginTop: 8, textAlign: 'center' }}>Go online to make the text searchable (OCR).</Text>}
            </>)}
          </Card>
        )}
      </ScrollView>
      <AdBanner />
    </View>
  );
}
