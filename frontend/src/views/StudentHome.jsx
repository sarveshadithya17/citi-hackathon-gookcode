import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Async, Ring } from '../components/ui.jsx';
import { useApi, useStudentPath } from '../lib/app-state.js';
import { t, useLang } from '../lib/i18n.js';
import Tour from '../components/Tour.jsx';

export default function StudentHome() {
  const S = useStudentPath();
  const api = useApi(S('/profile'));
  const { lang, setLang } = useLang();
  // The dashboard is always shown in English; Discover asks for the chat language each time.
  useEffect(() => { if (lang !== 'en') setLang('en'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Async api={api}>
      {(p) => {
        const name = (p.profile.name || p.name || '').split(' ')[0];
        const tile = (to, ic, title, sub, cls = 'tile') => (
          <Link className={cls} to={to} data-tour={to.slice(1)}><span className="ic">{ic}</span><b>{title}</b><span>{sub}</span></Link>
        );
        return (
          <>
            <section className="hero">
              <div className="grow">
                <h1 className="hero-name">{t('home.hello', 'Hello, {name}!', { name })}</h1>
                <p>{p.ready ? t('home.hero.ready', 'Your profile is ready. Explore careers and opportunities picked for you.') : t('home.hero.new', 'Start with Discover so Thiran can learn what you are good at.')}</p>
              </div>
              <Ring pct={p.profile.completeness || 0} size={72} stroke={7} color="#fdba74" track="rgba(255,255,255,.22)" />
            </section>
            <div className="tiles">
              {tile('/discover', '🎙️',
                p.ready ? t('home.talk', 'Talk to Thiran') : t('home.discover', 'Discover what you are good at'),
                p.ready ? t('home.talk.sub', 'Tell me more about yourself') : t('home.discover.sub', 'Answer a few easy questions by voice'),
                'tile primary')}
              {tile('/careers', '🧭', t('home.careers', 'My careers'), t('home.careers.sub', 'Jobs that suit you'))}
              {tile('/pathway', '🪜', t('home.path', 'My path'), t('home.path.sub', 'Step by step plan'))}
              {tile('/opportunities', '🎁', t('home.opps', 'Scholarships and jobs'), t('home.opps.sub', 'Money and work you can get'))}
              {tile('/passport', '🪪', t('home.passport', 'Talent Passport'), t('home.passport.sub', 'Your badges and endorsements'))}
              {tile('/modules', '📚', t('home.modules', 'Learn from teachers'), t('home.modules.sub', 'Short lessons in your language'))}
            </div>
            <Tour id="student" steps={[
              { icon: '🎓', title: t('tour.s0.t', 'Your career companion'), body: t('tour.s0.b', 'Here is how Thiran takes you from "what am I good at?" to a real scholarship or job, one step at a time.') },
              { sel: '[data-tour="discover"]', icon: '🎙️', title: t('tour.s1.t', '1. Discover yourself'), body: t('tour.s1.b', 'Talk or tap to answer a few easy questions. Thiran learns your interests, strengths and goals.') },
              { sel: '[data-tour="careers"]', icon: '🧭', title: t('tour.s2.t', '2. Careers that suit you'), body: t('tour.s2.b', 'See careers from many fields, from skilled trades to healthcare, each with a reason it fits you, the pay and the training time.') },
              { sel: '[data-tour="pathway"]', icon: '🪜', title: t('tour.s3.t', '3. Your step-by-step path'), body: t('tour.s3.b', 'A plan built from free courses and real exams. Tick each step as you finish it to earn badges.') },
              { sel: '[data-tour="opportunities"]', icon: '🎁', title: t('tour.s4.t', '4. Scholarships and jobs'), body: t('tour.s4.b', 'Scholarships, government schemes and apprenticeships you qualify for, with the reasons and how to apply.') },
              { sel: '[data-tour="passport"]', icon: '🪪', title: t('tour.s5.t', '5. Talent Passport'), body: t('tour.s5.b', 'Your badges and teacher endorsements in one place. Share it with a QR code.') },
              { sel: '[data-tour="modules"]', icon: '📚', title: t('tour.s6.t', 'Learn from teachers'), body: t('tour.s6.b', 'Short lessons made by teachers, in your language.') },
              { sel: '[data-tour="lang-switch"]', icon: '📴', title: t('tour.s7.t', 'Works on any phone, even offline'), body: t('tour.s7.b', 'Change the language here anytime. No internet? Keep going; your progress syncs when you are back online.') },
            ]} />
          </>
        );
      }}
    </Async>
  );
}
