import React, { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Pdf from 'react-native-pdf';
import { C } from '../theme';

export default function ViewerScreen({ route }) {
  const { uri, name } = route.params;
  const ref = useRef(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [goto, setGoto] = useState('');
  const [err, setErr] = useState(null);
  const jump = (n) => { const p = Math.max(1, Math.min(total || 1, n)); ref.current?.setPage(p); };
  return (
    <View style={{ flex: 1, backgroundColor: '#dfe7f1' }}>
      {err ? <Text style={{ padding: 24, color: C.err }}>{err}</Text> : (
        <Pdf ref={ref} source={{ uri }} style={{ flex: 1 }} enablePaging={false} enableDoubleTapZoom minScale={1} maxScale={6} fitPolicy={0}
          onLoadComplete={(n) => setTotal(n)} onPageChanged={(p) => setPage(p)}
          onError={() => setErr('This PDF could not be opened. It may be damaged or password protected.')} />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.navy, padding: 10 }}>
        <Pressable onPress={() => jump(page - 1)} hitSlop={10}><Text style={{ color: '#fff', fontSize: 22, paddingHorizontal: 14 }}>‹</Text></Pressable>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{page} / {total || '–'}</Text>
        <Pressable onPress={() => jump(page + 1)} hitSlop={10}><Text style={{ color: '#fff', fontSize: 22, paddingHorizontal: 14 }}>›</Text></Pressable>
        <TextInput value={goto} onChangeText={setGoto} keyboardType="number-pad" placeholder="Go to" placeholderTextColor="#9CC9F0" onSubmitEditing={() => { jump(parseInt(goto, 10) || 1); setGoto(''); }}
          style={{ marginLeft: 'auto', color: '#fff', borderWidth: 1, borderColor: C.blue, borderRadius: 8, paddingHorizontal: 10, minWidth: 80, height: 36 }} />
      </View>
    </View>
  );
}
