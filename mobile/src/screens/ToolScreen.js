import React, { useLayoutEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { downloadResult, runTool } from '../api';
import { useApp } from '../AppContext';
import { rewardedReady, showRewarded } from '../ads';
import { claimReward } from '../api';
import { AdBanner } from '../components/Ads';
import { Button, Card, OfflineBanner } from '../components/ui';
import { TOOLS } from '../config';
import { addHistory, fmtSize } from '../storage';
import { localImagesToPdf } from '../localPdf';
import { C } from '../theme';

const MIME = { pdf: ['application/pdf'], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] };

export default function ToolScreen({ route, navigation }) {
  const { tool, preset } = route.params;
  const T = TOOLS[tool];
  const { online, me, premium, refresh } = useApp();
  const [files, setFiles] = useState(preset || []);
  const [pages, setPages] = useState('');
  const [level, setLevel] = useState('medium');
  const [fmt, setFmt] = useState('png');
  const [phase, setPhase] = useState(null); // null | {label, pct}
  const [error, setError] = useState(null);
  useLayoutEffect(() => navigation.setOptions({ title: T.title }), [navigation, T.title]);

  const pick = async () => {
    setError(null);
    if (T.kind === 'image') {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1 });
      if (!r.canceled) setFiles((f) => [...f, ...r.assets.map((a) => ({ uri: a.uri, name: a.fileName || 'image.jpg', mimeType: a.mimeType || 'image/jpeg', size: a.fileSize }))]);
      return;
    }
    const r = await DocumentPicker.getDocumentAsync({ type: MIME[T.kind], multiple: T.multi || premium, copyToCacheDirectory: true });
    if (!r.canceled) setFiles((f) => (T.multi ? [...f, ...r.assets] : r.assets));
  };
  const move = (i, d) => setFiles((f) => { const n = [...f]; const j = i + d; if (j < 0 || j >= n.length) return f; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const min = T.min || 1;
  const ready = files.length >= min && (tool !== 'split' || pages.trim().length > 0);

  const finish = (saved, extra = {}) => navigation.replace('Result', { ...saved, tool, ...extra });

  const convert = async () => {
    setError(null);
    try {
      if (T.offline && !online) {                      // Image to PDF works fully offline
        setPhase({ label: 'Creating PDF on your device…', pct: null });
        const out = await localImagesToPdf(files);
        await addHistory({ ...out, tool });
        return finish(out);
      }
      if (!online) throw Object.assign(new Error('This tool needs an internet connection. Scan and Image to PDF work offline.'), { code: 'offline' });
      setPhase({ label: 'Uploading…', pct: 0 });
      const job = await runTool(tool, files, { pages, level, fmt }, (_, p) => setPhase({ label: p < 1 ? 'Uploading…' : 'Converting…', pct: p < 1 ? p : null }));
      setPhase({ label: 'Downloading result…', pct: null });
      const saved = await downloadResult(job);
      await addHistory({ ...saved, tool });
      refresh();
      finish(saved, { warning: job.meta?.warning, meta: job.meta, inputSize: job.input_size });
    } catch (e) {
      setPhase(null);
      if (e.code === 'daily_limit') return limitDialog();
      if (e.code === 'premium_required' || e.code === 'file_too_large') {
        return Alert.alert(e.code === 'file_too_large' ? 'File too large' : 'Premium feature', e.message + '\n\nUpgrade to Premium for larger files and batch conversion.', [{ text: 'Not now' }, { text: 'See Premium', onPress: () => navigation.navigate('Tabs', { screen: 'Premium' }) }]);
      }
      setError(e.message || 'Something went wrong.');
    }
  };
  const limitDialog = () => Alert.alert("Today's free conversions are used", 'Watch a short ad for 3 more conversions, or go Premium.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Watch ad (+3)', onPress: async () => { if (!rewardedReady()) return Alert.alert('Ad not ready', 'Please try again in a moment.'); if (await showRewarded()) { try { await claimReward(); await refresh(); } catch (e) { setError(e.message); } } } },
    { text: 'Go Premium', onPress: () => navigation.navigate('Tabs', { screen: 'Premium' }) },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: C.light }}>
      <OfflineBanner online={online} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: C.muted, marginBottom: 10 }}>{T.hint}</Text>
        <Card>
          {files.length === 0 && <Text style={{ color: C.muted, marginBottom: 10 }}>No file selected yet.</Text>}
          {files.map((f, i) => (
            <View key={f.uri + i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: C.line }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: C.ink, fontWeight: '600' }}>{f.name}</Text>
                <Text style={{ color: C.muted, fontSize: 12 }}>{fmtSize(f.size)}</Text>
              </View>
              {T.multi && files.length > 1 && <><Pressable onPress={() => move(i, -1)} hitSlop={8}><Text style={{ fontSize: 20, padding: 6 }}>↑</Text></Pressable><Pressable onPress={() => move(i, 1)} hitSlop={8}><Text style={{ fontSize: 20, padding: 6 }}>↓</Text></Pressable></>}
              <Pressable onPress={() => setFiles(files.filter((_, k) => k !== i))} hitSlop={8}><Text style={{ fontSize: 18, padding: 6, color: C.err }}>✕</Text></Pressable>
            </View>
          ))}
          <Button kind="ghost" title={files.length ? (T.multi ? '+ Add more files' : 'Choose a different file') : 'Choose file' + (T.multi ? 's' : '')} onPress={pick} style={{ marginTop: 10 }} />
        </Card>
        {T.pages && <Card><Text style={{ fontWeight: '700', color: C.ink }}>Pages to extract</Text>
          <TextInput value={pages} onChangeText={setPages} placeholder="e.g. 1-3,5,8-" autoCapitalize="none" style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, marginTop: 8 }} /></Card>}
        {T.level && <Card><Text style={{ fontWeight: '700', color: C.ink, marginBottom: 8 }}>Compression</Text>
          <Seg value={level} set={setLevel} opts={[['low', 'Low (best quality)'], ['medium', 'Medium'], ['high', 'High (smallest)']]} /></Card>}
        {T.fmt && <Card><Text style={{ fontWeight: '700', color: C.ink, marginBottom: 8 }}>Image format</Text>
          <Seg value={fmt} set={setFmt} opts={[['png', 'PNG'], ['jpg', 'JPG']]} /></Card>}
        {!!error && <Text style={{ color: C.err, marginBottom: 10 }} accessibilityLiveRegion="polite">{error}</Text>}
        {phase ? (
          <Card>
            <Text style={{ fontWeight: '700', color: C.navy }}>{phase.label}</Text>
            <View style={{ height: 10, backgroundColor: C.light, borderRadius: 5, marginTop: 10, overflow: 'hidden' }}>
              <View style={{ width: phase.pct == null ? '100%' : `${Math.round(phase.pct * 100)}%`, height: 10, backgroundColor: phase.pct == null ? C.blue + '88' : C.blue }} />
            </View>
            <Text style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>Keep the app open until this finishes.</Text>
          </Card>
        ) : <Button title={`Convert to ${T.out}`.replace('Convert to PDF', 'Create PDF')} onPress={convert} disabled={!ready} />}
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 12, textAlign: 'center' }}>
          Files are sent over an encrypted connection{me ? ` and results are deleted from our server after ${me.retention_minutes} minutes` : ''}. Your original is deleted immediately after processing.
        </Text>
      </ScrollView>
      <AdBanner />
    </View>
  );
}
const Seg = ({ value, set, opts }) => (
  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
    {opts.map(([k, l]) => <Pressable key={k} onPress={() => set(k)} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: value === k ? C.navy : C.light }}><Text style={{ color: value === k ? '#fff' : C.navy, fontWeight: '600' }}>{l}</Text></Pressable>)}
  </View>
);
