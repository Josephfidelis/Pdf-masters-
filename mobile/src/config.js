import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || '').replace(/\/$/, '');
export const PURCHASE_URL = process.env.EXPO_PUBLIC_PURCHASE_URL || ''; // optional: checkout page / Play listing
export const ADS_ENABLED = true;

// Real ad units only on Android release builds. Dev + "preview" builds use Google test ads
// (clicking your own live ads can get the AdMob account suspended).
const useTest = __DEV__ || process.env.EXPO_PUBLIC_USE_TEST_ADS === 'true' || Platform.OS !== 'android';
const P = 'ca-app-pub-4469462902321828/';
export const AD_UNITS = useTest
  ? { banner: TestIds.BANNER, interstitial: TestIds.INTERSTITIAL, rewardedInterstitial: TestIds.REWARDED_INTERSTITIAL,
      rewarded: TestIds.REWARDED, native: TestIds.NATIVE || 'ca-app-pub-3940256099942544/2247696110' }
  : { banner: P + '5599900246', interstitial: P + '8150041961', rewardedInterstitial: P + '2502963618',
      rewarded: P + '6250636938', native: P + '5077156065' };

export const TOOLS = {
  'pdf-to-docx': { title: 'PDF to Word', icon: 'W', kind: 'pdf', multi: false, out: 'Word document', hint: 'Editable .docx with layout, tables and images' },
  'docx-to-pdf': { title: 'Word to PDF', icon: 'P', kind: 'docx', multi: false, out: 'PDF', hint: 'Convert a .docx into a PDF' },
  'pdf-to-xlsx': { title: 'PDF to Excel', icon: 'X', kind: 'pdf', multi: false, out: 'Excel workbook', hint: 'Extracts tables into .xlsx sheets' },
  'merge': { title: 'Merge PDF', icon: '⊕', kind: 'pdf', multi: true, min: 2, out: 'PDF', hint: 'Combine 2 or more PDFs in order' },
  'split': { title: 'Split PDF', icon: '✂', kind: 'pdf', multi: false, out: 'PDF', pages: true, hint: 'Extract pages, e.g. 1-3,5' },
  'compress': { title: 'Compress PDF', icon: '⇩', kind: 'pdf', multi: false, out: 'PDF', level: true, hint: 'Reduce the file size' },
  'images-to-pdf': { title: 'Image to PDF', icon: '▣', kind: 'image', multi: true, min: 1, out: 'PDF', offline: true, hint: 'Combine pictures into one PDF' },
  'pdf-to-images': { title: 'PDF to Images', icon: '▤', kind: 'pdf', multi: false, out: 'Images (ZIP)', fmt: true, hint: 'Export pages as JPG or PNG' },
};
