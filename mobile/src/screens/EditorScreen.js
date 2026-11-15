import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, PanResponder, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { API_URL } from '../config';
import { downloadResult, postJson, runTool } from '../api';
import { useApp } from '../AppContext';
import { Button } from '../components/ui';
import { addHistory } from '../storage';
import { C } from '../theme';

const MODES = [['text', 'Text'], ['highlight', 'Highlight'], ['signature', 'Sign ★'], ['note', 'Note ★']];

export default function EditorScreen({ route, navigation }) {
  const { premium, online } = useApp();
  const { width } = useWindowDimensions();
  const W = Math.min(width - 24, 760);
  const [doc, setDoc] = useState(null);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState('text');
  const [ops, setOps] = useState([]);
  const [draft, setDraft] = useState(null); // pending text input {type,x,y}
  const [text, setText] = useState('');
  const [rect, setRect] = useState(null);
  const [busy, setBusy] = useState(false);
  const modeRef = useRef(mode); modeRef.current = mode;
  const pageRef = useRef(page); pageRef.current = page;
  const start = useRef(null);

  const open = async (file) => {
    if (!online) return Alert.alert('Offline', 'The editor needs an internet connection.');
    setBusy(true);
    try { setDoc(await runTool(null, [file], {}, () => {}, 'file', '/api/edit/open')); }
    catch (e) { Alert.alert('Could not open PDF', e.message); }
    setBusy(false);
  };
  useEffect(() => { if (route.params?.file) open(route.params.file); }, []);
  const choose = async () => { const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (!r.canceled) open(r.assets[0]); };

  const H = doc ? W * (doc.sizes[page - 1][1] / doc.sizes[page - 1][0]) : 0;
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => { start.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }; setRect(null); },
    onPanResponderMove: (e, g) => { if (modeRef.current === 'highlight') setRect({ x0: start.current.x, y0: start.current.y, x1: start.current.x + g.dx, y1: start.current.y + g.dy }); },
    onPanResponderRelease: (e, g) => {
      const s = start.current;
      if (modeRef.current === 'highlight') { if (Math.abs(g.dx) > 8 && Math.abs(g.dy) > 4) setDraft({ type: 'highlight', x0: s.x, y0: s.y, x1: s.x + g.dx, y1: s.y + g.dy, auto: true }); setRect(null); }
      else setDraft({ type: modeRef.current, x: s.x, y: s.y });
    },
  })).current;

  useEffect(() => { // highlights need no text: commit immediately
    if (draft?.auto) { setOps((o) => [...o, { type: 'highlight', page: pageRef.current, rect: [draft.x0 / W, draft.y0 / H, draft.x1 / W, draft.y1 / H] }]); setDraft(null); }
  }, [draft]);

  const pickMode = (m) => { if ((m === 'signature' || m === 'note') && !premium) return Alert.alert('Premium feature', 'Signatures and notes are part of Premium.', [{ text: 'OK' }, { text: 'See Premium', onPress: () => navigation.navigate('Tabs', { screen: 'Premium' }) }]); setMode(m); };
  const commitText = () => {
    if (!text.trim()) return setDraft(null);
    setOps((o) => [...o, { type: draft.type, page, x: draft.x / W, y: draft.y / H, text: text.trim(), size: 16, color: '#000000' }]);
    setText(''); setDraft(null);
  };
  const apply = async () => {
    setBusy(true);
    try {
      const job = await postJson(`/api/edit/${doc.doc_id}/apply?t=${encodeURIComponent(doc.token)}`, { ops });
      const saved = await downloadResult(job);
      await addHistory({ ...saved, tool: 'editor' });
      navigation.replace('Result', { ...saved, tool: 'editor' });
    } catch (e) { Alert.alert('Could not save edits', e.message); }
    setBusy(false);
  };

  if (!doc) return (
    <View style={{ flex: 1, backgroundColor: C.light, padding: 16, justifyContent: 'center' }}>
      <Text style={{ textAlign: 'center', color: C.muted, marginBottom: 16 }}>Add text, highlights, signatures and notes to a PDF.</Text>
      <Button title="Choose a PDF to edit" onPress={choose} busy={busy} />
    </View>
  );
  const mine = ops.filter((o) => o.page === page);
  return (
    <View style={{ flex: 1, backgroundColor: C.light }}>
      <View style={{ flexDirection: 'row', padding: 8, gap: 6, flexWrap: 'wrap' }}>
        {MODES.map(([k, l]) => <Pressable key={k} onPress={() => pickMode(k)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: mode === k ? C.navy : '#fff' }}><Text style={{ color: mode === k ? '#fff' : C.navy, fontWeight: '700' }}>{l}</Text></Pressable>)}
        <Pressable onPress={() => setOps(ops.slice(0, -1))} style={{ padding: 8 }}><Text style={{ color: C.err, fontWeight: '700' }}>Undo</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 20 }}>
        <View style={{ width: W, height: H, backgroundColor: '#fff' }} {...pan.panHandlers}>
          <Image source={{ uri: `${API_URL}/api/edit/${doc.doc_id}/page/${page}?t=${encodeURIComponent(doc.token)}&w=${Math.round(W * 2)}` }} style={{ width: W, height: H }} pointerEvents="none" />
          {mine.map((o, i) => o.type === 'highlight'
            ? <View key={i} pointerEvents="none" style={{ position: 'absolute', left: Math.min(o.rect[0], o.rect[2]) * W, top: Math.min(o.rect[1], o.rect[3]) * H, width: Math.abs(o.rect[2] - o.rect[0]) * W, height: Math.abs(o.rect[3] - o.rect[1]) * H, backgroundColor: '#FFEB3B66' }} />
            : <Text key={i} pointerEvents="none" style={{ position: 'absolute', left: o.x * W, top: o.y * H, fontSize: o.type === 'signature' ? 28 * (W / doc.sizes[page - 1][0]) : 16 * (W / doc.sizes[page - 1][0]), fontStyle: o.type === 'signature' ? 'italic' : 'normal', color: o.type === 'signature' ? '#0D2673' : o.type === 'note' ? '#B07B00' : '#000' }}>{o.type === 'note' ? '🗒 ' : ''}{o.text}</Text>)}
          {rect && <View pointerEvents="none" style={{ position: 'absolute', left: Math.min(rect.x0, rect.x1), top: Math.min(rect.y0, rect.y1), width: Math.abs(rect.x1 - rect.x0), height: Math.abs(rect.y1 - rect.y0), backgroundColor: '#FFEB3B88' }} />}
        </View>
        {draft && !draft.auto && (
          <View style={{ width: W, backgroundColor: '#fff', padding: 10, marginTop: 8, borderRadius: 12 }}>
            <TextInput autoFocus value={text} onChangeText={setText} placeholder={draft.type === 'signature' ? 'Type your signature' : draft.type === 'note' ? 'Note text' : 'Text to add'} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 10 }} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}><Button title="Add" onPress={commitText} style={{ flex: 1 }} /><Button title="Cancel" kind="ghost" onPress={() => { setDraft(null); setText(''); }} style={{ flex: 1 }} /></View>
          </View>
        )}
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>{mode === 'highlight' ? 'Drag over text to highlight it.' : 'Tap the page where you want to add it.'}</Text>
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: C.navy, gap: 10 }}>
        <Pressable onPress={() => setPage(Math.max(1, page - 1))}><Text style={{ color: '#fff', fontSize: 24, paddingHorizontal: 10 }}>‹</Text></Pressable>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{page} / {doc.pages}</Text>
        <Pressable onPress={() => setPage(Math.min(doc.pages, page + 1))}><Text style={{ color: '#fff', fontSize: 24, paddingHorizontal: 10 }}>›</Text></Pressable>
        <Button title={`Save (${ops.length})`} kind="accent" onPress={apply} disabled={!ops.length} busy={busy} style={{ marginLeft: 'auto', minWidth: 120 }} />
      </View>
    </View>
  );
}
