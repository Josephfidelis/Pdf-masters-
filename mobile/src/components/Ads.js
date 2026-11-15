import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { BannerAd, BannerAdSize, NativeAd, NativeAdView, NativeAsset, NativeAssetType, NativeMediaView } from 'react-native-google-mobile-ads';
import { ADS_ENABLED, AD_UNITS } from '../config';
import { useApp } from '../AppContext';
import { C, R } from '../theme';

export function AdBanner() {
  const { adFree, online } = useApp();
  if (!ADS_ENABLED || adFree || !online) return null;
  return (
    <View style={{ alignItems: 'center', backgroundColor: '#fff' }}>
      <BannerAd unitId={AD_UNITS.banner} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={{ requestNonPersonalizedAdsOnly: false }} />
    </View>
  );
}

export function NativeAdCard() {
  const { adFree, online } = useApp();
  const [ad, setAd] = useState(null);
  useEffect(() => {
    if (!ADS_ENABLED || adFree || !online || !NativeAd) return;
    let alive = true, current;
    NativeAd.createForAdRequest(AD_UNITS.native).then((a) => { current = a; alive ? setAd(a) : a.destroy(); }).catch(() => {});
    return () => { alive = false; try { current?.destroy(); } catch {} };
  }, [adFree, online]);
  if (!ad || adFree) return null;
  return (
    <NativeAdView nativeAd={ad} style={{ backgroundColor: '#fff', borderRadius: R, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {ad.icon && <NativeAsset assetType={NativeAssetType.ICON}><Image source={{ uri: ad.icon.url }} style={{ width: 44, height: 44, borderRadius: 8, marginRight: 10 }} /></NativeAsset>}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, color: C.muted }}>Ad</Text>
          <NativeAsset assetType={NativeAssetType.HEADLINE}><Text style={{ fontWeight: '700', color: C.ink }} numberOfLines={1}>{ad.headline}</Text></NativeAsset>
          {!!ad.body && <NativeAsset assetType={NativeAssetType.BODY}><Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={2}>{ad.body}</Text></NativeAsset>}
        </View>
      </View>
      <NativeMediaView style={{ width: '100%', height: 150, marginTop: 8, borderRadius: 8 }} />
      {!!ad.callToAction && (
        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
          <Text style={{ backgroundColor: C.blue, color: '#fff', textAlign: 'center', padding: 10, borderRadius: 10, marginTop: 8, fontWeight: '700', overflow: 'hidden' }}>{ad.callToAction}</Text>
        </NativeAsset>
      )}
    </NativeAdView>
  );
}
