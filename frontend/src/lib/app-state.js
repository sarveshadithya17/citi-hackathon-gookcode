import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError, get } from './api.js';
import { useLang } from './i18n.js';

// Who is logged in, and which student a teacher is currently helping on their phone.
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

// Student API paths: "me" for a student, or the roster student a teacher is acting for.
export function useStudentPath() {
  const { acting } = useApp();
  return (path) => `/students/${acting ? acting.id : 'me'}${path}`;
}

// Fetch a GET endpoint (with the offline saved copy as fallback) and re-run when deps change.
export function useApi(path, deps = []) {
  const { lang } = useLang();
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ data: await get(path), error: null, loading: false });
    } catch (e) {
      setState({ data: null, error: e instanceof ApiError ? e : new ApiError(-1, String(e)), loading: false });
    }
  }, [path, lang, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setData: (d) => setState((s) => ({ ...s, data: d })) };
}

// Small global toast.
const toastListeners = new Set();
export function toast(msg, ms = 2600) { for (const fn of toastListeners) fn(msg, ms); }
export function useToasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const fn = (msg, ms) => {
      const id = Math.random();
      setItems((x) => [...x, { id, msg }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), ms);
    };
    toastListeners.add(fn);
    return () => toastListeners.delete(fn);
  }, []);
  return items;
}
