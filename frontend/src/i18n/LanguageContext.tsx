import React, { createContext, useContext, useState, ReactNode } from 'react';
import { en, Translations } from './locales/en';
import { zh } from './locales/zh';

type Language = 'zh' | 'en';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (path: string, fallback?: string) => string;
}

const dictionaries: Record<Language, Translations> = { en, zh };

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('app_lang') as Language | null;
    if (saved === 'zh' || saved === 'en') return saved;
    return navigator.language.toLowerCase().includes('zh') ? 'zh' : 'en';
  });

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem('app_lang', newLang);
  };

  const t = (path: string, fallback?: string): string => {
    const keys = path.split('.');
    let current: any = dictionaries[lang];
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return fallback || path;
      }
    }
    return typeof current === 'string' ? current : (fallback || path);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};
