import { useEffect, useMemo, useState } from 'react';
import { HashRouter, Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { get, post, setToken, sync, token, useNet } from './lib/api.js';
import { AppContext, useApp, useToasts } from './lib/app-state.js';
import { LANGS, LangContext, initialLang, loadLang, t, useLang } from './lib/i18n.js';
import { kv } from './lib/store.js';
import { Logo } from './components/ui.jsx';
import { startTour, useTourAvailable } from './components/Tour.jsx';
import { stopSpeaking } from './lib/voice.js';
import Login from './views/Login.jsx';
import StudentHome from './views/StudentHome.jsx';
import Discover from './views/Discover.jsx';
import Careers from './views/Careers.jsx';
import Pathway from './views/Pathway.jsx';
import Opportunities from './views/Opportunities.jsx';
import { MyPassport, PublicPassport } from './views/Passport.jsx';
import Modules from './views/Modules.jsx';
import { TeacherAdd, TeacherHome, TeacherModules, TeacherRequests, TeacherStudent } from './views/Teacher.jsx';
import { EmployerImpact, EmployerListings, EmployerPost, EmployerTalent } from './views/Employer.jsx';

export const homeFor = (u) => ({ teacher: '/t', employer: '/e', mentor: '/m' }[u?.role] || '/home');

function Topbar() {
  const { user, logout } = useApp();
  const { lang, setLang } = useLang();
  const net = useNet();
  const hasTour = useTourAvailable();
  return (
    <header className="topbar">
      <Link className="logo" to="/" style={{ color: 'inherit', textDecoration: 'none' }}><Logo /> Thiran</Link>
      <span className="spacer" />
      {!net.online && <span className="net off">📴 {t('offline.short', 'Offline')}</span>}
      {net.online && net.pending > 0 && <span className="net">⏫ {net.pending}</span>}
      <label className="lang-select" data-tour="lang-switch" title={t('lang.switch', 'Change language')}>
        <span aria-hidden="true">🌐</span>
        <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('lang.switch', 'Change language')}>
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
      </label>
      {hasTour && <button onClick={startTour} aria-label={t('tour.help', 'Show me around')} title={t('tour.help', 'Show me around')} data-tour="help">?</button>}
      {user && <button onClick={logout} aria-label={t('logout', 'Log out')} title={t('logout', 'Log out')} data-tour="logout">⎋</button>}
    </header>
  );
}

function Banners() {
  const { acting, setActing } = useApp();
  const net = useNet();
  const nav = useNavigate();
  return (
    <>
      {acting && (
        <div className="banner">
          <span className="grow">👩‍🏫 {t('acting.as', 'Using Thiran for {name}', { name: acting.name })}</span>
          <button className="btn small secondary" onClick={() => { setActing(null); nav('/t'); }}>{t('acting.back', 'Back to class')}</button>
        </div>
      )}
      {!net.online && <div className="banner">📴 {t('offline.banner', 'You are offline. Saved screens still work, and your changes will sync when you are back online.')}</div>}
    </>
  );
}

function Guard({ role, children }) {
  const { user, acting } = useApp();
  if (!user) return <Navigate to="/login" replace />;
  const ok = !role || role === user.role || (role === 'student' && user.role === 'teacher' && acting);
  return ok ? children : <Navigate to={homeFor(user)} replace />;
}

function Mentor() {
  const { user } = useApp();
  return (
    <>
      <h1>🤝 {t('m.title', 'Thank you for mentoring, {name}', { name: user.name })}</h1>
      <div className="card"><p>{t('m.body', 'Students who choose careers you know are matched to you. Their teacher will contact you to set up a call.')}</p></div>
    </>
  );
}

function Toasts() {
  const items = useToasts();
  return items.map((i) => <div key={i.id} className="toast">{i.msg}</div>);
}

function Shell() {
  const { user } = useApp();
  useEffect(() => () => stopSpeaking(), []);
  const S = (role, el) => <Guard role={role}>{el}</Guard>;
  return (
    <>
      <Topbar />
      <main>
        <Banners />
        <Routes>
          <Route path="/login" element={user ? <Navigate to={homeFor(user)} replace /> : <Login />} />
          <Route path="/home" element={S('student', <StudentHome />)} />
          <Route path="/discover" element={S('student', <Discover />)} />
          <Route path="/careers" element={S('student', <Careers />)} />
          <Route path="/pathway" element={S('student', <Pathway />)} />
          <Route path="/pathway/:cid" element={S('student', <Pathway />)} />
          <Route path="/opportunities" element={S('student', <Opportunities />)} />
          <Route path="/passport" element={S('student', <MyPassport />)} />
          <Route path="/modules" element={S('student', <Modules />)} />
          <Route path="/t" element={S('teacher', <TeacherHome />)} />
          <Route path="/t/student/:id" element={S('teacher', <TeacherStudent />)} />
          <Route path="/t/add" element={S('teacher', <TeacherAdd />)} />
          <Route path="/t/modules" element={S('teacher', <TeacherModules />)} />
          <Route path="/t/requests" element={S('teacher', <TeacherRequests />)} />
          <Route path="/e" element={S('employer', <EmployerListings />)} />
          <Route path="/e/talent" element={S('employer', <EmployerTalent />)} />
          <Route path="/e/post" element={S('employer', <EmployerPost />)} />
          <Route path="/e/impact" element={S('employer', <EmployerImpact />)} />
          <Route path="/m" element={S('mentor', <Mentor />)} />
          <Route path="*" element={<Navigate to={user ? homeFor(user) : '/login'} replace />} />
        </Routes>
      </main>
      <Toasts />
    </>
  );
}

export default function App() {
  const [lang, setLangState] = useState(null);
  const [user, setUserState] = useState(null);
  const [booted, setBooted] = useState(false);
  const [acting, setActingState] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('thiran.acting') || 'null'); } catch { return null; }
  });

  useEffect(() => {
    (async () => {
      await loadLang(initialLang());
      setLangState(initialLang());
      if (token()) {
        try { const me = await get('/auth/me', { cache: false }); setUserState(me); kv.set('me', me); }
        catch (e) { if (e.status === 0) setUserState((await kv.get('me')) || null); else setToken(null); }
      }
      setBooted(true);
      sync();
    })();
  }, []);

  const langValue = useMemo(() => ({
    lang,
    setLang: async (code) => {
      await loadLang(code);
      setLangState(code);
      if (token()) post('/auth/me/language', { language: code }).catch(() => {});
    },
  }), [lang]);

  const appValue = useMemo(() => ({
    user,
    acting,
    setActing: (a) => {
      setActingState(a);
      try { a ? sessionStorage.setItem('thiran.acting', JSON.stringify(a)) : sessionStorage.removeItem('thiran.acting'); } catch {}
    },
    login: async (res) => {
      setToken(res.token);
      await kv.set('me', res.user);
      setUserState(res.user);
    },
    logout: () => {
      setToken(null);
      setUserState(null);
      setActingState(null);
      try { sessionStorage.removeItem('thiran.acting'); } catch {}
    },
  }), [user, acting, lang, langValue]);

  if (!booted) return <div className="topbar"><span className="logo"><Logo /> Thiran</span></div>;

  // Public Talent Passport link: /p/<slug>, no login.
  const slug = location.pathname.match(/^\/p\/([\w-]+)/)?.[1];

  return (
    <LangContext.Provider value={langValue}>
      <AppContext.Provider value={appValue}>
        {slug ? <PublicPassport slug={slug} /> : <HashRouter><Shell /></HashRouter>}
      </AppContext.Provider>
    </LangContext.Provider>
  );
}
