import mobileAds, { AdsConsent, AdEventType, InterstitialAd, MaxAdContentRating, RewardedAd,
  RewardedAdEventType, RewardedInterstitialAd } from 'react-native-google-mobile-ads';
import { ADS_ENABLED, AD_UNITS } from './config';

let started = false;
function fullscreen(Cls, unit, rewarded) {
  let ad = null, loaded = false, loading = false;
  const load = () => {
    if (loading || loaded) return;
    loading = true;
    ad = Cls.createForAdRequest(unit);
    ad.addAdEventListener(rewarded ? RewardedAdEventType.LOADED : AdEventType.LOADED, () => { loaded = true; loading = false; });
    ad.addAdEventListener(AdEventType.ERROR, () => { loaded = false; loading = false; setTimeout(load, 45000); });
    ad.load();
  };
  // resolves true when shown (interstitial) / when reward earned (rewarded)
  const show = () => new Promise((resolve) => {
    if (!loaded || !ad) { load(); return resolve(false); }
    let earned = false;
    ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; });
    ad.addAdEventListener(AdEventType.CLOSED, () => { loaded = false; load(); resolve(rewarded ? earned : true); });
    ad.show().catch(() => { loaded = false; load(); resolve(false); });
  });
  return { load, show, ready: () => loaded };
}
let interstitial, rewarded, rewardedInterstitial;

export async function initAds() {
  if (!ADS_ENABLED || started) return;
  started = true;
  try { await AdsConsent.gatherConsent(); } catch {}            // GDPR / US-state consent form (UMP)
  try {
    await mobileAds().setRequestConfiguration({ maxAdContentRating: MaxAdContentRating.PG });
    await mobileAds().initialize();
    interstitial = fullscreen(InterstitialAd, AD_UNITS.interstitial, false);
    rewarded = fullscreen(RewardedAd, AD_UNITS.rewarded, true);
    rewardedInterstitial = fullscreen(RewardedInterstitialAd, AD_UNITS.rewardedInterstitial, true);
    interstitial.load(); rewarded.load(); rewardedInterstitial.load();
  } catch {}
}
let count = 0, last = 0;
/** Interstitial after every 2nd successful conversion, at most once a minute. */
export async function maybeShowInterstitial(adFree) {
  if (adFree || !interstitial) return;
  count += 1;
  if (count % 2 === 0 && Date.now() - last > 60000 && interstitial.ready()) { last = Date.now(); await interstitial.show(); }
}
export const showRewarded = () => (rewarded ? rewarded.show() : Promise.resolve(false));
export const showRewardedInterstitial = () => (rewardedInterstitial ? rewardedInterstitial.show() : Promise.resolve(false));
export const rewardedReady = () => !!rewarded && rewarded.ready();
export const rewardedInterstitialReady = () => !!rewardedInterstitial && rewardedInterstitial.ready();
