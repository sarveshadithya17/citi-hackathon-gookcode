import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Async, PassportCard, PriceTag, Progress, Say, Stat, Tabs } from '../components/ui.jsx';
import { doOrQueue, post } from '../lib/api.js';
import { toast, useApi, useApp } from '../lib/app-state.js';
import { LANGS, eduLabel, inr, t, useLang } from '../lib/i18n.js';

function TTabs() {
  return <Tabs items={[['/t', `👥 ${t('t.class', 'My class')}`], ['/t/modules', `📚 ${t('t.modules', 'My modules')}`], ['/t/requests', `📨 ${t('t.requests', 'Employer requests')}`]]} />;
}

const KIND_ICON = { cluster: '🔎', unapplied: '🎁', incomplete: '📝', no_goal: '🧭' };

export function TeacherHome() {
  const { user } = useApp();
  const { lang } = useLang();
  const roster = useApi('/teacher/roster');
  const ins = useApi(`/teacher/insights?lang=${lang}`);
  return (
    <>
      <TTabs />
      <h1>👩‍🏫 {t('t.title', 'Hello, {name}', { name: user.name })}</h1>
      <Async api={ins}>
        {(d) => (
          <>
            <div className="stats">
              <Stat value={d.class_size} label={t('t.students', 'Students')} />
              <Stat value={d.totals.profiles_done} label={t('t.profiles', 'Profiles done')} />
              <Stat value={d.totals.goals_chosen} label={t('t.goals', 'Career goals chosen')} />
              <Stat value={d.totals.applications} label={t('t.apps', 'Applications')} />
            </div>
            <h2>✨ {t('t.insights', 'This week')}</h2>
            {d.summary && <div className="card row" style={{ background: 'var(--brand-soft)' }}><p className="grow" style={{ margin: 0 }}>{d.summary}</p><Say text={d.summary} /></div>}
            {d.cards.map((c, i) => (
              <div className="card" key={i}>
                <b>{KIND_ICON[c.kind] || '•'} {c.text}</b>
                <p className="small muted">{c.students.slice(0, 8).join(', ')}</p>
                {c.student_id && <Link className="btn small secondary" to={`/t/student/${c.student_id}`}>{t('t.open', 'Open')}</Link>}
              </div>
            ))}
          </>
        )}
      </Async>
      <div className="row" style={{ marginTop: 20 }}>
        <h2 className="grow" style={{ margin: 0 }}>👥 {t('t.class', 'My class')}</h2>
        <Link className="btn small" to="/t/add">＋ {t('t.add', 'Add student')}</Link>
      </div>
      <p className="small muted">{t('t.shared', 'Students without a phone use Thiran on your phone: open a student and tap "Use Thiran for them".')}</p>
      <Async api={roster}>
        {(list) => list.map((s) => (
          <Link className="card row" to={`/t/student/${s.id}`} key={s.id} style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}>
            <div className="avatar" style={{ width: 44, height: 44, fontSize: 18 }}>{s.name[0]}</div>
            <div className="grow">
              <b>{s.name}</b> {!s.has_phone && <span className="pill">📵 {t('t.nophone', 'no phone')}</span>}
              <div className="small muted">{eduLabel(s.education_level)} · {s.chosen_career_name ? `⭐ ${s.chosen_career_name}` : t('t.nogoal', 'no goal yet')}</div>
              <div style={{ marginTop: 6 }}><Progress pct={s.completeness} /></div>
            </div>
            <div className="small" style={{ textAlign: 'right' }}>
              {s.unapplied_count > 0 && <><span className="pill accent">🎁 {s.unapplied_count}</span><br /></>}
              {s.endorsements > 0 && <span className="pill good">👍 {s.endorsements}</span>}
            </div>
          </Link>
        ))}
      </Async>
    </>
  );
}

