import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Async, PassportCard, Progress, Stat, Tabs } from '../components/ui.jsx';
import { get, post } from '../lib/api.js';
import { toast, useApi, useApp } from '../lib/app-state.js';
import { eduLabel, inr, t } from '../lib/i18n.js';
import Tour from '../components/Tour.jsx';

function ETabs() {
  return <Tabs items={[['/e', `📋 ${t('e.listings', 'My listings')}`, 'e-listings'], ['/e/talent', `🔎 ${t('e.talent', 'Find talent')}`, 'e-talent'], ['/e/post', `＋ ${t('e.post', 'Post')}`, 'e-post'], ['/e/impact', `📊 ${t('e.impact', 'Impact')}`, 'e-impact']]} />;
}

function useCareers() {
  const [list, setList] = useState([]);
  useEffect(() => {
    get('/kb/careers').then((c) => setList(c.map((x) => ({ id: x.id, name: x.name.en })).sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {});
  }, []);
  return list;
}

export function EmployerListings() {
  const { user } = useApp();
  const api = useApi('/employer/opportunities');
  const setStatus = async (id, status) => { await post(`/employer/applications/${id}`, { status }); toast('✓'); };
  return (
    <>
      <ETabs />
      <h1>🏢 {user.org?.name || user.name}</h1>
      <Async api={api}>
        {(list) => (list.length === 0 ? <p className="muted">{t('e.nolist', 'No listings yet.')}</p> : list.map((o) => (
          <div className="card" key={o.id}>
            <div className="row"><h3 className="grow">{o.title}</h3><span className="pill">{o.kind}</span></div>
            <p className="small muted">📍 {o.district} {o.stipend_inr_month ? `· 💰 ${inr(o.stipend_inr_month)}` : ''}</p>
            <b className="small">{t('e.applicants', 'Applicants')} ({o.applications.length})</b>
            {o.applications.length === 0 && <p className="small muted">—</p>}
            {o.applications.map((a) => (
              <div className="row small" key={a.id} style={{ margin: '6px 0' }}>
                <span className="grow">{a.name} {a.recommended_by && `· 👩‍🏫 ${t('e.recby', 'recommended by {n}', { n: a.recommended_by })}`} · 👍 {a.endorsements}</span>
                <select defaultValue={a.status} onChange={(e) => setStatus(a.id, e.target.value)} style={{ width: 'auto', minHeight: 38 }}>
                  {['applied', 'shortlisted', 'selected'].map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            ))}
            {o.suggested.length > 0 && <b className="small">✨ {t('e.suggested', 'Thiran suggests')}</b>}
            {o.suggested.map((s) => <div className="small" key={s.student_id}>• {s.name} ({s.district}) · {s.fit}% · {s.why.join(', ')}</div>)}
          </div>
        )))}
      </Async>
      <Tour id="employer" steps={[
        { icon: '🏢', title: t('tour.e0.t', 'Find verified rural talent'), body: t('tour.e0.b', 'Post opportunities and meet students whose skills are endorsed by their teachers.') },
        { sel: '[data-tour="e-listings"]', icon: '📋', title: t('tour.e1.t', 'Your listings'), body: t('tour.e1.b', 'See who applied, who was recommended by a teacher, and the students Thiran suggests for each listing.') },
        { sel: '[data-tour="e-talent"]', icon: '🔎', title: t('tour.e2.t', 'Search talent'), body: t('tour.e2.b', 'Filter by district, skill and career goal. Unlock a Talent Passport to see endorsements and badges.') },
        { sel: '[data-tour="e-post"]', icon: '＋', title: t('tour.e3.t', 'Post an opportunity'), body: t('tour.e3.b', 'Apprenticeships, internships, jobs or CSR scholarships. Matching students are found right away.') },
        { sel: '[data-tour="e-impact"]', icon: '📊', title: t('tour.e4.t', 'Impact dashboard'), body: t('tour.e4.b', 'Students reached, applications and placements, ready for CSR reporting.') },
        { sel: '[data-tour="help"]', icon: '🔒', title: t('tour.e5.t', 'Privacy by design'), body: t('tour.e5.b', 'You see first names only, and contact goes through the student’s teacher. Tap ? to see this tour again.') },
      ]} />
    </>
  );
}

export function EmployerTalent() {
  const careers = useCareers();
  const [f, setF] = useState({ district: 'Madurai', skill: '', career: '', endorsed_only: true });
  const [q, setQ] = useState(f);
  const [open, setOpen] = useState({});
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== '' && v !== false) params.set(k, String(v));
  const api = useApi(`/employer/talent?${params}`);

  const unlock = async (id) => {
    try {
      const r = await post(`/employer/unlock/${id}`, {});
      if (r.charged_inr) toast(t('e.charged', 'Charged {p} (demo payment)', { p: inr(r.charged_inr) }));
      setOpen((o) => ({ ...o, [id]: r.passport }));
    } catch (e) { toast(e.message); }
  };
  const contact = async (id) => {
    const msg = prompt(t('e.msg', 'Message for the teacher'), t('e.msgdefault', 'We would like to invite this student for an apprenticeship interview.'));
    if (!msg) return;
    try { await post('/employer/contact', { student_id: id, message: msg }); toast(`📨 ${t('e.sent', 'Sent to the student’s teacher')}`); }
    catch (e) { toast(e.message); }
  };
  const upgrade = async () => { await post('/employer/upgrade', {}); toast(t('e.upgraded', 'Talent Pro active (demo payment)')); api.reload(); };

  return (
    <>
      <ETabs />
      <h1>🔎 {t('e.talent', 'Find talent')}</h1>
      <form className="card" onSubmit={(e) => { e.preventDefault(); setQ({ ...f }); }}>
        <div className="row">
          <input className="input grow" style={{ minWidth: 140 }} placeholder={t('login.district', 'District')} value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} />
          <input className="input grow" style={{ minWidth: 140 }} placeholder={t('t.skill', 'Skill')} value={f.skill} onChange={(e) => setF({ ...f, skill: e.target.value })} />
        </div>
        <select style={{ marginTop: 8 }} value={f.career} onChange={(e) => setF({ ...f, career: e.target.value })}>
          <option value="">{t('e.anycareer', 'Any career goal')}</option>
          {careers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="row small" style={{ margin: '8px 0' }}>
          <input type="checkbox" checked={f.endorsed_only} onChange={(e) => setF({ ...f, endorsed_only: e.target.checked })} /> {t('e.endorsedonly', 'Only teacher-endorsed students')}
        </label>
        <button className="btn" type="submit">{t('e.search', 'Search')}</button>
      </form>
      <Async api={api}>
        {(d) => (
          <>
            <p className="small muted">
              {t('e.plan', 'Plan')}: <b>{d.plan}</b> · {t('e.unlocks', '{n} passports unlocked', { n: d.unlocks_used })}
              {d.plan === 'free' && <> · {t('e.freeinfo', '3 free, then {p} each, or Talent Pro {m}/month unlimited', { p: inr(d.unlock_price_inr), m: inr(d.plans.talent_pro.price_inr_month) })}{' '}
                <button className="btn small secondary" onClick={upgrade}>{t('e.upgrade', 'Upgrade')}</button></>}
            </p>
            {d.results.length === 0 && <p className="muted">{t('e.noresults', 'No students match. Try fewer filters.')}</p>}
            {d.results.map((r) => (
              <div className="card" key={r.student_id}>
                <div className="row"><h3 className="grow">{r.name}</h3><b style={{ color: 'var(--brand)' }}>{r.score}</b></div>
                <p className="small muted">📍 {r.district} · 🏫 {eduLabel(r.education_level)} {r.goal && `· ⭐ ${r.goal}`}</p>
                <div className="chips">{r.endorsed_skills.map((s) => <span className="pill good" key={s}>👩‍🏫 {s}</span>)}</div>
                <p className="small">🏅 {r.badges} · ✅ {r.steps_done} {t('pp.steps', 'Pathway steps done')}</p>
                <div className="row">
                  <button className="btn small" onClick={() => unlock(r.student_id)}>{r.unlocked || open[r.student_id] ? `🔓 ${t('e.view', 'View passport')}` : `🔒 ${t('e.unlock', 'Unlock passport')}`}</button>
                  <button className="btn small secondary" onClick={() => contact(r.student_id)}>📨 {t('e.contact', 'Contact via teacher')}</button>
                </div>
                {open[r.student_id] && <div style={{ marginTop: 12 }}><PassportCard d={open[r.student_id]} /></div>}
              </div>
            ))}
          </>
        )}
      </Async>
    </>
  );
}

export function EmployerPost() {
  const careers = useCareers();
  const nav = useNavigate();
  const [f, setF] = useState({ kind: 'apprenticeship', title: '', career: '', district: 'Madurai', stipend: 9000, duration: '12 months', min_education: 'class12', description: '', naps: true, sponsored: false });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  useEffect(() => { if (careers.length && !f.career) setF((x) => ({ ...x, career: careers.find((c) => c.id === 'lab_technician')?.id || careers[0].id })); }, [careers]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await post('/opportunities', {
        kind: f.kind, title: f.title, careers: [f.career || careers[0]?.id].filter(Boolean), district: f.district,
        stipend_inr_month: +f.stipend || null, duration: f.duration, min_education: f.min_education,
        description: f.description, naps: f.naps, sponsored: f.sponsored,
      });
      toast(t('e.posted', 'Posted. {n} students match.', { n: r.matches }));
      nav('/e');
    } catch (err) { toast(err.message); }
  };
  return (
    <>
      <ETabs />
      <h1>＋ {t('e.posttitle', 'Post an opportunity')}</h1>
      <form className="card" onSubmit={submit}>
        <label className="field"><span>{t('e.kind', 'Type')}</span>
          <select value={f.kind} onChange={set('kind')}>
            <option value="apprenticeship">Apprenticeship</option><option value="internship">Internship</option>
            <option value="job">Job</option><option value="scholarship">Scholarship (CSR)</option>
          </select></label>
        <label className="field"><span>{t('t.mtitle', 'Title')}</span><input className="input" required value={f.title} onChange={set('title')} placeholder="Lab assistant apprentice" /></label>
        <label className="field"><span>{t('e.career', 'Career')}</span>
          <select value={f.career} onChange={set('career')}>{careers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <div className="row">
          <label className="field grow"><span>{t('login.district', 'District')}</span><input className="input" value={f.district} onChange={set('district')} /></label>
          <label className="field grow"><span>💰 ₹/{t('month', 'month')}</span><input className="input" type="number" value={f.stipend} onChange={set('stipend')} /></label>
        </div>
        <div className="row">
          <label className="field grow"><span>{t('e.duration', 'Duration')}</span><input className="input" value={f.duration} onChange={set('duration')} /></label>
          <label className="field grow"><span>{t('e.minedu', 'Minimum education')}</span>
            <select value={f.min_education} onChange={set('min_education')}>{['class10', 'class12', 'iti', 'diploma', 'ug'].map((x) => <option key={x} value={x}>{eduLabel(x)}</option>)}</select></label>
        </div>
        <label className="field"><span>{t('e.desc', 'Description')}</span><textarea value={f.description} onChange={set('description')} /></label>
        <label className="row small"><input type="checkbox" checked={f.naps} onChange={set('naps')} /> NAPS</label>
        <label className="row small"><input type="checkbox" checked={f.sponsored} onChange={set('sponsored')} /> {t('e.sponsored', 'Featured / sponsored listing')}</label>
        <button className="btn" type="submit" style={{ marginTop: 10 }}>{t('t.publish', 'Publish')}</button>
      </form>
    </>
  );
}

function Bars({ data }) {
  const max = Math.max(1, ...Object.values(data));
  return Object.entries(data).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
    <div className="row small" key={k} style={{ margin: '6px 0', flexWrap: 'nowrap' }}>
      <span style={{ width: 120 }}>{k.replaceAll('_', ' ')}</span>
      <Progress pct={(100 * v) / max} color="var(--brand)" /><b>{v}</b>
    </div>
  ));
}

