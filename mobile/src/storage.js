import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system';

export const DIR = FS.documentDirectory + 'PDFMasters/';
export async function ensureDir() { const i = await FS.getInfoAsync(DIR); if (!i.exists) await FS.makeDirectoryAsync(DIR, { intermediates: true }); }

const rnd = () => Math.random().toString(16).slice(2, 10);
export async function getDeviceId() {
  let id = await AsyncStorage.getItem('device_id');
  if (!id) { id = `${rnd()}-${rnd()}-${rnd()}-${Date.now().toString(16)}`; await AsyncStorage.setItem('device_id', id); }
  return id;
}
export const getPremiumToken = () => AsyncStorage.getItem('premium_token');
export const setPremiumToken = (t) => (t ? AsyncStorage.setItem('premium_token', t) : AsyncStorage.removeItem('premium_token'));
export const getAdFreeUntil = async () => Number(await AsyncStorage.getItem('adfree_until')) || 0;
export const setAdFreeUntil = (ms) => AsyncStorage.setItem('adfree_until', String(ms));

async function readList(key) { try { return JSON.parse((await AsyncStorage.getItem(key)) || '[]'); } catch { return []; } }
export const getHistory = () => readList('history');
export async function addHistory(item) {
  const list = (await getHistory()).filter((h) => h.uri !== item.uri);
  list.unshift({ id: rnd() + Date.now(), date: Date.now(), ...item });
  await AsyncStorage.setItem('history', JSON.stringify(list.slice(0, 200)));
}
export async function removeHistory(item) {
  const list = (await getHistory()).filter((h) => h.id !== item.id);
  await AsyncStorage.setItem('history', JSON.stringify(list));
  try { if (item.uri.startsWith(DIR)) await FS.deleteAsync(item.uri, { idempotent: true }); } catch {}
}
export async function clearHistory() { for (const h of await getHistory()) await removeHistory(h); }
export const getRecents = () => readList('recents');
export async function addRecent(item) {
  const list = (await getRecents()).filter((h) => h.uri !== item.uri);
  list.unshift({ date: Date.now(), ...item });
  await AsyncStorage.setItem('recents', JSON.stringify(list.slice(0, 8)));
}
export const fmtSize = (b = 0) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