export function TeacherStudent() {
  const { id } = useParams();
  const { lang } = useLang();
  const nav = useNavigate();
  const { setActing } = useApp();
  const p = useApi(`/students/${id}/profile`);
  const pp = useApi(`/students/${id}/passport`);
  const opps = useApi(`/students/${id}/opportunities?lang=${lang}`);
  const [endorse, setEndorse] = useState({ skill: '', note: '' });
  const [rec, setRec] = useState({ opportunity_id: '', note: '' });

  const submitEndorse = async (e) => {
    e.preventDefault();
    try {
      const r = await doOrQueue('endorse', null, '/teacher/endorse', { student_id: +id, ...endorse });
      toast(r.queued ? t('offline.queued', 'Saved on your phone. It will sync when you are online.') : `👍 ${t('t.endorsed', 'Endorsement added to the Talent Passport')}`);
      setEndorse({ skill: '', note: '' });
      if (!r.queued) pp.reload();
    } catch (err) { toast(err.message); }
  };
  const submitRec = async (e) => {
    e.preventDefault();
    const oid = +(rec.opportunity_id || opps.data?.listings?.[0]?.id);
    if (!oid) return;
    try {
      await post('/teacher/recommend', { student_id: +id, opportunity_id: oid, note: rec.note });
      toast(`📨 ${t('t.recommended', 'Recommended. The employer can now see this student.')}`);
      pp.reload();
    } catch (err) { toast(err.status === 0 ? t('offline.needed', 'Please connect to the internet for this') : err.message); }
  };

  return (
    <>
      <TTabs />
      <Async api={p}>
        {(d) => {
          const pr = d.profile;
          return (
            <>
              <h1>{d.name}</h1>
              <div className="card">
                <div className="facts">
                  <span>🏫 {eduLabel(pr.education_level)}</span><span>📍 {pr.district || '—'}</span>
                  <span>📝 {t('home.profile', 'Profile {n}%', { n: pr.completeness })}</span>
                  {pp.data?.goal && <span>⭐ {pp.data.goal.en}</span>}
                </div>
                <p className="small">💡 {(pr.interests || []).join(', ').replaceAll('_', ' ') || '—'}</p>
                {opps.data && <p className="small">🎁 {t('t.eligible', 'Eligible for {n} scholarships/schemes', { n: opps.data.eligible.length })} · 📨 {t('t.applied', '{n} applied', { n: opps.data.applied.length })}</p>}
                <button className="btn block" onClick={() => { setActing({ id: +id, name: d.name }); nav('/home'); }}>
                  📱 {t('t.act', 'Use Thiran for {name}', { name: d.name.split(' ')[0] })}
                </button>
              </div>
            </>
          );
        }}
      </Async>
      <h2>👍 {t('t.endorse', 'Endorse a skill')}</h2>
      <form className="card" onSubmit={submitEndorse}>
        <label className="field"><span>{t('t.skill', 'Skill')}</span>
          <input className="input" required value={endorse.skill} onChange={(e) => setEndorse({ ...endorse, skill: e.target.value })} placeholder={t('t.skillph', 'e.g. Practical science, Wiring, Drawing')} /></label>
        <label className="field"><span>{t('t.note', 'What did you see?')}</span>
          <input className="input" value={endorse.note} onChange={(e) => setEndorse({ ...endorse, note: e.target.value })} placeholder={t('t.noteph', 'One line the employer will read')} /></label>
        <button className="btn" type="submit">{t('t.endorsebtn', 'Endorse')}</button>
      </form>
      <h2>📨 {t('t.recommend', 'Recommend for an opportunity')}</h2>
      <form className="card" onSubmit={submitRec}>
        <select value={rec.opportunity_id} onChange={(e) => setRec({ ...rec, opportunity_id: e.target.value })}>
          {(opps.data?.listings || []).map((o) => <option key={o.id} value={o.id}>{o.title} · {o.org} ({o.fit}%)</option>)}
        </select>
        <label className="field"><span>{t('t.note', 'What did you see?')}</span>
          <input className="input" value={rec.note} onChange={(e) => setRec({ ...rec, note: e.target.value })} /></label>
        <button className="btn" type="submit" disabled={!opps.data?.listings?.length}>{t('t.recbtn', 'Recommend')}</button>
      </form>
      <h2>🪪 {t('home.passport', 'Talent Passport')}</h2>
      <Async api={pp}>{(d) => <PassportCard d={d} />}</Async>
    </>
  );
}

export function TeacherAdd() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', education_level: 'class9', language: 'ta', district: 'Madurai' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try { const r = await post('/teacher/students', f); toast('✓'); nav(`/t/student/${r.id}`); } catch (err) { toast(err.message); }
  };
  return (
    <>
      <TTabs />
      <h1>＋ {t('t.add', 'Add student')}</h1>
      <form className="card" onSubmit={submit}>
        <label className="field"><span>{t('login.name', 'Your name')}</span><input className="input" required value={f.name} onChange={set('name')} /></label>
        <label className="field"><span>{t('t.classlvl', 'Class')}</span>
          <select value={f.education_level} onChange={set('education_level')}>
            {['class9', 'class10', 'class11', 'class12', 'iti', 'diploma', 'ug'].map((x) => <option key={x} value={x}>{eduLabel(x)}</option>)}
          </select></label>
        <label className="field"><span>{t('t.lang', 'Language')}</span>
          <select value={f.language} onChange={set('language')}>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></label>
        <label className="field"><span>{t('login.district', 'District')}</span><input className="input" value={f.district} onChange={set('district')} /></label>
        <button className="btn" type="submit">{t('t.addbtn', 'Add to my class')}</button>
      </form>
    </>
  );
}

