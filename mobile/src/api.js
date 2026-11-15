import * as FS from 'expo-file-system';
import { API_URL } from './config';
import { DIR, ensureDir, getDeviceId, getPremiumToken } from './storage';

export class ApiError extends Error { constructor(message, code, extra) { super(message); this.code = code; this.extra = extra; } }

async function headers() {
  const h = { 'X-Device-Id': await getDeviceId() };
  const t = await getPremiumToken();
  if (t) h['X-Premium-Token'] = t;
  return h;
}
const parseErr = (status, text) => {
  try { const e = JSON.parse(text).error; return new ApiError(e.message, e.code, e); } catch {}
  return new ApiError(status >= 500 ? 'The server had a problem. Please try again in a moment.' : 'Something went wrong. Please try again.', 'http_' + status);
};
async function jsonFetch(path, opts = {}) {
  let res;
  try { res = await fetch(API_URL + path, { ...opts, headers: { ...(await headers()), ...(opts.headers || {}) } }); }
  catch { throw new ApiError('Cannot reach the server. Check your internet connection.', 'network'); }
  const text = await res.text();
  if (!res.ok) throw parseErr(res.status, text);
  return JSON.parse(text);
}
export const getMe = () => jsonFetch('/api/me');
export const claimReward = () => jsonFetch('/api/usage/reward', { method: 'POST' });
export const redeemCode = (code) => jsonFetch('/api/premium/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });

// multipart upload with real progress via XHR
export async function runTool(tool, files, fields = {}, onProgress = () => {}, fieldName = 'files', path = null) {
  const h = await headers();
  const fd = new FormData();
  files.forEach((f) => fd.append(fieldName, { uri: f.uri, name: f.name || 'file', type: f.mimeType || 'application/octet-stream' }));
  Object.entries(fields).forEach(([k, v]) => fd.append(k, String(v)));
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', API_URL + (path || `/api/tools/${tool}`));
    Object.entries(h).forEach(([k, v]) => x.setRequestHeader(k, v));
    x.upload.onprogress = (e) => e.lengthComputable && onProgress('upload', e.loaded / e.total);
    x.onload = () => { x.status === 200 ? resolve(JSON.parse(x.responseText)) : reject(parseErr(x.status, x.responseText)); };
    x.onerror = () => reject(new ApiError('Cannot reach the server. Check your internet connection.', 'network'));
    x.ontimeout = () => reject(new ApiError('The request timed out. Try a smaller file.', 'timeout'));
    x.timeout = 300000;
    x.send(fd);
  });
}
export async function postJson(path, body) {
  return jsonFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
export async function downloadResult(job) {
  await ensureDir();
  const safe = job.filename.replace(/[^\w.\- ]/g, '_');
  const dest = DIR + Date.now() + '_' + safe;
  const r = await FS.downloadAsync(API_URL + job.download_url, dest);
  if (r.status !== 200) { await FS.deleteAsync(dest, { idempotent: true }); throw new ApiError('The converted file could not be downloaded.', 'download'); }
  const info = await FS.getInfoAsync(dest);
  return { uri: dest, name: job.filename, size: info.size || job.size };
}
