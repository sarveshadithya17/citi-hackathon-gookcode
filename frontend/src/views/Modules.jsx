import { useState } from 'react';
import { Async, PriceTag } from '../components/ui.jsx';
import { post } from '../lib/api.js';
import { toast, useApi, useStudentPath } from '../lib/app-state.js';
import { inr, t } from '../lib/i18n.js';

export default function Modules() {
  const S = useStudentPath();
  const api = useApi('/modules');
  const [joined, setJoined] = useState(new Set());
  const join = async (id) => {
    try {
      const r = await post(S(`/modules/${id}/enrol`), {});
      setJoined((s) => new Set([...s, id]));
      toast(r.paid_inr ? t('mod.paid', 'Paid {p} (demo payment, UPI in the real app)', { p: inr(r.paid_inr) }) : `🏅 ${t('path.badge', 'Badge added to your Talent Passport')}`);
    } catch (e) { toast(e.status === 0 ? t('offline.needed', 'Please connect to the internet for this') : e.message); }
  };
  return (
    <Async api={api}>
      {(mods) => (
        <>
          <h1>📚 {t('home.modules', 'Learn from teachers')}</h1>
          <p className="muted">{t('mod.sub', 'Short lessons made by teachers, in your language.')}</p>
          {mods.map((m) => (
            <div className="card" key={m.id}>
              <h3>{m.title}</h3>
              <p className="small muted">👩‍🏫 {m.teacher} · {m.lessons.length} {t('mod.lessons', 'lessons')}</p>
              <p className="small">{m.description}</p>
              <div className="row">
                <PriceTag m={m} /><span className="grow" />
                {joined.has(m.id)
                  ? <span className="pill good">✓ {t('mod.joined', 'Joined')}</span>
                  : <button className="btn small" onClick={() => join(m.id)}>{t('mod.join', 'Join')}</button>}
              </div>
            </div>
          ))}
        </>
      )}
    </Async>
  );
}
