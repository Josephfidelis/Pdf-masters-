import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as FS from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useApp } from '../AppContext';
import { AdBanner, NativeAdCard } from '../components/Ads';
import { Header } from '../components/ui';
import { TOOLS } from '../config';
import { clearHistory, fmtSize, getHistory, getRecents, removeHistory } from '../storage';
import { C } from '../theme';

export default function HistoryScreen({ navigation }) {
  const { adFree } = useApp();
  const [items, setItems] = useState([]);
  const [recents, setRecents] = useState([]);
  const load = useCallback(async () => {
    const h = await getHistory();
    const alive = [];
    for (const i of h) { if ((await FS.getInfoAsync(i.uri)).exists) alive.push(i); }
    setItems(alive); setRecents(await getRecents());
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = (it) => {
    const pdf = it.name.toLowerCase().endsWith('.pdf');
    const buttons = [
      ...(pdf ? [{ text: 'Preview', onPress: () => navigation.navigate('Viewer', { uri: it.uri, name: it.name }) }] : []),
      { text: 'Share / Save', onPress: () => Sharing.shareAsync(it.uri) },
      { text: 'Delete', style: 'destructive', onPress: async () => { await removeHistory(it); load(); } },
      { text: 'Cancel', style: 'cancel' },
    ];
    Alert.alert(it.name, `${fmtSize(it.size)} · ${new Date(it.date).toLocaleString()}`, buttons);
  };
  const row = ({ item, index }) => (
    <View>
      {index === 3 && !adFree && <View style={{ paddingHorizontal: 16 }}><NativeAdCard /></View>}
      <Pressable onPress={() => open(item)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 14 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontWeight: '700', color: C.ink }}>{item.name.replace(/^\d+_/, '')}</Text>
          <Text style={{ color: C.muted, fontSize: 12 }}>{(TOOLS[item.tool]?.title || (item.tool === 'scan' || item.tool === 'scan-ocr' ? 'Scan' : 'Edited'))} · {fmtSize(item.size)} · {new Date(item.date).toLocaleDateString()}</Text>
        </View>
        <Text style={{ color: C.blue, fontSize: 20 }}>›</Text>
      </Pressable>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: C.light }}>
      <Header title="My Files" sub="Conversion history & recent documents" />
      <FlatList data={items} keyExtractor={(i) => i.id} renderItem={row} contentContainerStyle={{ paddingVertical: 12 }}
        ListHeaderComponent={recents.length ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
            <Text style={{ fontWeight: '800', color: C.navy, marginBottom: 6 }}>Recent documents</Text>
            {recents.slice(0, 4).map((r) => <Pressable key={r.uri} onPress={() => navigation.navigate('Viewer', { uri: r.uri, name: r.name })}><Text numberOfLines={1} style={{ color: C.blue, paddingVertical: 4 }}>{r.name}</Text></Pressable>)}
            <Text style={{ fontWeight: '800', color: C.navy, marginTop: 14 }}>Conversion history</Text>
          </View>) : null}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: C.muted, marginTop: 40 }}>Nothing here yet. Converted and scanned files appear here.</Text>}
        ListFooterComponent={items.length ? <Pressable onPress={() => Alert.alert('Delete all?', 'This removes all saved files from this device.', [{ text: 'Cancel' }, { text: 'Delete all', style: 'destructive', onPress: async () => { await clearHistory(); load(); } }])}><Text style={{ textAlign: 'center', color: C.err, padding: 16 }}>Clear all</Text></Pressable> : null} />
      <AdBanner />
    </View>
  );
}
