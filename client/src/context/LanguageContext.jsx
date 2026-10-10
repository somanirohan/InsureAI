import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { LANGUAGES, translations } from '../constants/translations';

const LanguageContext = createContext(null);

const STORAGE_KEY = 'medshield_lang';

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || 'en';
  });

  const setLanguage = (langCode) => {
    if (translations[langCode]) {
      setLanguageState(langCode);
      localStorage.setItem(STORAGE_KEY, langCode);
    }
  };

  // Translation helper with dot notation (e.g. t('nav.dashboard', 'Dashboard'))
  const t = (path, fallback = '') => {
    if (!path) return fallback;
    const langDict = translations[language] || translations.en;
    const enDict = translations.en;

    const resolve = (obj, p) => {
      const keys = p.split('.');
      let current = obj;
      for (const k of keys) {
        if (current && typeof current === 'object' && k in current) {
          current = current[k];
        } else {
          return undefined;
        }
      }
      return current;
    };

    // 1. Try selected language
    const val = resolve(langDict, path);
    if (val !== undefined && typeof val === 'string') return val;

    // 2. Fallback to English
    const enVal = resolve(enDict, path);
    if (enVal !== undefined && typeof enVal === 'string') return enVal;

    // 3. Fallback to provided fallback or last segment of path
    return fallback || path.split('.').pop();
  };

  const currentLanguageInfo = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        languages: LANGUAGES,
        currentLanguageInfo,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

/**
 * Reusable Language Selector Dropdown Component
 */
export function LanguageSelector({ variant = 'default', className = '' }) {
  const { language, setLanguage, languages, currentLanguageInfo } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 ${
          variant === 'compact'
            ? 'bg-white/[0.04] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
            : 'bg-white/[0.05] border border-white/[0.09] text-zinc-200 hover:bg-white/[0.08] hover:border-brand-500/30'
        }`}
        style={{ backdropFilter: 'blur(12px)' }}
        aria-label="Select Language"
      >
        <Globe size={13} className="text-brand-500/80 flex-shrink-0" />
        <span className="font-medium tracking-tight">{currentLanguageInfo.nativeName}</span>
        <ChevronDown size={11} className={`text-zinc-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 bottom-full mb-2 lg:bottom-auto lg:top-full lg:mt-2 w-48 bg-[#13131a] border border-white/[0.12] rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in backdrop-blur-xl"
          style={{
            boxShadow: '0 12px 36px rgba(0,0,0,0.60), 0 0 0 1px rgba(255,255,255,0.06)',
          }}
        >
          <div className="px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Choose Language</p>
          </div>
          <div className="max-h-60 overflow-y-auto scroll-area py-1 divide-y divide-white/[0.02]">
            {languages.map((lang) => {
              const isSelected = language === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    setLanguage(lang.code);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-brand-500/15 text-brand-400 font-medium'
                      : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">{lang.flag}</span>
                    <div>
                      <p className="text-xs leading-none">{lang.nativeName}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{lang.name}</p>
                    </div>
                  </div>
                  {isSelected && <Check size={12} className="text-brand-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
