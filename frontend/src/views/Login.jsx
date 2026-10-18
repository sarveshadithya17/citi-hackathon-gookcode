import { useState } from 'react';
import { post } from '../lib/api.js';
import { toast, useApp } from '../lib/app-state.js';
import { LANGS, t, useLang } from '../lib/i18n.js';

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
      <h2>{t('login.lang', 'Choose your language')}</h2>
      <div className="langs">
        {LANGS.map((l) => <button key={l.code} className={`lang ${l.code === lang ? 'on' : ''}`} onClick={() => setLang(l.code)}>{l.name}</button>)}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
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
      <div className="demo-list">
        {DEMOS.map(([ph, ic, n, d]) => (
          <button key={ph} className="card row" onClick={() => demo(ph)} style={{ cursor: 'pointer', width: '100%' }}>
            <span style={{ fontSize: 26 }}>{ic}</span>
            <span className="grow"><b>{n}</b><br /><span className="small muted">{d} · {ph}</span></span><span>›</span>
          </button>
        ))}
      </div>
    </>
  );
}
