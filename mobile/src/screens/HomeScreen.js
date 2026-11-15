import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useApp } from '../AppContext';
import { AdBanner, NativeAdCard } from '../components/Ads';
import { Button, Header, OfflineBanner } from '../components/ui';
import { TOOLS } from '../config';
import { C, R } from '../theme';
import { addRecent } from '../storage';

const GRID = ['pdf-to-docx', 'docx-to-pdf', 'pdf-to-xlsx', 'merge', 'split', 'compress', 'editor', 'images-to-pdf', 'scan', 'pdf-to-images', 'viewer'];
const EXTRA = { editor: { title: 'PDF Editor', icon: '✎' }, scan: { title: 'Scan', icon: '◎' }, viewer: { title: 'Open PDF', icon: '☰' } };
const PDF_TOOLS = ['pdf-to-docx', 'pdf-to-xlsx', 'split', 'compress', 'pdf-to-images', 'editor', 'viewer'];

export default function HomeScreen({ navigation }) {
  const { online, me, adFree } = useApp();
  const { width } = useWindowDimensions();
  const cols = width > 900 ? 5 : width > 600 ? 4 : 2;
  const [picked, setPicked] = useState(null);

  const go = (id, file) => {
    if (id === 'scan') return navigation.navigate('Scan');
    if (id === 'editor') return navigation.navigate('Editor', { file });
    if (id === 'viewer') return file ? openViewer(file) : pickViewer();
    navigation.navigate('Tool', { tool: id, preset: file ? [file] : undefined });
  };
  const openViewer = async (f) => { await addRecent({ uri: f.uri, name: f.name, size: f.size }); navigation.navigate('Viewer', { uri: f.uri, name: f.name }); };
  const pickViewer = async () => { const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (!r.canceled) openViewer(r.assets[0]); };
  const upload = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (!r.canceled) setPicked(r.assets[0]);
  };
  const choose = (id) => { const f = picked; setPicked(null); if (!online && TOOLS[id] && !TOOLS[id].offline && id !== 'viewer') return Alert.alert('Offline', 'This tool needs an internet connection.'); go(id, f); };

  return (
    <View style={{ flex: 1, backgroundColor: C.light }}>
      <Header />
      <OfflineBanner online={online} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <Button title="⬆  Upload PDF" kind="accent" onPress={upload} style={{ minHeight: 60 }} />
        {me && !me.premium && <Text style={{ textAlign: 'center', color: C.muted, marginTop: 8 }}>Free plan · {me.remaining} of {me.limit} conversions left today</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, marginTop: 14 }}>
          {GRID.map((id) => {
            const t = TOOLS[id] || EXTRA[id];
            return (
              <View key={id} style={{ width: `${100 / cols}%`, padding: 6 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={t.title} onPress={() => go(id)}
                  style={({ pressed }) => ({ backgroundColor: '#fff', borderRadius: R, padding: 14, alignItems: 'center', minHeight: 112, justifyContent: 'center', opacity: pressed ? 0.8 : 1, borderWidth: 1, borderColor: C.line })}>
                  <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: C.light, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: C.navy }}>{t.icon}</Text>
                  </View>
                  <Text style={{ marginTop: 8, fontWeight: '700', color: C.ink, textAlign: 'center' }}>{t.title}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
        {!adFree && <View style={{ marginTop: 8 }}><NativeAdCard /></View>}
      </ScrollView>
      <AdBanner />
      <Modal visible={!!picked} transparent animationType="slide" onRequestClose={() => setPicked(null)}>
        <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }} onPress={() => setPicked(null)}>
          <View style={{ backgroundColor: '#fff', padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
            <Text style={{ fontWeight: '800', fontSize: 18, color: C.navy }}>What do you want to do?</Text>
            <Text style={{ color: C.muted, marginBottom: 10 }} numberOfLines={1}>{picked?.name}</Text>
            {PDF_TOOLS.map((id) => (
              <Pressable key={id} onPress={() => choose(id)} style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: C.line }}>
                <Text style={{ fontSize: 16, color: C.ink }}>{(TOOLS[id] || EXTRA[id]).title}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
