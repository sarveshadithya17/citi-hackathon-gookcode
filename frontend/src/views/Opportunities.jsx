import { useState } from 'react';
import { Async, Say, Stale } from '../components/ui.jsx';
import { doOrQueue, post } from '../lib/api.js';
import { toast, useApi, useApp, useStudentPath } from '../lib/app-state.js';
import { inr, t, useLang } from '../lib/i18n.js';
import { speak } from '../lib/voice.js';

export default function Opportunities() {
  const S = useStudentPath();
  const { lang } = useLang();
  const api = useApi(S(`/opportunities?lang=${lang}`));
  return <Async api={api}>{(d) => <OppsView d={d} />}</Async>;
}

function SchemeCard({ x, maybe, applied, onApplied }) {
  const S = useStudentPath();
  const { lang } = useLang();
  const { acting } = useApp();
  const [explain, setExplain] = useState(null);
  const [busy, setBusy] = useState(false);
  const target = `kb:${x.id}`;
  const doExplain = async () => {
    if (explain) { speak(explain, lang); return; }
    setBusy(true);
    try {
      const r = await post(S('/explain'), { id: x.id, lang });
      setExplain(r.text);
      speak(r.text, lang);
    } catch (e) { toast(e.status === 0 ? t('offline.needed', 'Please connect to the internet for this') : e.message); }
    setBusy(false);
  };
  const apply = async () => {
    try {
      const r = await doOrQueue('apply', acting?.id, S('/applications'), { target });
      onApplied(target);
      toast(r.queued ? t('offline.queued', 'Saved on your phone. It will sync when you are online.') : `🏅 ${t('path.badge', 'Badge added to your Talent Passport')}`);
    } catch (e) { toast(e.message); }
  };
  const host = (x.source_url || '').replace(/^https?:\/\//, '').split('/')[0];
  return (
    <div className="card">
      <div className="row"><h3 className="grow">{x.name}</h3>{applied && <span className="pill good">✓ {t('opps.applied', 'Applied')}</span>}</div>
      <p className="small muted">{x.provider}</p>
      {x.benefit && <p>💰 <b>{x.benefit}</b></p>}
      <div className="small">
        <b>{t('opps.why', 'Why you qualify')}:</b>
        {x.reasons.map((r) => <div key={r}>✅ {r}</div>)}
        {maybe && x.missing.length > 0 && <div>❓ {t('opps.need', 'Tell us')}: {x.missing.join(', ')}</div>}
        {maybe && x.conditions?.length > 0 && <div>☑️ {t('opps.onlyif', 'Only if')}: {x.conditions.join('; ')}</div>}
      </div>
      {explain && <div className="why" style={{ marginTop: 8 }}>{explain}</div>}
      <details style={{ marginTop: 6 }}>
        <summary className="small">{t('opps.how', 'How to apply and documents')}</summary>
        <p className="small">{x.how_to_apply}</p>
        <p className="small">📄 {(x.documents || []).join(' · ')}</p>
        {x.deadline_note && <p className="small">📅 {x.deadline_note}</p>}
        <p className="small muted">{t('path.source', 'Source')}: <a href={x.source_url} target="_blank" rel="noopener noreferrer">{host}</a> · {t('opps.verified', 'checked')} {x.last_verified}</p>
      </details>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="icon-btn" onClick={doExplain} title={t('opps.explain', 'Explain in my language')} aria-label={t('opps.explain', 'Explain in my language')}>
          {busy ? <span className="spinner" /> : '🔊'}
        </button>
        <a className="btn small grow" href={x.apply_url} target="_blank" rel="noopener noreferrer">{t('opps.portal', 'Apply on official site')} ↗</a>
        {!applied && <button className="btn small secondary" onClick={apply}>✓ {t('opps.mark', 'I applied')}</button>}
      </div>
    </div>
  );
}

function OppsView({ d }) {
  const S = useStudentPath();
  const { acting } = useApp();
  const [applied, setApplied] = useState(() => new Set(d.applied));
  const mark = (target) => setApplied((s) => new Set([...s, target]));
  const sch = d.eligible.filter((x) => x.kind === 'scholarship');
  const schemes = d.eligible.filter((x) => x.kind === 'scheme');
  const summary = t('opps.summary', 'You can get {a} scholarships and {b} government schemes.', { a: sch.length, b: schemes.length });
  const none = <p className="muted">{t('opps.none', 'None found yet. Complete your profile to find more.')}</p>;
  const applyListing = async (id) => {
    try {
      const r = await doOrQueue('apply', acting?.id, S('/applications'), { target: `opp:${id}` });
      mark(`opp:${id}`);
      toast(r.queued ? t('offline.queued', 'Saved on your phone. It will sync when you are online.') : `🏅 ${t('path.badge', 'Badge added to your Talent Passport')}`);
    } catch (e) { toast(e.message); }
  };
  return (
    <>
      <h1>🎁 {t('home.opps', 'Scholarships and jobs')} <Stale data={d} /></h1>
      <div className="card row" style={{ background: 'var(--good-soft)' }}><b className="grow">🎉 {summary}</b><Say text={summary} /></div>
      {d.recommended.length > 0 && <h2>👩‍🏫 {t('opps.recommended', 'Recommended by your teacher')}</h2>}
      {d.recommended.map((r, i) => (
        <div className="card" key={i}>
          <b>{r.opportunity.title}</b>
          <p className="small muted">{r.opportunity.org} · {r.opportunity.district}</p>
          {r.note && <p className="small">💬 {r.teacher}: {r.note}</p>}
        </div>
      ))}
      <h2>🎓 {t('opps.sch', 'Scholarships for you')}</h2>
      {sch.length ? sch.map((x) => <SchemeCard key={x.id} x={x} applied={applied.has(`kb:${x.id}`)} onApplied={mark} />) : none}
      <h2>🏛️ {t('opps.schemes', 'Government schemes for you')}</h2>
      {schemes.length ? schemes.map((x) => <SchemeCard key={x.id} x={x} applied={applied.has(`kb:${x.id}`)} onApplied={mark} />) : none}
      {d.maybe.length > 0 && <h2>❓ {t('opps.maybe', 'You may also qualify')}</h2>}
      {d.maybe.map((x) => <SchemeCard key={x.id} x={x} maybe applied={applied.has(`kb:${x.id}`)} onApplied={mark} />)}
      <h2>🛠️ {t('opps.listings', 'Apprenticeships and jobs near you')}</h2>
      {d.listings.length === 0 && <p className="muted">{t('opps.nolist', 'No listings match yet.')}</p>}
      {d.listings.map((o) => (
        <div className="card" key={o.id}>
          <div className="row"><h3 className="grow">{o.title}</h3><b style={{ color: 'var(--brand)' }}>{o.fit}%</b></div>
          <p className="small muted">
            {o.org} · 📍 {o.district} {o.naps && <span className="pill brand">NAPS</span>} {o.sponsored && <span className="pill accent">CSR</span>}
          </p>
          <div className="facts">
            {o.stipend_inr_month && <span>💰 {inr(o.stipend_inr_month)}/{t('month', 'month')}</span>}
            {o.duration && <span>⏱️ {o.duration}</span>}
          </div>
          <p className="small">✅ {o.why.join(' · ')}</p>
          {applied.has(`opp:${o.id}`)
            ? <span className="pill good">✓ {t('opps.applied', 'Applied')}</span>
            : <button className="btn small" onClick={() => applyListing(o.id)}>{t('opps.apply', 'Apply with my Talent Passport')}</button>}
        </div>
      ))}
      {d.mentors.length > 0 && <h2>🤝 {t('opps.mentors', 'Mentors who can guide you')}</h2>}
      {d.mentors.map((m) => (
        <div className="card" key={m.id}>
          <b>{m.name}</b>
          <p className="small muted">{m.title} · {m.district}</p>
          <p className="small">{t('opps.mentorfor', 'Can guide you on')}: {m.careers.join(', ')}</p>
          <p className="small muted">{t('opps.mentorvia', 'Your teacher will set up a call.')}</p>
        </div>
      ))}
    </>
  );
}
