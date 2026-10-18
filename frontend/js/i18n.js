// UI text. English defaults live next to each call (t('key', 'English')), and
// locales/<lang>.json override them. Adding a language = adding one JSON file.
let lang = 'en';
let dict = {};

export const LANGS = [
  { code: 'ta', name: 'தமிழ்' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'en', name: 'English' },
];

export function getLang() { return lang; }

export async function setLang(code) {
  lang = code;
  try { localStorage.setItem('thiran.lang', code); } catch {}
  document.documentElement.lang = code;
  if (code === 'en') { dict = {}; return; }
  try {
    const res = await fetch(`/locales/${code}.json`);
    dict = await res.json();
  } catch { dict = {}; }
}

export function initialLang() {
  try { return localStorage.getItem('thiran.lang') || 'ta'; } catch { return 'ta'; }
}

export function t(key, fallback, vars) {
  let s = dict[key] || fallback || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
