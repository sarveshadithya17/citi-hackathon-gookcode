import { Link } from 'react-router-dom';
import { Async, Progress } from '../components/ui.jsx';
import { useApi, useStudentPath } from '../lib/app-state.js';
import { t } from '../lib/i18n.js';

export default function StudentHome() {
  const S = useStudentPath();
  const api = useApi(S('/profile'));
  return (
    <Async api={api}>
      {(p) => {
        const name = (p.profile.name || p.name || '').split(' ')[0];
        const tile = (to, ic, title, sub, cls = 'tile') => (
          <Link className={cls} to={to}><span className="ic">{ic}</span><b>{title}</b><span>{sub}</span></Link>
        );
        return (
          <>
            <h1>{t('home.hello', 'Vanakkam, {name}!', { name })}</h1>
            <div className="row" style={{ marginBottom: 12 }}>
              <Progress pct={p.profile.completeness} />
              <span className="small muted">{t('home.profile', 'Profile {n}%', { n: p.profile.completeness || 0 })}</span>
            </div>
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
          </>
        );
      }}
    </Async>
  );
}
