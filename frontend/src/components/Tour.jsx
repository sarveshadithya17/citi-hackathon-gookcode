// First-visit guided tour: dims the page, spotlights one area at a time and explains it.
// Each page passes its own steps; "?" in the top bar replays the tour for the current page.
import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../lib/i18n.js';

const EVENT = 'thiran:tour';
const seenKey = (id) => `thiran.tour.${id}`;

// How many pages with a tour are on screen (the "?" button only shows when there is one).
let mounted = 0;
const subs = new Set();
const notify = () => subs.forEach((f) => f());
export const useTourAvailable = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => mounted > 0);
export const startTour = () => window.dispatchEvent(new Event(EVENT));

function seen(id) { try { return localStorage.getItem(seenKey(id)) === 'done'; } catch { return false; } }
function markSeen(id) { try { localStorage.setItem(seenKey(id), 'done'); } catch {} }

function findTarget(sel) {
  if (!sel) return null;
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width || r.height ? el : null;
}

export default function Tour({ id, steps }) {
  const [i, setI] = useState(null); // null = closed
  const [rect, setRect] = useState(null);

  useEffect(() => {
    mounted += 1; notify();
    const open = () => setI(0);
    window.addEventListener(EVENT, open);
    const timer = seen(id) ? null : setTimeout(open, 700);
    return () => { mounted -= 1; notify(); window.removeEventListener(EVENT, open); clearTimeout(timer); };
  }, [id]);

  const step = i === null ? null : steps[i];

  const close = useCallback(() => { markSeen(id); setI(null); setRect(null); }, [id]);
  const next = useCallback(() => { if (i >= steps.length - 1) close(); else setI(i + 1); }, [i, steps.length, close]);
  const back = useCallback(() => setI((x) => Math.max(0, x - 1)), []);

  // Find the step's target (waiting briefly for content that is still loading), scroll it into view, measure it.
  useLayoutEffect(() => {
    if (!step) return undefined;
    if (!step.sel) { setRect(null); return undefined; }
    let cancelled = false;
    let tries = 0;
    let el = null;
    const measure = () => { if (el && !cancelled) setRect(el.getBoundingClientRect()); };
    const locate = () => {
      el = findTarget(step.sel);
      if (!el) {
        if (tries++ < 15) { setTimeout(locate, 120); return; }
        if (!cancelled) next(); // this area isn't on screen, so skip the step
        return;
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      measure();
      setTimeout(measure, 350);
    };
    setRect(null);
    locate();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { cancelled = true; window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!step) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, next, back, close]);

  if (!step) return null;
  const waiting = step.sel && !rect;

  // Card placement: centred for intro steps; otherwise below or above the spotlight, clamped to the screen.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(360, vw - 32);
  let cardStyle = { width: w };
  let arrow = null;
  if (rect) {
    const pad = 8;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - w / 2, 16), vw - w - 16);
    const below = rect.bottom + pad < vh * 0.58;
    cardStyle = below
      ? { width: w, left, top: Math.min(rect.bottom + pad + 14, vh - 200) }
      : { width: w, left, bottom: Math.max(vh - rect.top + pad + 14, 16) };
    arrow = { side: below ? 'top' : 'bottom', left: Math.min(Math.max(rect.left + rect.width / 2 - left, 22), w - 22) };
  }
  const last = i === steps.length - 1;

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className={`tour-backdrop ${rect || waiting ? '' : 'dim'}`} onClick={(e) => e.stopPropagation()} />
      {rect && (
        <div className="tour-spot" style={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }} />
      )}
      {!waiting && (
        <div key={i} className={`tour-card ${rect ? '' : 'center'}`} style={cardStyle}>
          {arrow && <span className={`tour-arrow ${arrow.side}`} style={{ left: arrow.left }} />}
          <div className="tour-head">
            <span className="tour-icon" aria-hidden="true">{step.icon}</span>
            <span className="tour-count">{i + 1} / {steps.length}</span>
          </div>
          <h3 id="tour-title">{step.title}</h3>
          <p>{step.body}</p>
          <div className="tour-dots" aria-hidden="true">
            {steps.map((_, j) => <i key={j} className={j === i ? 'on' : j < i ? 'done' : ''} />)}
          </div>
          <div className="tour-actions">
            {!last && <button className="btn ghost small" onClick={close}>{t('tour.skip', 'Skip')}</button>}
            <span className="grow" />
            {i > 0 && <button className="btn secondary small" onClick={back}>{t('tour.back', 'Back')}</button>}
            <button className="btn small" onClick={next} autoFocus>
              {last ? t('tour.done', 'Got it') : i === 0 ? t('tour.start', 'Show me') : t('tour.next', 'Next')} {last ? '✓' : '→'}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
