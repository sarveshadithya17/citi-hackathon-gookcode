import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorView, Loading } from '../components/ui.jsx';
import { get, post, queue } from '../lib/api.js';
import { toast, useApp, useStudentPath } from '../lib/app-state.js';
import { LANGS, t, useLang } from '../lib/i18n.js';
import { kv } from '../lib/store.js';
import { canListen, listen, speak, stopSpeaking } from '../lib/voice.js';

function autoSpeakOn() { try { return localStorage.getItem('thiran.autospeak') !== 'off'; } catch { return true; } }

function labelOf(q, choice) {
  if (!q?.options) return String(choice);
  const vals = Array.isArray(choice) ? choice : [choice];
  return q.options.filter((o) => vals.includes(o.value)).map((o) => o.label).join(', ');
}

// Tappable answers for the current question (single tap, or pick many + Done).
function Options({ q, onAnswer }) {
  const [picked, setPicked] = useState([]);
  useEffect(() => setPicked([]), [q?.id]);
  if (!q?.options) return null;
  const multi = q.type === 'multi';
  return (
    <div className="chips" style={{ marginBottom: 8 }}>
      {q.options.map((o, i) => (
        <button key={i} className={`chip ${picked.includes(o.value) ? 'on' : ''}`} onClick={() => {
          if (multi) setPicked(picked.includes(o.value) ? picked.filter((x) => x !== o.value) : [...picked, o.value]);
          else if (o.value === null) onAnswer({ skip: true, text: o.label });
          else onAnswer({ choice: o.value });
        }}>{o.icon ? `${o.icon} ` : ''}{o.label}</button>
      ))}
      {multi && <button className="chip" style={{ borderColor: 'var(--brand)' }} onClick={() => picked.length && onAnswer({ choice: picked })}>✅ {t('discover.done', 'Done')}</button>}
    </div>
  );
}

function Composer({ q, onAnswer, voice = true }) {
  const { lang } = useLang();
  const [text, setText] = useState('');
  const [live, setLive] = useState(false);
  const stopRef = useRef(null);
  const send = (v) => { const s = (v ?? text).trim(); if (s) { setText(''); onAnswer({ text: s }); } };
  const mic = () => {
    if (!canListen) { toast(t('voice.none', 'Voice input is not available in this browser. Please type or tap an answer.')); return; }
    if (stopRef.current) { stopRef.current(); return; }
    setLive(true);
    stopRef.current = listen(lang, {
      onText: (fin, interim) => setText(fin + interim),
      onEnd: (fin) => { setLive(false); stopRef.current = null; if (fin) send(fin); },
      onError: (err) => {
        setLive(false); stopRef.current = null;
        toast(err === 'network' ? t('voice.net', 'Voice needs internet on this phone. Please tap an answer.') : t('voice.err', 'Could not hear you. Please try again or type.'));
      },
    });
  };
  useEffect(() => () => stopRef.current && stopRef.current(), []);
  return (
    <div className="composer"><div className="inner">
      <Options q={q} onAnswer={onAnswer} />
      <div className="row">
        {voice && <button className={`mic ${live ? 'live' : ''}`} onClick={mic} aria-label={t('discover.speak', 'Speak')}>🎤</button>}
        <input className="input grow" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={voice ? t('discover.type', 'Speak or type your answer…') : t('discover.typeonly', 'Type your answer…')} autoComplete="off" />
        <button className="icon-btn" onClick={() => send()} aria-label="Send">➤</button>
      </div>
    </div></div>
  );
}

