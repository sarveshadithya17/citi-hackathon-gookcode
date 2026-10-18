import { Link } from 'react-router-dom';
import { Async, Ring, Say, Stale } from '../components/ui.jsx';
import { useApi, useStudentPath } from '../lib/app-state.js';
import { inr, t, useLang } from '../lib/i18n.js';

export default function Careers() {
  const S = useStudentPath();
  const { lang } = useLang();
  const api = useApi(S(`/careers?lang=${lang}`));
  if (api.error?.status === 409) {
    return (
      <div className="card">
        <h2>🎙️ {t('careers.first', 'First, tell Thiran about yourself')}</h2>
        <Link className="btn" to="/discover">{t('home.discover', 'Discover what you are good at')}</Link>
      </div>
    );
  }
  return (
    <Async api={api}>
      {(d) => (
        <>
          <h1>🧭 {t('careers.title', 'Careers that suit you')} <Stale data={d} /></h1>
          <p className="muted">{t('careers.sub', 'From {n} different fields, not just doctor or engineer. Tap one to see your path.', { n: d.categories.length })}</p>
          {d.careers.map((c) => (
            <div className="card career" key={c.id}>
              <div className="top">
                <div className="grow">
                  <h3>{c.name} {d.chosen === c.id && <span className="pill good">⭐ {t('careers.goal', 'My goal')}</span>}</h3>
                  <span className="pill brand">{c.category_label}</span>{' '}
                  {c.local_demand === 'high' && <span className="pill accent">📍 {t('careers.local', 'Jobs nearby')}</span>}
                </div>
                <div className="fit"><Ring pct={c.fit} size={54} stroke={6} /><div className="small muted" style={{ fontWeight: 400, textAlign: 'center' }}>{t('careers.match', 'match')}</div></div>
              </div>
              <p className="small">{c.description}</p>
              <div className="why">💡 {c.why}</div>
              <div className="facts">
                <span>⏱️ {c.training_time}</span>
                {c.salary_inr_month && <span>💰 {inr(c.salary_inr_month[0])}–{inr(c.salary_inr_month[1])}/{t('month', 'month')}</span>}
              </div>
              <div className="row">
                <Say text={`${c.name}. ${c.why}`} />
                <Link className="btn small grow" to={`/pathway/${c.id}`}>🪜 {t('careers.path', 'Show my path')}</Link>
              </div>
            </div>
          ))}
        </>
      )}
    </Async>
  );
}
