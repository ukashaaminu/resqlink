import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Locale, TranslationKey, getDeviceLocale, t as translate } from '.';

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
const STORAGE_KEY = 'resq-link-locale';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocale] = useState<Locale>(getDeviceLocale());

  useEffect(() => {
    const loadStored = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'en' || stored === 'zh-Hant') {
          setLocale(stored);
        }
      } catch {
        // ignore read errors, fallback to device
      }
    };
    loadStored();
  }, []);

  const persistLocale = async (value: Locale) => {
    setLocale(value);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore persist errors
    }
  };

  const value = useMemo(
    () => ({
      locale,
      setLocale: persistLocale,
      t: (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars)
    }),
    [locale]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = (): LanguageContextValue => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
};