export function TeacherModules() {
  const { lang } = useLang();
  const api = useApi('/teacher/modules');
  const blank = { title: '', description: '', lessons: '', pricing: 'free', price_inr: 0 };
  const [f, setF] = useState(blank);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await post('/teacher/modules', {
        title: f.title, description: f.description, pricing: f.pricing, price_inr: +f.price_inr || 0, language: lang,
        lessons: f.lessons.split('\n').map((x) => x.trim()).filter(Boolean).map((title) => ({ title })),
      });
      toast('✓'); setF(blank); api.reload();
    } catch (err) { toast(err.message); }
  };
  return (
    <>
      <TTabs />
      <h1>📚 {t('t.modules', 'My modules')}</h1>
      <Async api={api}>
        {(mods) => (
          <>
            <div className="stats">
              <Stat value={mods.length} label={t('t.mods', 'Modules')} />
              <Stat value={mods.reduce((a, m) => a + m.enrolments, 0)} label={t('t.enrol', 'Students joined')} />
              <Stat value={inr(mods.reduce((a, m) => a + m.earnings_inr, 0))} label={t('t.earn', 'You earned (after 10% fee)')} />
            </div>
            {mods.map((m) => (
              <div className="card" key={m.id}>
                <div className="row"><h3 className="grow">{m.title}</h3><PriceTag m={m} /></div>
                <p className="small muted">{m.lessons.length} {t('mod.lessons', 'lessons')} · {m.enrolments} {t('t.enrol', 'Students joined')} · {inr(m.earnings_inr)}</p>
              </div>
            ))}
          </>
        )}
      </Async>
      <h2>＋ {t('t.newmod', 'Create a module')}</h2>
      <form className="card" onSubmit={submit}>
        <label className="field"><span>{t('t.mtitle', 'Title')}</span><input className="input" required value={f.title} onChange={set('title')} placeholder="Basic mobile repair" /></label>
        <label className="field"><span>{t('t.mdesc', 'What will students learn?')}</span><textarea value={f.description} onChange={set('description')} /></label>
        <label className="field"><span>{t('t.mlessons', 'Lessons (one per line)')}</span><textarea value={f.lessons} onChange={set('lessons')} /></label>
        <label className="field"><span>{t('t.mprice', 'Price')}</span>
          <select value={f.pricing} onChange={set('pricing')}>
            <option value="free">{t('free', 'Free')}</option>
            <option value="per_module">{t('t.per', 'Pay per module')}</option>
            <option value="subscription">{t('t.sub', 'Monthly subscription')}</option>
          </select></label>
        {f.pricing !== 'free' && <label className="field"><span>₹</span><input className="input" type="number" min="0" max="5000" value={f.price_inr} onChange={set('price_inr')} /></label>}
        <button className="btn" type="submit">{t('t.publish', 'Publish')}</button>
      </form>
    </>
  );
}

export function TeacherRequests() {
  const api = useApi('/teacher/contact-requests');
  const respond = async (id, status) => { await post(`/teacher/contact-requests/${id}`, { status }); api.reload(); };
  return (
    <>
      <TTabs />
      <h1>📨 {t('t.requests', 'Employer requests')}</h1>
      <p className="muted small">{t('t.reqsub', 'Employers cannot contact students directly. You decide, together with the student and family.')}</p>
      <Async api={api}>
        {(reqs) => (reqs.length === 0 ? <p className="muted">{t('t.noreq', 'No requests yet.')}</p> : reqs.map((r) => (
          <div className="card" key={r.id}>
            <b>{r.org}</b> → {r.student}
            <p className="small">“{r.message}”</p>
            {r.status === 'pending' ? (
              <div className="row">
                <button className="btn small" onClick={() => respond(r.id, 'accepted')}>✓ {t('t.accept', 'Accept')}</button>
                <button className="btn small secondary" onClick={() => respond(r.id, 'declined')}>{t('t.decline', 'Decline')}</button>
              </div>
            ) : <span className={`pill ${r.status === 'accepted' ? 'good' : ''}`}>{r.status}</span>}
          </div>
        )))}
      </Async>
    </>
  );
}
