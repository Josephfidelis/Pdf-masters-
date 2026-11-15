# PDF MASTER  ·  Convert • Edit • Manage

```
pdf-masters/
  backend/   FastAPI + PyMuPDF + pdf2docx + LibreOffice + Tesseract  (Docker)
  mobile/    Expo / React Native app (Android + iOS), AdMob, offline scan
```

## 1. Deploy the backend (needs a Docker host – Render, Railway, Fly.io, any VPS)
LibreOffice/Tesseract cannot run inside Termux, so the backend lives on a server.
```bash
cd backend
cp .env.example .env            # set SECRET_KEY and ADMIN_KEY to long random strings
docker build -t pdfmasters .
docker run -d -p 8000:8000 --env-file .env -v pdfdata:/data --restart unless-stopped pdfmasters
```
Put it behind HTTPS (Render/Fly/Railway do this for you; on a VPS use Caddy or nginx + Let's Encrypt).
Desktop users can open the server URL in a browser for the drag-and-drop web version.

Tests: `pip install -r requirements-dev.txt && pytest -q`

Issue a Premium activation code (call this from your payment webhook, or by hand):
```bash
curl -X POST https://YOUR-BACKEND/api/premium/issue -H "X-Admin-Key: $ADMIN_KEY" -H "Content-Type: application/json" -d '{"days":31}'
```

## 2. Build the app from Termux (cloud build by EAS, nothing heavy runs on your phone)
```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git unzip
termux-setup-storage                              # allow storage once
cp ~/storage/downloads/pdf-masters.zip ~ && cd ~ && unzip pdf-masters.zip
cd pdf-masters/mobile

npm install -g eas-cli
eas login                                         # your expo.dev account (or: export EXPO_TOKEN=...)
eas whoami

git init && git add . && git commit -m "PDF MASTER"
npm install
npx expo install --fix                            # aligns native package versions with the Expo SDK

nano eas.json                                     # replace https://YOUR-BACKEND-URL (3 places)
nano app.json                                     # replace extra.apiUrl as well
eas init                                          # links/creates the Expo project (writes projectId)

eas build -p android --profile preview            # installable APK, Google TEST ads
eas build -p android --profile production         # .aab for Google Play, REAL ads
```
Download the APK from the link EAS prints (or `eas build:list`).

## Ads (all your IDs are wired in `mobile/src/config.js` and `app.json`)
| Placement | Where it shows |
|---|---|
| Banner | bottom of Home, Tool, Result, Scan, Files |
| Interstitial | after every 2nd successful conversion (max 1/min) |
| Rewarded | "Watch ad (+3)" when the free daily limit is reached |
| Rewarded interstitial | Premium tab: "ad-free for 30 min" (opt-in) |
| Native advanced | Home (below tools) and Files list |

* Premium users and ad-free windows never load ads. Consent (GDPR/UMP) form runs at start-up.
* `preview` and dev builds use Google **test** ads on purpose; only `production` (Android) uses your live units.
  Never tap your own live ads.
* Your App ID looks like an Android one. iOS needs its own AdMob app + units: until you add them, iOS uses test IDs
  (`ios` entries in `app.json` / `config.js`).