export function EmployerImpact() {
  const api = useApi('/employer/impact');
  return (
    <>
      <ETabs />
      <h1>📊 {t('e.impacttitle', 'Impact dashboard')}</h1>
      <p className="muted small">{t('e.impactsub', 'For CSR reporting (Schedule VII: education and livelihood). Updated live.')}</p>
      <Async api={api}>
        {(d) => (
          <>
            <div className="stats">
              <Stat value={d.students_reached} label={t('e.reached', 'Students reached')} />
              <Stat value={d.teachers} label={t('e.teachers', 'Teachers')} />
              <Stat value={d.profiles_completed} label={t('t.profiles', 'Profiles done')} />
              <Stat value={d.goals_chosen} label={t('t.goals', 'Career goals chosen')} />
              <Stat value={d.scheme_applications} label={t('e.schemeapps', 'Scholarship/scheme applications')} />
              <Stat value={d.opportunity_applications} label={t('e.oppapps', 'Apprenticeship/job applications')} />
              <Stat value={d.selected} label={t('e.selected', 'Selected / placed')} />
              <Stat value={d.endorsements} label={t('pp.endorse', 'Teacher endorsements')} />
            </div>
            <h2>{t('e.bydistrict', 'Students by district')}</h2><div className="card"><Bars data={d.by_district} /></div>
            <h2>{t('e.bygoal', 'Career goals by field')}</h2><div className="card"><Bars data={d.goal_categories} /></div>
          </>
        )}
      </Async>
    </>
  );
}
