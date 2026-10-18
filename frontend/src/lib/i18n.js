// UI text. English defaults live next to each call (t('key', 'English')), and
// public/locales/<lang>.json override them. Adding a language = adding one JSON file.
import { createContext, useContext } from 'react';

let lang = 'en';
let dict = {};

export const LANGS = [
  { code: 'ta', name: 'தமிழ்' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'en', name: 'English' },
];

export function getLang() { return lang; }

export async function loadLang(code) {
  if (code !== 'en') {
    try { dict = await (await fetch(`/locales/${code}.json`)).json(); } catch { dict = {}; }
  } else dict = {};
  lang = code;
  try { localStorage.setItem('thiran.lang', code); } catch {}
  document.documentElement.lang = code;
}

export function initialLang() {
  try { return localStorage.getItem('thiran.lang') || 'ta'; } catch { return 'ta'; }
}

export function t(key, fallback, vars) {
  let s = dict[key] || fallback || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

// Components read the language from context so they re-render when it changes.
export const LangContext = createContext({ lang: 'en', setLang: async () => {} });
export const useLang = () => useContext(LangContext);

export const eduLabel = (e) => ({
  class8: t('edu.class8', 'Class 8'), class9: t('edu.class9', 'Class 9'), class10: t('edu.class10', 'Class 10'),
  class11: t('edu.class11', 'Class 11'), class12: t('edu.class12', 'Class 12'), iti: t('edu.iti', 'ITI'),
  diploma: t('edu.diploma', 'Diploma'), ug: t('edu.ug', 'College (UG)'), pg: t('edu.pg', 'Postgraduate'),
}[e] || '—');

export const inr = (n) => (n == null ? '' : '₹' + Number(n).toLocaleString('en-IN'));
