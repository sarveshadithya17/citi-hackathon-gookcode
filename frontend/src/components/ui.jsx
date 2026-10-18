import { NavLink } from 'react-router-dom';
import { t, inr, useLang } from '../lib/i18n.js';
import { speak } from '../lib/voice.js';

// The "Voice Sprout" mark: a speech bubble with a seedling (talk to Thiran, grow your skills).
export function Logo() {
  return (
    <svg className="logo-mark" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="1.5" y="1.5" width="97" height="97" rx="23" fill="#0f766e" stroke="rgba(255,255,255,.55)" strokeWidth="3" />
      <path d="M24 20h52a10 10 0 0 1 10 10v30a10 10 0 0 1-10 10H46l-14 12V70h-8a10 10 0 0 1-10-10V30a10 10 0 0 1 10-10z" fill="#fdf3e3" />
      <path d="M50 62V44" fill="none" stroke="#0f766e" strokeWidth="5" strokeLinecap="round" />
      <path d="M50 51c-10 0-16-6-16-15 10 0 16 6 16 15z" fill="#0f766e" />
      <path d="M50 46c0-10 7-16 17-16 0 10-7 16-17 16z" fill="#fb923c" />
    </svg>
  );
}

export function Say({ text, className = 'icon-btn' }) {
  const { lang } = useLang();
  const label = t('listen', 'Listen');
  return <button className={className} aria-label={label} title={label} onClick={() => speak(text, lang)}>🔊</button>;
}

export function Loading() {
  return <p className="muted"><span className="spinner" /> {t('loading', 'Loading…')}</p>;
}

export function ErrorView({ error }) {
  if (error?.status === 0) {
    return (
      <div className="card">
        <h2>📴 {t('offline.title', 'No internet')}</h2>
        <p>{t('offline.notyet', 'This screen has not been saved on your phone yet. Open it once when you are online.')}</p>
      </div>
    );
  }
  return <div className="card"><h2>{t('error', 'Something went wrong')}</h2><p className="muted">{error?.message}</p></div>;
}

// Shows loading / error states, then renders children(data).
export function Async({ api, children }) {
  if (api.loading && !api.data) return <Loading />;
  if (api.error) return <ErrorView error={api.error} />;
  if (!api.data) return <Loading />;
  return children(api.data);
}

export function Stale({ data }) {
  return data && data._offline ? <span className="pill warn">📴 {t('offline.saved', 'Saved copy')}</span> : null;
}

export function Tabs({ items }) {
  return (
    <nav className="tabs">
      {items.map(([to, label, tour]) => <NavLink key={to} to={to} end data-tour={tour} className={({ isActive }) => (isActive ? 'on' : '')}>{label}</NavLink>)}
    </nav>
  );
}

export function PriceTag({ m }) {
  if (m.sponsor) return <span className="pill good">{t('mod.sponsored', 'Free, sponsored by {s}', { s: m.sponsor })}</span>;
  if (m.pricing === 'free') return <span className="pill good">{t('free', 'Free')}</span>;
  if (m.pricing === 'subscription') return <span className="pill accent">{inr(m.price_inr)}/{t('month', 'month')}</span>;
  return <span className="pill accent">{inr(m.price_inr)}</span>;
}

export function Stat({ value, label }) {
  return <div className="stat"><b>{value}</b><span>{label}</span></div>;
}

export function Progress({ pct, color }) {
  return <div className="progress grow"><i style={{ width: `${pct || 0}%`, background: color }} /></div>;
}

const badgeIcon = (code) => (code.startsWith('endorse') ? '👩‍🏫' : code.startsWith('step') ? '✅' : code.startsWith('applied') ? '📨'
  : code.startsWith('selected') ? '🏆' : code.startsWith('module') ? '📚' : code.startsWith('career') ? '⭐'
    : code.startsWith('recommended') ? '📣' : '🏅');

export function PassportCard({ d }) {
  const { lang } = useLang();
  const initials = (d.name || '?').split(' ').map((x) => x[0]).join('').slice(0, 2);
  return (
    <>
      <div className="card">
        <div className="passport-head">
          <div className="avatar">{initials}</div>
          <div className="grow">
            <h1 style={{ margin: 0 }}>{d.name}</h1>
            <p className="muted small">📍 {[d.district, d.state].filter(Boolean).join(', ')} {d.teacher ? `· 👩‍🏫 ${d.teacher}` : ''}</p>
            {d.goal && <span className="pill good">⭐ {d.goal[lang] || d.goal.en}</span>}
          </div>
        </div>
        <div className="stats" style={{ marginTop: 12 }}>
          <Stat value={d.stats.endorsements} label={t('pp.endorse', 'Teacher endorsements')} />
          <Stat value={d.stats.badges} label={t('pp.badges', 'Badges')} />
          <Stat value={d.stats.steps_done} label={t('pp.steps', 'Pathway steps done')} />
        </div>
      </div>
      {d.endorsements.length > 0 && <h2>👩‍🏫 {t('pp.endorse', 'Teacher endorsements')}</h2>}
      {d.endorsements.map((e, i) => (
        <div className="card" key={i}>
          <b>✔️ {e.skill}</b>
          {e.note && <p className="small">“{e.note}”</p>}
          <p className="small muted">{e.by} · {e.role} · {e.date}</p>
        </div>
      ))}
      {(d.interests || []).length > 0 && (
        <>
          <h2>💡 {t('pp.interests', 'Interests')}</h2>
          <div className="chips">{d.interests.map((i) => <span className="pill" key={i}>{i.replaceAll('_', ' ')}</span>)}</div>
        </>
      )}
      <h2>🏅 {t('pp.badges', 'Badges')}</h2>
      <div className="card badge-list">
        {d.badges.length === 0 && <p className="muted">{t('pp.nobadges', 'Complete steps to earn badges.')}</p>}
        {d.badges.map((b) => (
          <div className="badge" key={b.code}>
            <span className="b-ic">{badgeIcon(b.code)}</span>
            <div>
              <b>{b.title}</b>
              <div className="small muted">
                {b.detail} {b.verified_by && b.verified_by !== 'system' ? `· ${t('pp.verified', 'verified by')} ${b.verified_by.split(':').slice(1).join(':')}` : ''} · {b.date}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