function Chat({ msgs }) {
  const end = useRef(null);
  const { lang } = useLang();
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs.length]);
  return (
    <div className="chat">
      {msgs.map((m, i) => (
        <div key={i} className={`msg ${m.role === 'user' ? 'me' : 'bot'} ${m.typing ? 'typing' : ''}`}>
          {m.typing ? <span className="dots" aria-label="…"><i /><i /><i /></span> : m.text}
          {m.role !== 'user' && !m.typing && <button className="say" onClick={() => speak(m.text, lang)}>🔊</button>}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

const PICK_TEXT = {
  en: { title: 'Which language do you want to talk in?', sub: 'Thiran will chat and speak in this language.', hello: 'Hello! Let us talk in English.' },
  ta: { title: 'எந்த மொழியில் பேச விரும்புகிறீர்கள்?', sub: 'திறன் இந்த மொழியில் பேசும், பதில் சொல்லும்.', hello: 'வணக்கம்! தமிழில் பேசலாம்.' },
  hi: { title: 'आप किस भाषा में बात करना चाहते हैं?', sub: 'थिरन इसी भाषा में बात करेगा और बोलेगा।', hello: 'नमस्ते! चलिए हिंदी में बात करते हैं।' },
};
const LANG_SUB = { en: 'English', ta: 'Tamil', hi: 'Hindi' };

// Discover always starts by asking which language to talk in; chat and voice then use it.
// (The dashboard switches back to English when the student returns to it.)
export default function Discover() {
  const { lang, setLang } = useLang();
  const [chosen, setChosen] = useState(null);
  const pick = async (code) => {
    await setLang(code);
    if (autoSpeakOn()) speak(PICK_TEXT[code].hello, code);
    setChosen(code);
  };
  if (chosen && chosen === lang) return <DiscoverChat onChangeLang={() => setChosen(null)} />;
  return (
    <div className="lang-pick">
      <div className="lang-pick-ic" aria-hidden="true">🗣️</div>
      {LANGS.map((l) => (
        <div key={l.code} className={l.code === 'en' ? 'lang-pick-q main' : 'lang-pick-q'} lang={l.code}>
          {PICK_TEXT[l.code].title}
        </div>
      ))}
      <div className="lang-pick-options">
        {LANGS.map((l) => (
          <button key={l.code} className="lang-pick-btn" lang={l.code} onClick={() => pick(l.code)}>
            <b>{l.name}</b>
            <span>{l.code === 'en' ? PICK_TEXT.en.sub : `${LANG_SUB[l.code]} · ${PICK_TEXT[l.code].sub}`}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DiscoverChat({ onChangeLang }) {
  const S = useStudentPath();
  const { lang } = useLang();
  const [state, setState] = useState({ loading: true });
  const [autoSay, setAutoSay] = useState(autoSpeakOn);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await get(S(`/chat?lang=${lang}`), { cache: false });
        if (!alive) return;
        // New chat: greet and ask the first question. Continuing chat: ask the next question again in the chosen language.
        const opener = d.messages.length ? d.question?.text : `${d.intro}\n\n${d.question?.text || ''}`;
        const msgs = opener ? [...d.messages, { role: 'assistant', text: opener }] : d.messages;
        setState({ msgs, question: d.question, ready: d.ready });
        if (opener && autoSpeakOn()) setTimeout(() => speak(opener, lang), 900);
      } catch (e) {
        if (alive) setState(e.status === 0 ? { offline: true } : { error: e });
      }
    })();
    return () => { alive = false; stopSpeaking(); };
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.offline) return <OfflineDiscover />;
  if (state.error) return <ErrorView error={state.error} />;
  if (state.loading) return <Loading />;

  const answer = async ({ text, choice, skip }) => {
    if (busy.current) return;
    const q = state.question;
    const shown = text || (choice !== undefined ? labelOf(q, choice) : '') || '—';
    busy.current = true;
    setState((s) => ({ ...s, question: null, msgs: [...s.msgs, { role: 'user', text: shown }, { role: 'assistant', text: '…', typing: true }] }));
    try {
      const body = { question_id: q?.id, lang };
      if (choice !== undefined) body.choice = choice; else if (skip) body.skip = true; else body.text = text;
      const r = await post(S('/chat'), body);
      setState((s) => ({ ...s, msgs: [...s.msgs.filter((m) => !m.typing), { role: 'assistant', text: r.reply }], question: r.question, ready: r.ready }));
      if (autoSay) speak(r.reply, lang);
    } catch (e) {
      if (e.status === 0) { toast(t('offline.chat', 'You went offline. Switching to the offline questions.')); setState({ offline: true }); }
      else { toast(e.message); setState((s) => ({ ...s, msgs: s.msgs.filter((m) => !m.typing), question: q })); }
    }
    busy.current = false;
  };

  const toggleSay = () => {
    const v = !autoSay;
    setAutoSay(v);
    try { localStorage.setItem('thiran.autospeak', v ? 'on' : 'off'); } catch {}
    if (!v) stopSpeaking();
  };

  return (
    <>
      <div className="row"><h1 className="grow">🎙️ {t('discover.title', 'Discover')}</h1>
        <button className="btn ghost small" onClick={onChangeLang} title={t('lang.switch', 'Change language')}>🌐 {LANGS.find((l) => l.code === lang)?.name}</button>
        <button className="btn ghost small" onClick={toggleSay}>{autoSay ? '🔊' : '🔇'} {t('discover.voice', 'Voice')}</button></div>
      <Chat msgs={state.msgs} />
      {state.ready && <div style={{ margin: '12px 0' }}><Link className="btn accent block" to="/careers">🧭 {t('discover.see', 'See my careers')}</Link></div>}
      <div className="composer-space" />
      <Composer q={state.question} onAnswer={answer} />
    </>
  );
}

// Offline Discover: the same questions, scripted on the phone. Answers are queued
// and analysed by the server (and the AI) when the phone reconnects.
function OfflineDiscover() {
  const { lang } = useLang();
  const { acting } = useApp();
  const [iv, setIv] = useState(null);
  const [asked, setAsked] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const key = `offline-asked:${acting ? acting.id : 'me'}`;
  const loc = (o) => (o ? o[lang] || o.en : '');

  useEffect(() => {
    (async () => {
      const d = await get('/meta/interview').catch(() => null);
      setIv(d);
      setAsked(new Set((await kv.get(key)) || []));
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const qs = iv?.questions?.filter((q) => q.type !== 'text' || q.id === 'dream') || [];
  const current = asked ? qs.find((q) => !asked.has(q.id)) : null;

  useEffect(() => {
    if (!iv || !asked) return;
    const text = current ? loc(current.text) : loc(iv.done);
    setMsgs((m) => (m.length ? [...m, { role: 'assistant', text }] : [{ role: 'assistant', text: loc(iv.intro) }, { role: 'assistant', text }]));
    if (autoSpeakOn()) speak(text, lang);
  }, [iv, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!iv) return iv === null && asked ? <ErrorView error={{ status: 0 }} /> : <Loading />;

  const q = current && {
    ...current,
    options: current.options?.map((o) => ({ ...o, label: loc(o.label) })),
  };
  const onAnswer = async (a) => {
    if (!current) return;
    const shown = a.text || (a.choice !== undefined ? labelOf(q, a.choice) : '—');
    setMsgs((m) => [...m, { role: 'user', text: shown }]);
    const payload = { question_id: current.id };
    if (a.choice !== undefined) payload.choice = a.choice; else if (a.skip) payload.skip = true; else payload.text = a.text;
    await queue('answers', acting?.id, { answers: [payload], lang });
    const next = new Set(asked); next.add(current.id);
    await kv.set(key, [...next]);
    setAsked(next);
  };

  return (
    <>
      <h1>🎙️ {t('discover.title', 'Discover')} <span className="pill warn">📴 {t('offline.short', 'Offline')}</span></h1>
      <p className="muted">{t('offline.discover', 'No internet now, so I will ask simple questions. Thiran will study your answers when you are back online.')}</p>
      <Chat msgs={msgs} />
      <div className="composer-space" />
      {current && <Composer q={q} onAnswer={onAnswer} voice={false} />}
    </>
  );
}
