// Fully offline PDF creation from images (used by Scan and Image to PDF).
import * as FS from 'expo-file-system';
import * as IM from 'expo-image-manipulator';
import * as Print from 'expo-print';
import { DIR, ensureDir } from './storage';

export async function localImagesToPdf(images, name) {
  await ensureDir();
  let html = '<html><head><meta name="viewport" content="width=device-width"/><style>@page{margin:0}body{margin:0}.p{width:100vw;height:100vh;page-break-after:always;display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100%;object-fit:contain}</style></head><body>';
  for (const img of images) {
    const m = await IM.manipulateAsync(img.uri, [{ resize: { width: 1600 } }], { compress: 0.82, format: IM.SaveFormat.JPEG, base64: true });
    html += `<div class="p"><img src="data:image/jpeg;base64,${m.base64}"/></div>`;
  }
  html += '</body></html>';
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const fname = (name || `Scan_${stamp}`).replace(/[^\w\- ]/g, '_') + '.pdf';
  const dest = DIR + Date.now() + '_' + fname;
  await FS.moveAsync({ from: uri, to: dest });
  const info = await FS.getInfoAsync(dest);
  return { uri: dest, name: fname, size: info.size || 0 };
}
