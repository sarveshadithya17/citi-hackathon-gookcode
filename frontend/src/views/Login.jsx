import { useState } from 'react';
import { post } from '../lib/api.js';
import { toast, useApp } from '../lib/app-state.js';
import { LANGS, t, useLang } from '../lib/i18n.js';
import Tour from '../components/Tour.jsx';

const DEMOS = [
  ['9000000001', '🧑‍🎓', 'Meena S', 'Student, Class 11 (profile done)'],
  ['9000000006', '🧑‍🎓', 'Kavya R', 'New student: try Discover'],
  ['9000000002', '👩‍🏫', 'Raju K', 'Government school teacher'],
  ['9000000003', '🏥', 'MedLab Diagnostics', 'Employer'],
  ['9000000004', '🤝', 'Vidiyal Foundation', 'CSR / NGO'],
];

export default function Login() {
  const { login } = useApp();
  const { lang, setLang } = useLang();
  const [registering, setRegistering] = useState(false);
  const [f, setF] = useState({ phone: '', pin: '', name: '', role: 'student', org_name: '', district: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    try {
      const res = registering
        ? await post('/auth/register', { phone: f.phone, pin: f.pin, name: f.name || 'Student', role: f.role, language: lang, org_name: f.org_name || null, district: f.district || null })
        : await post('/auth/login', { phone: f.phone, pin: f.pin });
      await login(res);
    } catch (err) { toast(err.status === 0 ? t('offline.login', 'You need internet to log in the first time') : err.message); }
  };
  const demo = async (phone) => {
    try { await login(await post('/auth/login', { phone, pin: '1234' })); } catch (err) { toast(err.message); }
  };

  return (
    <>
      <h1>{t('login.title', 'Find what you are good at. Build it. Earn from it.')}</h1>
      <p className="muted">{t('login.sub', 'Talk to Thiran in your language. It is free for students.')}</p>
      <div className="value-props">
        <div><span>🎙️</span><b>{t('vp.discover', 'Discover')}</b><small>{t('vp.discover.s', 'Talk, and find your strengths')}</small></div>
        <div><span>🪜</span><b>{t('vp.learn', 'Learn')}</b><small>{t('vp.learn.s', 'A free, step-by-step path')}</small></div>
        <div><span>🎁</span><b>{t('vp.earn', 'Earn')}</b><small>{t('vp.earn.s', 'Scholarships, schemes and jobs')}</small></div>
      </div>
      <h2>{t('login.lang', 'Choose your language')}</h2>
      <div className="langs" data-tour="langs">
        {LANGS.map((l) => <button key={l.code} className={`lang ${l.code === lang ? 'on' : ''}`} onClick={() => setLang(l.code)}>{l.name}</button>)}
      </div>
      <div className="card" style={{ marginTop: 16 }} data-tour="login-form">
        <form onSubmit={submit}>
          <label className="field"><span>📱 {t('login.phone', 'Phone number')}</span>
            <input className="input" value={f.phone} onChange={set('phone')} inputMode="numeric" pattern="\d{10}" maxLength={10} required autoComplete="tel" /></label>
          <label className="field"><span>🔢 {t('login.pin', '4-digit PIN')}</span>
            <input className="input" value={f.pin} onChange={set('pin')} type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required /></label>
          {registering && (
            <>
              <label className="field"><span>{t('login.name', 'Your name')}</span><input className="input" value={f.name} onChange={set('name')} /></label>
              <label className="field"><span>{t('login.role', 'I am a')}</span>
                <select value={f.role} onChange={set('role')}>
                  <option value="student">🧑‍🎓 {t('role.student', 'Student')}</option>
                  <option value="teacher">👩‍🏫 {t('role.teacher', 'Teacher / facilitator')}</option>
                  <option value="employer">🏢 {t('role.employer', 'Employer / NGO / CSR')}</option>
                </select></label>
              {f.role === 'employer' && <label className="field"><span>{t('login.org', 'Organisation name')}</span><input className="input" value={f.org_name} onChange={set('org_name')} /></label>}
              <label className="field"><span>{t('login.district', 'District')}</span><input className="input" value={f.district} onChange={set('district')} placeholder="Madurai" /></label>
            </>
          )}
          <button className="btn block" type="submit">{registering ? t('login.create', 'Create account') : t('login.go', 'Log in')}</button>
          <p className="small" style={{ textAlign: 'center' }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setRegistering(!registering); }}>{t('login.new', 'New here? Create an account')}</a>
          </p>
        </form>
      </div>
      <h2>{t('login.demo', 'Demo accounts')} <span className="pill">PIN 1234</span></h2>
      <div className="demo-list" data-tour="demo">
        {DEMOS.map(([ph, ic, n, d]) => (
          <button key={ph} className="card row" onClick={() => demo(ph)} style={{ cursor: 'pointer', width: '100%' }}>
            <span style={{ fontSize: 26 }}>{ic}</span>
            <span className="grow"><b>{n}</b><br /><span className="small muted">{d} · {ph}</span></span><span>›</span>
          </button>
        ))}
      </div>
      <Tour id="login" steps={[
        { icon: '👋', title: t('tour.l0.t', 'Welcome to Thiran'), body: t('tour.l0.b', 'Thiran helps students find what they are good at, plan how to grow it, and reach scholarships, apprenticeships and jobs. Let me show you around. It takes 30 seconds.') },
        { sel: '[data-tour="lang-switch"]', icon: '🌐', title: t('tour.l1.t', 'Your language, anytime'), body: t('tour.l1.b', 'Thiran works in English, Tamil and Hindi. Switch here on any screen, and the text and voice change with it.') },
        { sel: '[data-tour="langs"]', icon: '🗣️', title: t('tour.l2.t', 'Or tap a big button'), body: t('tour.l2.b', 'Large buttons make it easy to pick a language, even for first-time phone users.') },
        { sel: '[data-tour="login-form"]', icon: '📱', title: t('tour.l3.t', 'Phone number and PIN'), body: t('tour.l3.b', 'No email needed. Students, teachers and employers all log in here. New here? Tap "Create an account".') },
        { sel: '[data-tour="demo"]', icon: '🎬', title: t('tour.l4.t', 'Try a demo account'), body: t('tour.l4.b', 'Explore Thiran as a student, a teacher or an employer with one tap. The PIN is 1234.') },
        { sel: '[data-tour="help"]', icon: '❔', title: t('tour.l5.t', 'Help is always here'), body: t('tour.l5.b', 'Tap ? on any main screen to see this guide again.') },
      ]} />
    </>
  );
}
