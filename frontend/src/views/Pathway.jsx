import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Async, Progress, Say, Stale } from '../components/ui.jsx';
import { doOrQueue, post } from '../lib/api.js';
import { toast, useApi, useApp, useStudentPath } from '../lib/app-state.js';
import { t, useLang } from '../lib/i18n.js';
import { kv } from '../lib/store.js';

const ICON = { education: '🏫', course: '💻', exam: '📝', apprenticeship: '🛠️', job: '💼', practice: '🎯' };

export default function Pathway() {
  const { cid } = useParams();
  const S = useStudentPath();
  const { lang } = useLang();
  const api = useApi(S(`/pathway?${cid ? `career_id=${cid}&` : ''}lang=${lang}`));
  if (api.error?.status === 409) {
    return (
      <div className="card">
        <h2>🧭 {t('path.choose', 'Choose a career first')}</h2>
        <Link className="btn" to="/careers">{t('home.careers', 'My careers')}</Link>
      </div>
    );
  }
  return <Async api={api}>{(d) => <PathwayView d={d} />}</Async>;
}

function PathwayView({ d }) {
  const S = useStudentPath();
  const { acting } = useApp();
  const profile = useApi(S('/profile'));
  const key = `progress:${acting ? acting.id : 'me'}:${d.career_id}`;
  const [done, setDone] = useState(() => d.steps.map((s) => s.done));
  const [goalSet, setGoalSet] = useState(false);

  // Apply changes made offline that the server hasn't seen yet.
  useEffect(() => {
    kv.get(key).then((o) => o && setDone(d.steps.map((s, i) => (i in o ? o[i] : s.done))));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = Math.round((100 * done.filter(Boolean).length) / d.steps.length);
  const isGoal = goalSet || profile.data?.profile?.chosen_career === d.career_id;

  const toggle = async (i) => {
    const v = !done[i];
    const next = done.map((x, j) => (j === i ? v : x));
    setDone(next);
    const o = (await kv.get(key)) || {};
    o[i] = v;
    await kv.set(key, o);
    try {
      const r = await doOrQueue('progress', acting?.id, S('/progress'), { career_id: d.career_id, step_index: i, done: v });
      if (r.queued) toast(t('offline.queued', 'Saved on your phone. It will sync when you are online.'));
      else if (v) toast(`🏅 ${t('path.badge', 'Badge added to your Talent Passport')}`);
    } catch (e) { toast(e.message); }
  };

  const makeGoal = async () => {
    try { await post(S('/career'), { career_id: d.career_id }); setGoalSet(true); toast(`⭐ ${t('path.goalset', 'Goal saved')}`); }
    catch (e) { toast(e.status === 0 ? t('offline.needed', 'Please connect to the internet for this') : e.message); }
  };

  return (
    <>
      <h1>🪜 {d.career} <Stale data={d} /></h1>
      {d.intro && <div className="card row"><p className="grow" style={{ margin: 0 }}>{d.intro}</p><Say text={d.intro} /></div>}
      <div className="row" style={{ margin: '12px 0' }}><Progress pct={pct} /><b>{pct}%</b></div>
      {!isGoal && profile.data && <button className="btn accent block" onClick={makeGoal}>⭐ {t('path.goal', 'Make this my goal')}</button>}
      <div className="card" style={{ marginTop: 12 }}>
        <ol className="steps">
          {d.steps.map((s, i) => (
            <li className="step" key={i}>
              <button className={`check ${done[i] ? 'on' : ''}`} onClick={() => toggle(i)} aria-label="done">{done[i] ? '✓' : ''}</button>
              <div className="grow">
                <b>{ICON[s.type] || '•'} {s.title}</b>
                {s.tip && <p className="small">💡 {s.tip}</p>}
                <div className="facts">
                  {s.duration && <span>⏱️ {s.duration}</span>}
                  {s.when && <span>📅 {s.when}</span>}
                  {s.provider && <span>🏛️ {s.provider}</span>}
                  {s.free && <span className="pill good">{t('free', 'Free')}</span>}
                </div>
                {s.url && <a className="small" href={s.url} target="_blank" rel="noopener noreferrer">{t('path.open', 'Open')} ↗</a>}
              </div>
            </li>
          ))}
        </ol>
      </div>
      {d.resources.length > 0 && <h2>💻 {t('path.more', 'More free courses')}</h2>}
      {d.resources.map((r) => (
        <div className="card" key={r.id}>
          <b>{r.title}</b>
          <div className="facts"><span>🏛️ {r.provider}</span>{r.duration && <span>⏱️ {r.duration}</span>}</div>
          <a className="small" href={r.url} target="_blank" rel="noopener noreferrer">{t('path.open', 'Open')} ↗</a>
        </div>
      ))}
      {d.exams.length > 0 && <h2>📝 {t('path.exams', 'Exams to know about')}</h2>}
      {d.exams.map((x) => (
        <div className="card" key={x.id}>
          <b>{x.name}</b>
          <p className="small">{x.purpose}</p>
          <div className="facts">{x.when && <span>📅 {x.when}</span>}{x.eligibility && <span>✅ {x.eligibility}</span>}</div>
          <a className="small" href={x.url} target="_blank" rel="noopener noreferrer">{t('path.open', 'Open')} ↗</a>
        </div>
      ))}
      <p className="small muted">📚 {t('path.source', 'Source')}: {d.source}</p>
    </>
  );
}
