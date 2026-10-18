import { useEffect, useState } from 'react';
import { Async, ErrorView, Loading, PassportCard } from '../components/ui.jsx';
import { toast, useApi, useStudentPath } from '../lib/app-state.js';
import { t } from '../lib/i18n.js';

export function MyPassport() {
  const S = useStudentPath();
  const api = useApi(S('/passport'));
  return (
    <Async api={api}>
      {(d) => {
        const url = location.origin + d.public_url;
        const share = async () => {
          if (navigator.share) { try { await navigator.share({ title: 'Thiran Talent Passport', url }); } catch {} return; }
          try { await navigator.clipboard.writeText(url); toast(t('pp.copied', 'Link copied')); } catch { toast(url, 6000); }
        };
        return (
          <>
            <PassportCard d={d} />
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row">
                <img className="qr" src={`/api/v1/passport/${d.slug}/qr.svg`} alt="QR code" />
                <div className="grow stack">
                  <p className="small">{t('pp.share', 'Show this QR code or share the link with an employer or college.')}</p>
                  <button className="btn small" onClick={share}>🔗 {t('pp.sharebtn', 'Share my passport')}</button>
                  <p className="small muted">🔒 {t('pp.privacy', 'Employers see your first name only. They contact you through your teacher.')}</p>
                </div>
              </div>
            </div>
          </>
        );
      }}
    </Async>
  );
}

// Public page at /p/<slug>: no login, no contact details.
export function PublicPassport({ slug }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    fetch(`/api/v1/passport/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'Passport not found' : `Error ${r.status}`))))
      .then((x) => { setD(x); document.title = `${x.name} · Talent Passport`; })
      .catch((e) => setErr(e));
  }, [slug]);
  return (
    <>
      <header className="topbar"><a className="logo" href="/" style={{ color: 'inherit', textDecoration: 'none' }}>திறன் <small>Thiran · Talent Passport</small></a></header>
      <main>
        {err ? <ErrorView error={err} /> : !d ? <Loading /> : (
          <>
            <PassportCard d={d} />
            <div className="card" style={{ marginTop: 12 }}>
              <p className="small">🔒 {t('pp.public', 'Contact details are private. Employers registered on Thiran can request contact through the student’s teacher.')}</p>
            </div>
          </>
        )}
      </main>
    </>
  );
}
