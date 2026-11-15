import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { getMe } from './api';
import { getAdFreeUntil, getPremiumToken, setAdFreeUntil, setPremiumToken } from './storage';
import { initAds } from './ads';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [online, setOnline] = useState(true);
  const [me, setMe] = useState(null);
  const [adFreeUntil, setAdFree] = useState(0);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    try { setMe(await getMe()); } catch { /* offline: keep last known */ }
    setAdFree(await getAdFreeUntil());
  }, []);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(!!(s.isConnected && s.isInternetReachable !== false))), []);
  useEffect(() => { initAds(); refresh(); }, [refresh]);
  useEffect(() => { if (online) refresh(); }, [online, refresh]);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  const premium = !!me?.premium;
  const adFree = premium || Date.now() < adFreeUntil;
  const value = { online, me, premium, adFree, refresh,
    grantAdFree: async (mins) => { const until = Date.now() + mins * 60000; await setAdFreeUntil(until); setAdFree(until); },
    setToken: async (t) => { await setPremiumToken(t); await refresh(); },
    hasToken: getPremiumToken, tick };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
