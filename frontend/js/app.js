import { ApiError, doOrQueue, get, net, onNet, patch, post, queue, setToken, sync, token } from './api.js';
import { LANGS, getLang, initialLang, setLang, t } from './i18n.js';
import { kv } from './store.js';
import { canListen, listen, speak, stopSpeaking } from './voice.js';

// ------------------------------------------------------------------ helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const main = () => $('main');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => (n == null ? '' : '₹' + Number(n).toLocaleString('en-IN'));
const go = (h) => { location.hash = h; };
const eduLabel = (e) => ({
  class8: t('edu.class8', 'Class 8'), class9: t('edu.class9', 'Class 9'), class10: t('edu.class10', 'Class 10'),
  class11: t('edu.class11', 'Class 11'), class12: t('edu.class12', 'Class 12'), iti: t('edu.iti', 'ITI'),
  diploma: t('edu.diploma', 'Diploma'), ug: t('edu.ug', 'College (UG)'), pg: t('edu.pg', 'Postgraduate'),
}[e] || '—');

const state = {
  user: null,
  acting: null, // {id, name} when a teacher uses the app for a student on their roster
  autoSpeak: true,
};
try {
  state.acting = JSON.parse(sessionStorage.getItem('thiran.acting') || 'null');
  state.autoSpeak = localStorage.getItem('thiran.autospeak') !== 'off';
} catch {}

const sid = () => (state.acting ? state.acting.id : 'me');
const S = (path) => `/students/${sid()}${path}`;
const L = () => `lang=${getLang()}`;

function toast(msg, ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function sayBtn(text) {
  return `<button class="icon-btn say-btn" data-say="${esc(text)}" aria-label="${esc(t('listen', 'Listen'))}" title="${esc(t('listen', 'Listen'))}">🔊</button>`;
}

function render(html) {
  stopSpeaking();
  main().innerHTML = actingBanner() + offlineBanner() + html;
  window.scrollTo(0, 0);
}

function loading() { main().innerHTML = `<p class="muted"><span class="spinner"></span> ${esc(t('loading', 'Loading…'))}</p>`; }

function offlineBanner() {
  if (net.online) return '';
  return `<div class="banner">📴 ${esc(t('offline.banner', 'You are offline. Saved screens still work, and your changes will sync when you are back online.'))}</div>`;
}

function actingBanner() {
  if (!state.acting) return '';
  return `<div class="banner"><span class="grow">👩‍🏫 ${esc(t('acting.as', 'Using Thiran for {name}', { name: state.acting.name }))}</span>
    <button class="btn small secondary" id="stop-acting">${esc(t('acting.back', 'Back to class'))}</button></div>`;
}

function stalePill(d) {
  return d && d._offline ? `<span class="pill warn">📴 ${esc(t('offline.saved', 'Saved copy'))}</span>` : '';
}

function errorView(e) {
  if (e instanceof ApiError && e.status === 0) {
    render(`<div class="card"><h2>📴 ${esc(t('offline.title', 'No internet'))}</h2><p>${esc(t('offline.notyet', 'This screen has not been saved on your phone yet. Open it once when you are online.'))}</p></div>`);
  } else {
    render(`<div class="card"><h2>${esc(t('error', 'Something went wrong'))}</h2><p class="muted">${esc(e.message)}</p></div>`);
  }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-say]');
  if (b) { speak(b.dataset.say, getLang()); return; }
  if (e.target.closest('#stop-acting')) {
    state.acting = null;
    try { sessionStorage.removeItem('thiran.acting'); } catch {}
    go('#/t');
  }
});

// ------------------------------------------------------------------ top bar
function topbar() {
  const u = state.user;
  const status = net.online
    ? (net.pending ? `<span class="net">⏫ ${net.pending}</span>` : '')
    : `<span class="net off">📴 ${esc(t('offline.short', 'Offline'))}</span>`;
  $('#topbar').innerHTML = `
    <a class="logo" href="#/" style="color:inherit;text-decoration:none">திறன் <small>Thiran</small></a>
    <span class="spacer"></span>${status}
    <button id="lang-btn" aria-label="Language">${esc(LANGS.find((l) => l.code === getLang())?.name || 'Lang')}</button>
    ${u ? `<button id="logout" aria-label="Log out">⎋</button>` : ''}`;
  $('#lang-btn').onclick = async () => {
    const i = LANGS.findIndex((l) => l.code === getLang());
    const next = LANGS[(i + 1) % LANGS.length].code;
    await setLang(next);
    if (state.user) post('/auth/me/language', { language: next }).catch(() => {});
    topbar();
    route();
  };
  if (u) $('#logout').onclick = () => {
    setToken(null); state.user = null; state.acting = null;
    try { sessionStorage.removeItem('thiran.acting'); } catch {}
    go('#/login');
  };
}
onNet(() => topbar());

// ------------------------------------------------------------------ login
const DEMOS = [
  ['9000000001', '🧑‍🎓', 'Meena S', 'Student, Class 11 (profile done)'],
  ['9000000006', '🧑‍🎓', 'Kavya R', 'New student: try Discover'],
  ['9000000002', '👩‍🏫', 'Raju K', 'Government school teacher'],
  ['9000000003', '🏥', 'MedLab Diagnostics', 'Employer'],
  ['9000000004', '🤝', 'Vidiyal Foundation', 'CSR / NGO'],
];

function viewLogin() {
  render(`
    <h1>${esc(t('login.title', 'Find what you are good at. Build it. Earn from it.'))}</h1>
    <p class="muted">${esc(t('login.sub', 'Talk to Thiran in your language. It is free for students.'))}</p>
    <h2>${esc(t('login.lang', 'Choose your language'))}</h2>
    <div class="langs">${LANGS.map((l) => `<button class="lang ${l.code === getLang() ? 'on' : ''}" data-lang="${l.code}">${l.name}</button>`).join('')}</div>
    <div class="card" style="margin-top:16px">
      <form id="login-form">
        <label class="field"><span>📱 ${esc(t('login.phone', 'Phone number'))}</span>
          <input class="input" name="phone" inputmode="numeric" pattern="\\d{10}" maxlength="10" required autocomplete="tel"></label>
        <label class="field"><span>🔢 ${esc(t('login.pin', '4-digit PIN'))}</span>
          <input class="input" name="pin" type="password" inputmode="numeric" pattern="\\d{4}" maxlength="4" required></label>
        <div id="reg-fields" class="hidden">
          <label class="field"><span>${esc(t('login.name', 'Your name'))}</span><input class="input" name="name"></label>
          <label class="field"><span>${esc(t('login.role', 'I am a'))}</span>
            <select name="role">
              <option value="student">🧑‍🎓 ${esc(t('role.student', 'Student'))}</option>
              <option value="teacher">👩‍🏫 ${esc(t('role.teacher', 'Teacher / facilitator'))}</option>
              <option value="employer">🏢 ${esc(t('role.employer', 'Employer / NGO / CSR'))}</option>
            </select></label>
          <label class="field hidden" id="org-field"><span>${esc(t('login.org', 'Organisation name'))}</span><input class="input" name="org_name"></label>
          <label class="field"><span>${esc(t('login.district', 'District'))}</span><input class="input" name="district" placeholder="Madurai"></label>
        </div>
        <button class="btn block" type="submit" id="login-submit">${esc(t('login.go', 'Log in'))}</button>
        <p class="small" style="text-align:center"><a href="#" id="toggle-reg">${esc(t('login.new', 'New here? Create an account'))}</a></p>
      </form>
    </div>
    <h2>${esc(t('login.demo', 'Demo accounts'))} <span class="pill">PIN 1234</span></h2>
    <div class="demo-list">${DEMOS.map(([ph, ic, n, d]) => `
      <button class="card row" data-demo="${ph}" style="cursor:pointer;width:100%;border:1px solid var(--line)">
        <span style="font-size:26px">${ic}</span><span class="grow"><b>${esc(n)}</b><br><span class="small muted">${esc(d)} · ${ph}</span></span><span>›</span>
      </button>`).join('')}</div>`);

  $$('[data-lang]').forEach((b) => b.onclick = async () => { await setLang(b.dataset.lang); topbar(); viewLogin(); });
  let registering = false;
  const form = $('#login-form');
  $('#toggle-reg').onclick = (e) => {
    e.preventDefault(); registering = !registering;
    $('#reg-fields').classList.toggle('hidden', !registering);
    $('#login-submit').textContent = registering ? t('login.create', 'Create account') : t('login.go', 'Log in');
  };
  form.role.onchange = () => $('#org-field').classList.toggle('hidden', form.role.value !== 'employer');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    try {
      const res = registering
        ? await post('/auth/register', { phone: f.phone, pin: f.pin, name: f.name || 'Student', role: f.role, language: getLang(), org_name: f.org_name || null, district: f.district || null })
        : await post('/auth/login', { phone: f.phone, pin: f.pin });
      await afterLogin(res);
    } catch (err) { toast(err.status === 0 ? t('offline.login', 'You need internet to log in the first time') : err.message); }
  };
  $$('[data-demo]').forEach((b) => b.onclick = async () => {
    try { await afterLogin(await post('/auth/login', { phone: b.dataset.demo, pin: '1234' })); }
    catch (err) { toast(err.message); }
  });
}

async function afterLogin(res) {
  setToken(res.token);
  state.user = res.user;
  await kv.set('me', res.user);
  if (res.user.language && res.user.language !== getLang()) await setLang(res.user.language);
  topbar();
  go(homeFor(res.user));
}

const homeFor = (u) => ({ teacher: '#/t', employer: '#/e', mentor: '#/m' }[u.role] || '#/home');

// ------------------------------------------------------------------ student home
async function viewHome() {
  loading();
  let p;
  try { p = await get(S('/profile')); } catch (e) { return errorView(e); }
  const name = (p.profile.name || p.name || '').split(' ')[0];
  const ready = p.ready;
  render(`
    <h1>${esc(t('home.hello', 'Vanakkam, {name}!', { name }))}</h1>
    <div class="row" style="margin-bottom:12px"><div class="grow progress"><i style="width:${p.profile.completeness || 0}%"></i></div>
      <span class="small muted">${esc(t('home.profile', 'Profile {n}%', { n: p.profile.completeness || 0 }))}</span></div>
    <div class="tiles">
      <a class="tile primary" href="#/discover"><span class="ic">🎙️</span><b>${esc(ready ? t('home.talk', 'Talk to Thiran') : t('home.discover', 'Discover what you are good at'))}</b>
        <span>${esc(ready ? t('home.talk.sub', 'Tell me more about yourself') : t('home.discover.sub', 'Answer a few easy questions by voice'))}</span></a>
      <a class="tile" href="#/careers"><span class="ic">🧭</span><b>${esc(t('home.careers', 'My careers'))}</b><span>${esc(t('home.careers.sub', 'Jobs that suit you'))}</span></a>
      <a class="tile" href="#/pathway"><span class="ic">🪜</span><b>${esc(t('home.path', 'My path'))}</b><span>${esc(t('home.path.sub', 'Step by step plan'))}</span></a>
      <a class="tile" href="#/opportunities"><span class="ic">🎁</span><b>${esc(t('home.opps', 'Scholarships and jobs'))}</b><span>${esc(t('home.opps.sub', 'Money and work you can get'))}</span></a>
      <a class="tile" href="#/passport"><span class="ic">🪪</span><b>${esc(t('home.passport', 'Talent Passport'))}</b><span>${esc(t('home.passport.sub', 'Your badges and endorsements'))}</span></a>
      <a class="tile" href="#/modules"><span class="ic">📚</span><b>${esc(t('home.modules', 'Learn from teachers'))}</b><span>${esc(t('home.modules.sub', 'Short lessons in your language'))}</span></a>
    </div>`);
}

// ------------------------------------------------------------------ discover (voice chat)
async function viewDiscover() {
  loading();
  let data;
  try {
    data = await get(S(`/chat?${L()}`), { cache: false });
  } catch (e) {
    if (e.status === 0) return offlineDiscover();
    return errorView(e);
  }
  const msgs = data.messages.length ? data.messages : [{ role: 'assistant', text: data.intro + '\n\n' + (data.question?.text || '') }];
  render(`
    <div class="row"><h1 class="grow">🎙️ ${esc(t('discover.title', 'Discover'))}</h1>
      <button class="btn ghost small" id="auto-say">${state.autoSpeak ? '🔊' : '🔇'} ${esc(t('discover.voice', 'Voice'))}</button></div>
    <div class="chat" id="chat"></div>
    <div id="ready-bar" class="${data.ready ? '' : 'hidden'}" style="margin:12px 0">
      <a class="btn accent block" href="#/careers">🧭 ${esc(t('discover.see', 'See my careers'))}</a></div>
    <div style="height:170px"></div>
    <div class="composer"><div class="inner">
      <div id="options" class="chips" style="margin-bottom:8px"></div>
      <div class="row">
        <button class="mic" id="mic" aria-label="${esc(t('discover.speak', 'Speak'))}">🎤</button>
        <input class="input grow" id="say" placeholder="${esc(t('discover.type', 'Speak or type your answer…'))}" autocomplete="off">
        <button class="icon-btn" id="send" aria-label="Send">➤</button>
      </div></div></div>`);
  const chat = $('#chat');
  const add = (role, text) => {
    const div = document.createElement('div');
    div.className = 'msg ' + (role === 'user' ? 'me' : 'bot');
    div.innerHTML = esc(text) + (role === 'user' ? '' : ` <button class="say" data-say="${esc(text)}">🔊</button>`);
    chat.appendChild(div);
    div.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return div;
  };
  msgs.forEach((m) => add(m.role, m.text));
  let question = data.question;
  renderOptions(question);
  if (!data.messages.length && state.autoSpeak) speak(msgs[0].text, getLang());

  $('#auto-say').onclick = () => {
    state.autoSpeak = !state.autoSpeak;
    try { localStorage.setItem('thiran.autospeak', state.autoSpeak ? 'on' : 'off'); } catch {}
    $('#auto-say').innerHTML = `${state.autoSpeak ? '🔊' : '🔇'} ${esc(t('discover.voice', 'Voice'))}`;
    if (!state.autoSpeak) stopSpeaking();
  };

  function renderOptions(q) {
    const box = $('#options');
    if (!q || !q.options) { box.innerHTML = ''; return; }
    const multi = q.type === 'multi';
    box.innerHTML = q.options.map((o, i) => `<button class="chip" data-i="${i}">${o.icon ? esc(o.icon) + ' ' : ''}${esc(o.label)}</button>`).join('')
      + (multi ? `<button class="chip" id="multi-done" style="border-color:var(--brand)">✅ ${esc(t('discover.done', 'Done'))}</button>` : '');
    const picked = new Set();
    $$('.chip[data-i]', box).forEach((b) => b.onclick = () => {
      const o = q.options[+b.dataset.i];
      if (multi) { b.classList.toggle('on'); picked.has(o.value) ? picked.delete(o.value) : picked.add(o.value); }
      else if (o.value === null) send({ skip: true, text: o.label });
      else send({ choice: o.value });
    });
    if (multi) $('#multi-done').onclick = () => picked.size && send({ choice: [...picked] });
  }

  let busy = false;
  async function send({ text, choice, skip }) {
    if (busy) return;
    const shown = text || (choice !== undefined ? labelOf(question, choice) : '');
    if (!shown && !skip) return;
    busy = true;
    add('user', shown || '—');
    $('#say').value = '';
    $('#options').innerHTML = '';
    const wait = add('assistant', '…');
    wait.classList.add('typing');
    try {
      const body = { question_id: question?.id, lang: getLang() };
      if (choice !== undefined) body.choice = choice; else if (skip) { body.skip = true; } else body.text = text;
      const r = await post(S('/chat'), body);
      wait.remove();
      add('assistant', r.reply);
      if (state.autoSpeak) speak(r.reply, getLang());
      question = r.question;
      renderOptions(question);
      $('#ready-bar').classList.toggle('hidden', !r.ready);
    } catch (e) {
      wait.remove();
      if (e.status === 0) { toast(t('offline.chat', 'You went offline. Switching to the offline questions.')); return offlineDiscover(); }
      toast(e.message);
      renderOptions(question);
    }
    busy = false;
  }

  $('#send').onclick = () => send({ text: $('#say').value.trim() });
  $('#say').onkeydown = (e) => { if (e.key === 'Enter') send({ text: $('#say').value.trim() }); };
  setupMic(send);
}

function labelOf(q, choice) {
  if (!q || !q.options) return String(choice);
  const vals = Array.isArray(choice) ? choice : [choice];
  return q.options.filter((o) => vals.includes(o.value)).map((o) => o.label).join(', ');
}

function setupMic(send) {
  const mic = $('#mic');
  if (!canListen) { mic.onclick = () => toast(t('voice.none', 'Voice input is not available in this browser. Please type or tap an answer.')); return; }
  let stop = null;
  mic.onclick = () => {
    if (stop) { stop(); return; }
    mic.classList.add('live');
    stop = listen(getLang(), {
      onText: (fin, interim) => { $('#say').value = fin + interim; },
      onEnd: (fin) => { mic.classList.remove('live'); stop = null; if (fin) send({ text: fin }); },
      onError: (err) => {
        mic.classList.remove('live'); stop = null;
        toast(err === 'network' ? t('voice.net', 'Voice needs internet on this phone. Please tap an answer.') : t('voice.err', 'Could not hear you. Please try again or type.'));
      },
    });
  };
}

// Offline Discover: the same questions, scripted on the phone. Answers are queued
// and analysed by the server (and the AI) when the phone reconnects.
async function offlineDiscover() {
  const iv = await get('/meta/interview').catch(() => null);
  if (!iv || !iv.questions) return errorView(new ApiError(0, 'offline'));
  const lang = getLang();
  const key = `offline-asked:${sid()}`;
  const asked = new Set((await kv.get(key)) || []);
  const qs = iv.questions.filter((q) => q.type !== 'text' || q.id === 'dream');
  render(`
    <h1>🎙️ ${esc(t('discover.title', 'Discover'))} <span class="pill warn">📴 ${esc(t('offline.short', 'Offline'))}</span></h1>
    <p class="muted">${esc(t('offline.discover', 'No internet now, so I will ask simple questions. Thiran will study your answers when you are back online.'))}</p>
    <div class="chat" id="chat"></div><div style="height:170px"></div>
    <div class="composer"><div class="inner"><div id="options" class="chips"></div>
      <div class="row" style="margin-top:8px"><input class="input grow" id="say" placeholder="${esc(t('discover.typeonly', 'Type your answer…'))}"><button class="icon-btn" id="send">➤</button></div>
    </div></div>`);
  const chat = $('#chat');
  const add = (role, text) => { const d = document.createElement('div'); d.className = 'msg ' + (role === 'user' ? 'me' : 'bot'); d.textContent = text; chat.appendChild(d); d.scrollIntoView({ block: 'end' }); };
  const loc = (o) => o[lang] || o.en;
  function next() {
    const q = qs.find((x) => !asked.has(x.id));
    if (!q) { add('bot', loc(iv.done)); $('#options').innerHTML = ''; return; }
    add('bot', loc(q.text));
    if (state.autoSpeak) speak(loc(q.text), lang);
    const multi = q.type === 'multi';
    const picked = new Set();
    $('#options').innerHTML = (q.options || []).map((o, i) => `<button class="chip" data-i="${i}">${o.icon ? esc(o.icon) + ' ' : ''}${esc(loc(o.label))}</button>`).join('')
      + (multi ? `<button class="chip" id="md">✅ ${esc(t('discover.done', 'Done'))}</button>` : '');
    const answer = async (a, shown) => {
      add('user', shown);
      asked.add(q.id);
      await kv.set(key, [...asked]);
      await queue('answers', state.acting?.id, { answers: [{ question_id: q.id, ...a }], lang });
      next();
    };
    $$('.chip[data-i]').forEach((b) => b.onclick = () => {
      const o = q.options[+b.dataset.i];
      if (multi) { b.classList.toggle('on'); picked.has(o.value) ? picked.delete(o.value) : picked.add(o.value); }
      else answer(o.value === null ? { skip: true } : { choice: o.value }, loc(o.label));
    });
    if (multi) $('#md').onclick = () => picked.size && answer({ choice: [...picked] }, q.options.filter((o) => picked.has(o.value)).map((o) => loc(o.label)).join(', '));
    $('#send').onclick = () => { const v = $('#say').value.trim(); if (v) { $('#say').value = ''; answer({ text: v }, v); } };
  }
  add('bot', loc(iv.intro));
  next();
}

// ------------------------------------------------------------------ careers
async function viewCareers() {
  loading();
  let d;
  try { d = await get(S(`/careers?${L()}`)); } catch (e) {
    if (e.status === 409) return render(`<div class="card"><h2>🎙️ ${esc(t('careers.first', 'First, tell Thiran about yourself'))}</h2><a class="btn" href="#/discover">${esc(t('home.discover', 'Discover what you are good at'))}</a></div>`);
    return errorView(e);
  }
  render(`
    <h1>🧭 ${esc(t('careers.title', 'Careers that suit you'))} ${stalePill(d)}</h1>
    <p class="muted">${esc(t('careers.sub', 'From {n} different fields, not just doctor or engineer. Tap one to see your path.', { n: d.categories.length }))}</p>
    ${d.careers.map((c) => `
      <div class="card career">
        <div class="top"><div class="grow"><h3>${esc(c.name)} ${d.chosen === c.id ? '<span class="pill good">⭐ ' + esc(t('careers.goal', 'My goal')) + '</span>' : ''}</h3>
          <span class="pill brand">${esc(c.category_label)}</span> ${c.local_demand === 'high' ? `<span class="pill accent">📍 ${esc(t('careers.local', 'Jobs nearby'))}</span>` : ''}</div>
          <div class="fit">${c.fit}%<div class="small muted" style="font-weight:400">${esc(t('careers.match', 'match'))}</div></div></div>
        <p class="small">${esc(c.description)}</p>
        <div class="why">💡 ${esc(c.why)}</div>
        <div class="facts"><span>⏱️ ${esc(c.training_time)}</span>${c.salary_inr_month ? `<span>💰 ${inr(c.salary_inr_month[0])}–${inr(c.salary_inr_month[1])}/${esc(t('month', 'month'))}</span>` : ''}</div>
        <div class="row">${sayBtn(c.name + '. ' + c.why)}<a class="btn small grow" href="#/pathway/${c.id}">🪜 ${esc(t('careers.path', 'Show my path'))}</a></div>
      </div>`).join('')}`);
}

// ------------------------------------------------------------------ pathway
async function viewPathway(cid) {
  loading();
  let d;
  try { d = await get(S(`/pathway?${cid ? 'career_id=' + cid + '&' : ''}${L()}`)); } catch (e) {
    if (e.status === 409) return render(`<div class="card"><h2>🧭 ${esc(t('path.choose', 'Choose a career first'))}</h2><a class="btn" href="#/careers">${esc(t('home.careers', 'My careers'))}</a></div>`);
    return errorView(e);
  }
  cid = d.career_id;
  const overrides = (await kv.get(`progress:${sid()}:${cid}`)) || {};
  d.steps.forEach((s, i) => { if (i in overrides) s.done = overrides[i]; });
  const profile = await get(S('/profile')).catch(() => null);
  const isGoal = profile && profile.profile.chosen_career === cid;
  const pct = () => Math.round(100 * d.steps.filter((s) => s.done).length / d.steps.length);
  const icon = { education: '🏫', course: '💻', exam: '📝', apprenticeship: '🛠️', job: '💼', practice: '🎯' };
  render(`
    <h1>🪜 ${esc(d.career)} ${stalePill(d)}</h1>
    ${d.intro ? `<div class="card row"><p class="grow" style="margin:0">${esc(d.intro)}</p>${sayBtn(d.intro)}</div>` : ''}
    <div class="row" style="margin:12px 0"><div class="progress grow"><i id="pbar" style="width:${pct()}%"></i></div><b id="ptext">${pct()}%</b></div>
    ${isGoal ? '' : `<button class="btn accent block" id="make-goal">⭐ ${esc(t('path.goal', 'Make this my goal'))}</button>`}
    <div class="card" style="margin-top:12px"><ol class="steps">${d.steps.map((s, i) => `
      <li class="step"><button class="check ${s.done ? 'on' : ''}" data-step="${i}" aria-label="done">${s.done ? '✓' : ''}</button>
        <div class="grow"><b>${icon[s.type] || '•'} ${esc(s.title)}</b>
          ${s.tip ? `<p class="small">💡 ${esc(s.tip)}</p>` : ''}
          <div class="facts">${s.duration ? `<span>⏱️ ${esc(s.duration)}</span>` : ''}${s.when ? `<span>📅 ${esc(s.when)}</span>` : ''}${s.provider ? `<span>🏛️ ${esc(s.provider)}</span>` : ''}${s.free ? `<span class="pill good">${esc(t('free', 'Free'))}</span>` : ''}</div>
          ${s.url ? `<a class="small" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(t('path.open', 'Open'))} ↗</a>` : ''}
        </div></li>`).join('')}</ol></div>
    ${d.resources.length ? `<h2>💻 ${esc(t('path.more', 'More free courses'))}</h2>${d.resources.map((r) => `
      <div class="card"><b>${esc(r.title)}</b><div class="facts"><span>🏛️ ${esc(r.provider)}</span><span>⏱️ ${esc(r.duration || '')}</span></div><a class="small" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(t('path.open', 'Open'))} ↗</a></div>`).join('')}` : ''}
    ${d.exams.length ? `<h2>📝 ${esc(t('path.exams', 'Exams to know about'))}</h2>${d.exams.map((x) => `
      <div class="card"><b>${esc(x.name)}</b><p class="small">${esc(x.purpose || '')}</p><div class="facts">${x.when ? `<span>📅 ${esc(x.when)}</span>` : ''}<span>✅ ${esc(x.eligibility || '')}</span></div><a class="small" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(t('path.open', 'Open'))} ↗</a></div>`).join('')}` : ''}
    <p class="small muted">📚 ${esc(t('path.source', 'Source'))}: ${esc(d.source)}</p>`);

  $$('[data-step]').forEach((b) => b.onclick = async () => {
    const i = +b.dataset.step;
    const done = !d.steps[i].done;
    d.steps[i].done = done;
    b.classList.toggle('on', done); b.textContent = done ? '✓' : '';
    $('#pbar').style.width = pct() + '%'; $('#ptext').textContent = pct() + '%';
    overrides[i] = done;
    await kv.set(`progress:${sid()}:${cid}`, overrides);
    try {
      const r = await doOrQueue('progress', state.acting?.id, S('/progress'), { career_id: cid, step_index: i, done });
      if (r.queued) toast(t('offline.queued', 'Saved on your phone. It will sync when you are online.'));
      else if (done) toast('🏅 ' + t('path.badge', 'Badge added to your Talent Passport'));
    } catch (e) { toast(e.message); }
  });
  const mg = $('#make-goal');
  if (mg) mg.onclick = async () => {
    try { await post(S('/career'), { career_id: cid }); toast('⭐ ' + t('path.goalset', 'Goal saved')); mg.remove(); }
    catch (e) { toast(e.status === 0 ? t('offline.needed', 'Please connect to the internet for this') : e.message); }
  };
}

// ------------------------------------------------------------------ opportunities
async function viewOpportunities() {
  loading();
  let d;
  try { d = await get(S(`/opportunities?${L()}`)); } catch (e) { return errorView(e); }
  const applied = new Set(d.applied);
  const sch = d.eligible.filter((x) => x.kind === 'scholarship');
  const schemes = d.eligible.filter((x) => x.kind === 'scheme');
  const summary = t('opps.summary', 'You can get {a} scholarships and {b} government schemes.', { a: sch.length, b: schemes.length });
  const kbCard = (x, maybe) => `
    <div class="card">
      <div class="row"><h3 class="grow">${esc(x.name)}</h3>${applied.has('kb:' + x.id) ? `<span class="pill good">✓ ${esc(t('opps.applied', 'Applied'))}</span>` : ''}</div>
      <p class="small muted">${esc(x.provider)}</p>
      ${x.benefit ? `<p>💰 <b>${esc(x.benefit)}</b></p>` : ''}
      <div class="small"><b>${esc(t('opps.why', 'Why you qualify'))}:</b><br>${x.reasons.map((r) => '✅ ' + esc(r)).join('<br>')}
        ${maybe && x.missing.length ? `<br>❓ ${esc(t('opps.need', 'Tell us'))}: ${esc(x.missing.join(', '))}` : ''}
        ${maybe && x.conditions.length ? `<br>☑️ ${esc(t('opps.onlyif', 'Only if'))}: ${esc(x.conditions.join('; '))}` : ''}</div>
      <details style="margin-top:6px"><summary class="small">${esc(t('opps.how', 'How to apply and documents'))}</summary>
        <p class="small">${esc(x.how_to_apply || '')}</p><p class="small">📄 ${esc((x.documents || []).join(' · '))}</p>
        ${x.deadline_note ? `<p class="small">📅 ${esc(x.deadline_note)}</p>` : ''}
        <p class="small muted">${esc(t('path.source', 'Source'))}: <a href="${esc(x.source_url)}" target="_blank" rel="noopener">${esc((x.source_url || '').replace(/^https?:\/\//, '').split('/')[0])}</a> · ${esc(t('opps.verified', 'checked'))} ${esc(x.last_verified)}</p></details>
      <div class="row" style="margin-top:8px">${sayBtn(x.name + '. ' + (x.benefit || '') + '. ' + x.reasons.join('. '))}
        <a class="btn small grow" href="${esc(x.apply_url)}" target="_blank" rel="noopener">${esc(t('opps.portal', 'Apply on official site'))} ↗</a>
        ${applied.has('kb:' + x.id) ? '' : `<button class="btn small secondary" data-apply="kb:${esc(x.id)}">✓ ${esc(t('opps.mark', 'I applied'))}</button>`}</div>
    </div>`;
  render(`
    <h1>🎁 ${esc(t('home.opps', 'Scholarships and jobs'))} ${stalePill(d)}</h1>
    <div class="card row" style="background:var(--good-soft)"><b class="grow">🎉 ${esc(summary)}</b>${sayBtn(summary)}</div>
    ${d.recommended.length ? `<h2>👩‍🏫 ${esc(t('opps.recommended', 'Recommended by your teacher'))}</h2>${d.recommended.map((r) => `
      <div class="card"><b>${esc(r.opportunity.title)}</b><p class="small muted">${esc(r.opportunity.org)} · ${esc(r.opportunity.district || '')}</p>
        <p class="small">💬 ${esc(r.teacher)}: ${esc(r.note || '')}</p></div>`).join('')}` : ''}
    <h2>🎓 ${esc(t('opps.sch', 'Scholarships for you'))}</h2>${sch.map((x) => kbCard(x)).join('') || `<p class="muted">${esc(t('opps.none', 'None found yet. Complete your profile to find more.'))}</p>`}
    <h2>🏛️ ${esc(t('opps.schemes', 'Government schemes for you'))}</h2>${schemes.map((x) => kbCard(x)).join('') || `<p class="muted">${esc(t('opps.none', 'None found yet. Complete your profile to find more.'))}</p>`}
    ${d.maybe.length ? `<h2>❓ ${esc(t('opps.maybe', 'You may also qualify'))}</h2>${d.maybe.map((x) => kbCard(x, true)).join('')}` : ''}
    <h2>🛠️ ${esc(t('opps.listings', 'Apprenticeships and jobs near you'))}</h2>
    ${d.listings.map((o) => `
      <div class="card"><div class="row"><h3 class="grow">${esc(o.title)}</h3><b style="color:var(--brand)">${o.fit}%</b></div>
        <p class="small muted">${esc(o.org)} · 📍 ${esc(o.district || '')} ${o.naps ? '· <span class="pill brand">NAPS</span>' : ''} ${o.sponsored ? '· <span class="pill accent">CSR</span>' : ''}</p>
        <div class="facts">${o.stipend_inr_month ? `<span>💰 ${inr(o.stipend_inr_month)}/${esc(t('month', 'month'))}</span>` : ''}${o.duration ? `<span>⏱️ ${esc(o.duration)}</span>` : ''}</div>
        <p class="small">✅ ${esc(o.why.join(' · '))}</p>
        ${applied.has('opp:' + o.id) ? `<span class="pill good">✓ ${esc(t('opps.applied', 'Applied'))}</span>` : `<button class="btn small" data-apply="opp:${o.id}">${esc(t('opps.apply', 'Apply with my Talent Passport'))}</button>`}
      </div>`).join('') || `<p class="muted">${esc(t('opps.nolist', 'No listings match yet.'))}</p>`}
    ${d.mentors.length ? `<h2>🤝 ${esc(t('opps.mentors', 'Mentors who can guide you'))}</h2>${d.mentors.map((m) => `
      <div class="card"><b>${esc(m.name)}</b><p class="small muted">${esc(m.title)} · ${esc(m.district || '')}</p><p class="small">${esc(t('opps.mentorfor', 'Can guide you on'))}: ${esc(m.careers.join(', '))}</p>
      <p class="small muted">${esc(t('opps.mentorvia', 'Your teacher will set up a call.'))}</p></div>`).join('')}` : ''}`);
  $$('[data-apply]').forEach((b) => b.onclick = async () => {
    try {
      const r = await doOrQueue('apply', state.acting?.id, S('/applications'), { target: b.dataset.apply });
      b.outerHTML = `<span class="pill good">✓ ${esc(t('opps.applied', 'Applied'))}</span>`;
      toast(r.queued ? t('offline.queued', 'Saved on your phone. It will sync when you are online.') : '🏅 ' + t('path.badge', 'Badge added to your Talent Passport'));
    } catch (e) { toast(e.message); }
  });
}

// ------------------------------------------------------------------ passport
async function viewPassport() {
  loading();
  let d;
  try { d = await get(S('/passport')); } catch (e) { return errorView(e); }
  const url = location.origin + d.public_url;
  render(passportHtml(d, true) + `
    <div class="card" style="margin-top:12px"><div class="row">
      <img class="qr" src="/api/v1/passport/${esc(d.slug)}/qr.svg" alt="QR code">
      <div class="grow stack"><p class="small">${esc(t('pp.share', 'Show this QR code or share the link with an employer or college.'))}</p>
        <button class="btn small" id="share">🔗 ${esc(t('pp.sharebtn', 'Share my passport'))}</button>
        <p class="small muted">🔒 ${esc(t('pp.privacy', 'Employers see your first name only. They contact you through your teacher.'))}</p></div></div></div>`);
  $('#share').onclick = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'Thiran Talent Passport', url }); } catch {} }
    else { try { await navigator.clipboard.writeText(url); toast(t('pp.copied', 'Link copied')); } catch { toast(url, 6000); } }
  };
}

function passportHtml(d, own) {
  const initials = (d.name || '?').split(' ').map((x) => x[0]).join('').slice(0, 2);
  const badgeIc = (b) => (b.code.startsWith('endorse') ? '👩‍🏫' : b.code.startsWith('step') ? '✅' : b.code.startsWith('applied') ? '📨' : b.code.startsWith('selected') ? '🏆' : b.code.startsWith('module') ? '📚' : b.code.startsWith('career') ? '⭐' : '🏅');
  return `
    <div class="card"><div class="passport-head"><div class="avatar">${esc(initials)}</div>
      <div class="grow"><h1 style="margin:0">${esc(d.name)}</h1><p class="muted small">📍 ${esc([d.district, d.state].filter(Boolean).join(', '))} ${d.teacher ? '· 👩‍🏫 ' + esc(d.teacher) : ''}</p>
      ${d.goal ? `<span class="pill good">⭐ ${esc(d.goal[getLang()] || d.goal.en)}</span>` : ''}</div></div>
      <div class="stats" style="margin-top:12px">
        <div class="stat"><b>${d.stats.endorsements}</b><span>${esc(t('pp.endorse', 'Teacher endorsements'))}</span></div>
        <div class="stat"><b>${d.stats.badges}</b><span>${esc(t('pp.badges', 'Badges'))}</span></div>
        <div class="stat"><b>${d.stats.steps_done}</b><span>${esc(t('pp.steps', 'Pathway steps done'))}</span></div>
      </div></div>
    ${d.endorsements.length ? `<h2>👩‍🏫 ${esc(t('pp.endorse', 'Teacher endorsements'))}</h2>${d.endorsements.map((e) => `
      <div class="card"><b>✔️ ${esc(e.skill)}</b><p class="small">“${esc(e.note)}”</p><p class="small muted">${esc(e.by)} · ${esc(e.role)} · ${esc(e.date)}</p></div>`).join('')}` : ''}
    ${(d.interests || []).length ? `<h2>💡 ${esc(t('pp.interests', 'Interests'))}</h2><div class="chips">${d.interests.map((i) => `<span class="pill">${esc(i.replace('_', ' '))}</span>`).join('')}</div>` : ''}
    <h2>🏅 ${esc(t('pp.badges', 'Badges'))}</h2>
    <div class="card badge-list">${d.badges.map((b) => `<div class="badge"><span class="b-ic">${badgeIc(b)}</span><div><b>${esc(b.title)}</b>
      <div class="small muted">${esc(b.detail || '')} ${b.verified_by && b.verified_by !== 'system' ? '· ' + esc(t('pp.verified', 'verified by') + ' ' + b.verified_by.split(':').slice(1).join(':')) : ''} · ${esc(b.date)}</div></div></div>`).join('') || `<p class="muted">${esc(t('pp.nobadges', 'Complete steps to earn badges.'))}</p>`}</div>`;
}

// ------------------------------------------------------------------ modules (student)
async function viewModules() {
  loading();
  let mods;
  try { mods = await get('/modules'); } catch (e) { return errorView(e); }
  const list = Array.isArray(mods) ? mods : Object.values(mods).filter((x) => x && x.id);
  render(`<h1>📚 ${esc(t('home.modules', 'Learn from teachers'))}</h1>
    <p class="muted">${esc(t('mod.sub', 'Short lessons made by teachers, in your language.'))}</p>
    ${list.map((m) => `<div class="card"><h3>${esc(m.title)}</h3><p class="small muted">👩‍🏫 ${esc(m.teacher)} · ${esc(m.lessons.length)} ${esc(t('mod.lessons', 'lessons'))}</p>
      <p class="small">${esc(m.description)}</p>
      <div class="row">${priceTag(m)}<span class="grow"></span><button class="btn small" data-enrol="${m.id}">${esc(t('mod.join', 'Join'))}</button></div></div>`).join('')}`);
  $$('[data-enrol]').forEach((b) => b.onclick = async () => {
    try {
      const r = await post(S(`/modules/${b.dataset.enrol}/enrol`), {});
      b.outerHTML = `<span class="pill good">✓ ${esc(t('mod.joined', 'Joined'))}</span>`;
      toast(r.paid_inr ? t('mod.paid', 'Paid {p} (demo payment, UPI in the real app)', { p: inr(r.paid_inr) }) : '🏅 ' + t('path.badge', 'Badge added to your Talent Passport'));
    } catch (e) { toast(e.status === 0 ? t('offline.needed', 'Please connect to the internet for this') : e.message); }
  });
}

function priceTag(m) {
  if (m.sponsor) return `<span class="pill good">${esc(t('mod.sponsored', 'Free, sponsored by {s}', { s: m.sponsor }))}</span>`;
  if (m.pricing === 'free') return `<span class="pill good">${esc(t('free', 'Free'))}</span>`;
  if (m.pricing === 'subscription') return `<span class="pill accent">${inr(m.price_inr)}/${esc(t('month', 'month'))}</span>`;
  return `<span class="pill accent">${inr(m.price_inr)}</span>`;
}

// ------------------------------------------------------------------ teacher
function tabs(base, items, active) {
  return `<nav class="tabs">${items.map(([k, label]) => `<a href="${base}/${k}" class="${k === active ? 'on' : ''}">${esc(label)}</a>`).join('')}</nav>`;
}
const tTabs = (a) => tabs('#/t', [['class', '👥 ' + t('t.class', 'My class')], ['modules', '📚 ' + t('t.modules', 'My modules')], ['requests', '📨 ' + t('t.requests', 'Employer requests')]], a);

async function viewTeacher() {
  loading();
  let roster, ins;
  try { [roster, ins] = await Promise.all([get('/teacher/roster'), get(`/teacher/insights?${L()}`)]); } catch (e) { return errorView(e); }
  roster = Array.isArray(roster) ? roster : Object.values(roster).filter((x) => x && x.id);
  const kindIc = { cluster: '🔎', unapplied: '🎁', incomplete: '📝', no_goal: '🧭' };
  render(`${tTabs('class')}
    <h1>👩‍🏫 ${esc(t('t.title', 'Hello, {name}', { name: state.user.name }))}</h1>
    <div class="stats">
      <div class="stat"><b>${ins.class_size}</b><span>${esc(t('t.students', 'Students'))}</span></div>
      <div class="stat"><b>${ins.totals.profiles_done}</b><span>${esc(t('t.profiles', 'Profiles done'))}</span></div>
      <div class="stat"><b>${ins.totals.goals_chosen}</b><span>${esc(t('t.goals', 'Career goals chosen'))}</span></div>
      <div class="stat"><b>${ins.totals.applications}</b><span>${esc(t('t.apps', 'Applications'))}</span></div>
    </div>
    <h2>✨ ${esc(t('t.insights', 'This week'))}</h2>
    ${ins.summary ? `<div class="card row" style="background:var(--brand-soft)"><p class="grow" style="margin:0">${esc(ins.summary)}</p>${sayBtn(ins.summary)}</div>` : ''}
    ${ins.cards.map((c) => `<div class="card"><b>${kindIc[c.kind] || '•'} ${esc(c.text)}</b><p class="small muted">${esc(c.students.slice(0, 8).join(', '))}</p>
      ${c.student_id ? `<a class="btn small secondary" href="#/t/student/${c.student_id}">${esc(t('t.open', 'Open'))}</a>` : ''}</div>`).join('')}
    <div class="row" style="margin-top:20px"><h2 class="grow" style="margin:0">👥 ${esc(t('t.class', 'My class'))}</h2><a class="btn small" href="#/t/add">＋ ${esc(t('t.add', 'Add student'))}</a></div>
    <p class="small muted">${esc(t('t.shared', 'Students without a phone use Thiran on your phone: open a student and tap "Use Thiran for them".'))}</p>
    ${roster.map((s) => `
      <a class="card row" href="#/t/student/${s.id}" style="text-decoration:none;color:inherit;display:flex">
        <div class="avatar" style="width:44px;height:44px;font-size:18px">${esc(s.name[0])}</div>
        <div class="grow"><b>${esc(s.name)}</b> ${s.has_phone ? '' : '<span class="pill">📵 ' + esc(t('t.nophone', 'no phone')) + '</span>'}
          <div class="small muted">${esc(eduLabel(s.education_level))} · ${s.chosen_career_name ? '⭐ ' + esc(s.chosen_career_name) : esc(t('t.nogoal', 'no goal yet'))}</div>
          <div class="progress" style="margin-top:6px"><i style="width:${s.completeness}%"></i></div></div>
        <div class="small" style="text-align:right">${s.unapplied_count ? `<span class="pill accent">🎁 ${s.unapplied_count}</span><br>` : ''}${s.endorsements ? `<span class="pill good">👍 ${s.endorsements}</span>` : ''}</div>
      </a>`).join('')}`);
}

async function viewTeacherStudent(id) {
  loading();
  let p, pp, opps;
  try {
    [p, pp, opps] = await Promise.all([get(`/students/${id}/profile`), get(`/students/${id}/passport`), get(`/students/${id}/opportunities?${L()}`)]);
  } catch (e) { return errorView(e); }
  const pr = p.profile;
  render(`${tTabs('class')}
    <h1>${esc(p.name)}</h1>
    <div class="card"><div class="facts">
      <span>🏫 ${esc(eduLabel(pr.education_level))}</span><span>📍 ${esc(pr.district || '—')}</span><span>📝 ${esc(t('home.profile', 'Profile {n}%', { n: pr.completeness }))}</span>
      ${pr.chosen_career ? `<span>⭐ ${esc(pp.goal?.en || pr.chosen_career)}</span>` : ''}</div>
      <p class="small">💡 ${esc((pr.interests || []).join(', ').replaceAll('_', ' ') || '—')}</p>
      <p class="small">🎁 ${esc(t('t.eligible', 'Eligible for {n} scholarships/schemes', { n: opps.eligible.length }))} · 📨 ${esc(t('t.applied', '{n} applied', { n: opps.applied.length }))}</p>
      <button class="btn block" id="act">📱 ${esc(t('t.act', 'Use Thiran for {name}', { name: p.name.split(' ')[0] }))}</button>
    </div>
    <h2>👍 ${esc(t('t.endorse', 'Endorse a skill'))}</h2>
    <form class="card" id="endorse">
      <label class="field"><span>${esc(t('t.skill', 'Skill'))}</span><input class="input" name="skill" required placeholder="${esc(t('t.skillph', 'e.g. Practical science, Wiring, Drawing'))}"></label>
      <label class="field"><span>${esc(t('t.note', 'What did you see?'))}</span><input class="input" name="note" placeholder="${esc(t('t.noteph', 'One line the employer will read'))}"></label>
      <button class="btn" type="submit">${esc(t('t.endorsebtn', 'Endorse'))}</button></form>
    <h2>📨 ${esc(t('t.recommend', 'Recommend for an opportunity'))}</h2>
    <form class="card" id="recommend">
      <select name="opportunity_id">${opps.listings.map((o) => `<option value="${o.id}">${esc(o.title)} · ${esc(o.org)} (${o.fit}%)</option>`).join('') || `<option value="">${esc(t('opps.nolist', 'No listings match yet.'))}</option>`}</select>
      <label class="field"><span>${esc(t('t.note', 'What did you see?'))}</span><input class="input" name="note"></label>
      <button class="btn" type="submit" ${opps.listings.length ? '' : 'disabled'}>${esc(t('t.recbtn', 'Recommend'))}</button></form>
    <h2>🪪 ${esc(t('home.passport', 'Talent Passport'))}</h2>${passportHtml(pp, false)}`);
  $('#act').onclick = () => {
    state.acting = { id: +id, name: p.name };
    try { sessionStorage.setItem('thiran.acting', JSON.stringify(state.acting)); } catch {}
    go('#/home');
  };
  $('#endorse').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      const r = await doOrQueue('endorse', null, '/teacher/endorse', { student_id: +id, skill: f.skill, note: f.note });
      toast(r.queued ? t('offline.queued', 'Saved on your phone. It will sync when you are online.') : '👍 ' + t('t.endorsed', 'Endorsement added to the Talent Passport'));
      if (!r.queued) viewTeacherStudent(id);
    } catch (err) { toast(err.message); }
  };
  $('#recommend').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await post('/teacher/recommend', { student_id: +id, opportunity_id: +f.opportunity_id, note: f.note }); toast('📨 ' + t('t.recommended', 'Recommended. The employer can now see this student.')); }
    catch (err) { toast(err.status === 0 ? t('offline.needed', 'Please connect to the internet for this') : err.message); }
  };
}

function viewTeacherAdd() {
  render(`${tTabs('class')}<h1>＋ ${esc(t('t.add', 'Add student'))}</h1>
    <form class="card" id="add">
      <label class="field"><span>${esc(t('login.name', 'Your name'))}</span><input class="input" name="name" required></label>
      <label class="field"><span>${esc(t('t.classlvl', 'Class'))}</span><select name="education_level">
        ${['class9', 'class10', 'class11', 'class12', 'iti', 'diploma', 'ug'].map((x) => `<option value="${x}">${esc(eduLabel(x))}</option>`).join('')}</select></label>
      <label class="field"><span>${esc(t('t.lang', 'Language'))}</span><select name="language">${LANGS.map((l) => `<option value="${l.code}">${l.name}</option>`).join('')}</select></label>
      <label class="field"><span>${esc(t('login.district', 'District'))}</span><input class="input" name="district" value="Madurai"></label>
      <button class="btn" type="submit">${esc(t('t.addbtn', 'Add to my class'))}</button></form>`);
  $('#add').onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await post('/teacher/students', Object.fromEntries(new FormData(e.target))); toast('✓'); go(`#/t/student/${r.id}`); }
    catch (err) { toast(err.message); }
  };
}

async function viewTeacherModules() {
  loading();
  let mods;
  try { mods = await get('/teacher/modules'); } catch (e) { return errorView(e); }
  mods = Array.isArray(mods) ? mods : Object.values(mods).filter((x) => x && x.id);
  const earn = mods.reduce((a, m) => a + m.earnings_inr, 0);
  render(`${tTabs('modules')}<h1>📚 ${esc(t('t.modules', 'My modules'))}</h1>
    <div class="stats"><div class="stat"><b>${mods.length}</b><span>${esc(t('t.mods', 'Modules'))}</span></div>
      <div class="stat"><b>${mods.reduce((a, m) => a + m.enrolments, 0)}</b><span>${esc(t('t.enrol', 'Students joined'))}</span></div>
      <div class="stat"><b>${inr(earn)}</b><span>${esc(t('t.earn', 'You earned (after 10% fee)'))}</span></div></div>
    ${mods.map((m) => `<div class="card"><div class="row"><h3 class="grow">${esc(m.title)}</h3>${priceTag(m)}</div>
      <p class="small muted">${m.lessons.length} ${esc(t('mod.lessons', 'lessons'))} · ${m.enrolments} ${esc(t('t.enrol', 'Students joined'))} · ${inr(m.earnings_inr)}</p></div>`).join('')}
    <h2>＋ ${esc(t('t.newmod', 'Create a module'))}</h2>
    <form class="card" id="mod">
      <label class="field"><span>${esc(t('t.mtitle', 'Title'))}</span><input class="input" name="title" required placeholder="Basic mobile repair"></label>
      <label class="field"><span>${esc(t('t.mdesc', 'What will students learn?'))}</span><textarea name="description"></textarea></label>
      <label class="field"><span>${esc(t('t.mlessons', 'Lessons (one per line)'))}</span><textarea name="lessons"></textarea></label>
      <label class="field"><span>${esc(t('t.mprice', 'Price'))}</span><select name="pricing">
        <option value="free">${esc(t('free', 'Free'))}</option><option value="per_module">${esc(t('t.per', 'Pay per module'))}</option><option value="subscription">${esc(t('t.sub', 'Monthly subscription'))}</option></select></label>
      <label class="field"><span>₹</span><input class="input" name="price_inr" type="number" min="0" max="5000" value="0"></label>
      <button class="btn" type="submit">${esc(t('t.publish', 'Publish'))}</button></form>`);
  $('#mod').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      await post('/teacher/modules', { title: f.title, description: f.description, pricing: f.pricing, price_inr: +f.price_inr || 0, language: getLang(),
        lessons: f.lessons.split('\n').map((x) => x.trim()).filter(Boolean).map((title) => ({ title })) });
      toast('✓'); viewTeacherModules();
    } catch (err) { toast(err.message); }
  };
}

async function viewTeacherRequests() {
  loading();
  let reqs;
  try { reqs = await get('/teacher/contact-requests'); } catch (e) { return errorView(e); }
  reqs = Array.isArray(reqs) ? reqs : Object.values(reqs).filter((x) => x && x.id);
  render(`${tTabs('requests')}<h1>📨 ${esc(t('t.requests', 'Employer requests'))}</h1>
    <p class="muted small">${esc(t('t.reqsub', 'Employers cannot contact students directly. You decide, together with the student and family.'))}</p>
    ${reqs.map((r) => `<div class="card"><b>${esc(r.org)}</b> → ${esc(r.student)}<p class="small">“${esc(r.message)}”</p>
      ${r.status === 'pending' ? `<div class="row"><button class="btn small" data-r="${r.id}" data-s="accepted">✓ ${esc(t('t.accept', 'Accept'))}</button><button class="btn small secondary" data-r="${r.id}" data-s="declined">${esc(t('t.decline', 'Decline'))}</button></div>`
        : `<span class="pill ${r.status === 'accepted' ? 'good' : ''}">${esc(r.status)}</span>`}</div>`).join('') || `<p class="muted">${esc(t('t.noreq', 'No requests yet.'))}</p>`}`);
  $$('[data-r]').forEach((b) => b.onclick = async () => { await post(`/teacher/contact-requests/${b.dataset.r}`, { status: b.dataset.s }); viewTeacherRequests(); });
}

// ------------------------------------------------------------------ employer / CSR
const eTabs = (a) => tabs('#/e', [['listings', '📋 ' + t('e.listings', 'My listings')], ['talent', '🔎 ' + t('e.talent', 'Find talent')], ['post', '＋ ' + t('e.post', 'Post')], ['impact', '📊 ' + t('e.impact', 'Impact')]], a);

async function careersList() {
  const c = await get('/kb/careers').catch(() => []);
  return (Array.isArray(c) ? c : Object.values(c).filter((x) => x && x.id)).map((x) => ({ id: x.id, name: x.name.en })).sort((a, b) => a.name.localeCompare(b.name));
}

async function viewEmployer() {
  loading();
  let list;
  try { list = await get('/employer/opportunities'); } catch (e) { return errorView(e); }
  list = Array.isArray(list) ? list : Object.values(list).filter((x) => x && x.id);
  const org = state.user.org || {};
  render(`${eTabs('listings')}<h1>🏢 ${esc(org.name || state.user.name)}</h1>
    ${list.map((o) => `<div class="card"><div class="row"><h3 class="grow">${esc(o.title)}</h3><span class="pill">${esc(o.kind)}</span></div>
      <p class="small muted">📍 ${esc(o.district || '')} ${o.stipend_inr_month ? '· 💰 ' + inr(o.stipend_inr_month) : ''}</p>
      <b class="small">${esc(t('e.applicants', 'Applicants'))} (${o.applications.length})</b>
      ${o.applications.map((a) => `<div class="row small" style="margin:6px 0"><span class="grow">${esc(a.name)} ${a.recommended_by ? '· 👩‍🏫 ' + esc(t('e.recby', 'recommended by {n}', { n: a.recommended_by })) : ''} · 👍 ${a.endorsements}</span>
        <select data-app="${a.id}" style="width:auto;min-height:38px">${['applied', 'shortlisted', 'selected'].map((s) => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`).join('') || `<p class="small muted">—</p>`}
      ${o.suggested.length ? `<b class="small">✨ ${esc(t('e.suggested', 'Thiran suggests'))}</b>${o.suggested.map((s) => `<div class="small">• ${esc(s.name)} (${esc(s.district || '')}) · ${s.fit}% · ${esc(s.why.join(', '))}</div>`).join('')}` : ''}
    </div>`).join('') || `<p class="muted">${esc(t('e.nolist', 'No listings yet.'))} <a href="#/e/post">${esc(t('e.post', 'Post'))}</a></p>`}`);
  $$('[data-app]').forEach((s) => s.onchange = async () => { await post(`/employer/applications/${s.dataset.app}`, { status: s.value }); toast('✓'); });
}

async function viewTalent() {
  const careers = await careersList();
  render(`${eTabs('talent')}<h1>🔎 ${esc(t('e.talent', 'Find talent'))}</h1>
    <form class="card" id="tf"><div class="row">
      <input class="input grow" name="district" placeholder="${esc(t('login.district', 'District'))}" value="Madurai" style="min-width:140px">
      <input class="input grow" name="skill" placeholder="${esc(t('t.skill', 'Skill'))}" style="min-width:140px"></div>
      <select name="career" style="margin-top:8px"><option value="">${esc(t('e.anycareer', 'Any career goal'))}</option>${careers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <label class="row small" style="margin:8px 0"><input type="checkbox" name="endorsed_only" checked> ${esc(t('e.endorsedonly', 'Only teacher-endorsed students'))}</label>
      <button class="btn" type="submit">${esc(t('e.search', 'Search'))}</button></form>
    <div id="results"></div>`);
  const run = async () => {
    const f = Object.fromEntries(new FormData($('#tf')));
    const q = new URLSearchParams({ district: f.district || '', skill: f.skill || '', career: f.career || '', endorsed_only: f.endorsed_only ? 'true' : 'false' });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    let d;
    try { d = await get('/employer/talent?' + q); } catch (e) { return toast(e.message); }
    $('#results').innerHTML = `<p class="small muted">${esc(t('e.plan', 'Plan'))}: <b>${esc(d.plan)}</b> · ${esc(t('e.unlocks', '{n} passports unlocked', { n: d.unlocks_used }))}
        ${d.plan === 'free' ? ` · ${esc(t('e.freeinfo', '3 free, then {p} each, or Talent Pro {m}/month unlimited', { p: inr(d.unlock_price_inr), m: inr(d.plans.talent_pro.price_inr_month) }))} <button class="btn small secondary" id="upgrade">${esc(t('e.upgrade', 'Upgrade'))}</button>` : ''}</p>
      ${d.results.map((r) => `<div class="card"><div class="row"><h3 class="grow">${esc(r.name)}</h3><b style="color:var(--brand)">${r.score}</b></div>
        <p class="small muted">📍 ${esc(r.district || '')} · 🏫 ${esc(eduLabel(r.education_level))} ${r.goal ? '· ⭐ ' + esc(r.goal) : ''}</p>
        <div class="chips">${r.endorsed_skills.map((s) => `<span class="pill good">👩‍🏫 ${esc(s)}</span>`).join('')}</div>
        <p class="small">🏅 ${r.badges} · ✅ ${r.steps_done} ${esc(t('pp.steps', 'Pathway steps done'))}</p>
        <div class="row"><button class="btn small" data-unlock="${r.student_id}">${r.unlocked ? '🔓 ' + esc(t('e.view', 'View passport')) : '🔒 ' + esc(t('e.unlock', 'Unlock passport'))}</button>
          <button class="btn small secondary" data-contact="${r.student_id}">📨 ${esc(t('e.contact', 'Contact via teacher'))}</button></div>
        <div data-pp="${r.student_id}"></div></div>`).join('') || `<p class="muted">${esc(t('e.noresults', 'No students match. Try fewer filters.'))}</p>`}`;
    const up = $('#upgrade');
    if (up) up.onclick = async () => { await post('/employer/upgrade', {}); toast(t('e.upgraded', 'Talent Pro active (demo payment)')); run(); };
    $$('[data-unlock]').forEach((b) => b.onclick = async () => {
      try {
        const r = await post(`/employer/unlock/${b.dataset.unlock}`, {});
        if (r.charged_inr) toast(t('e.charged', 'Charged {p} (demo payment)', { p: inr(r.charged_inr) }));
        $(`[data-pp="${b.dataset.unlock}"]`).innerHTML = '<div style="margin-top:12px">' + passportHtml(r.passport, false) + '</div>';
      } catch (e) { toast(e.message); }
    });
    $$('[data-contact]').forEach((b) => b.onclick = async () => {
      const msg = prompt(t('e.msg', 'Message for the teacher'), t('e.msgdefault', 'We would like to invite this student for an apprenticeship interview.'));
      if (!msg) return;
      try { await post('/employer/contact', { student_id: +b.dataset.contact, message: msg }); toast('📨 ' + t('e.sent', 'Sent to the student’s teacher')); }
      catch (e) { toast(e.message); }
    });
  };
  $('#tf').onsubmit = (e) => { e.preventDefault(); run(); };
  run();
}

async function viewPost() {
  const careers = await careersList();
  render(`${eTabs('post')}<h1>＋ ${esc(t('e.posttitle', 'Post an opportunity'))}</h1>
    <form class="card" id="pf">
      <label class="field"><span>${esc(t('e.kind', 'Type'))}</span><select name="kind"><option value="apprenticeship">Apprenticeship</option><option value="internship">Internship</option><option value="job">Job</option><option value="scholarship">Scholarship (CSR)</option></select></label>
      <label class="field"><span>${esc(t('t.mtitle', 'Title'))}</span><input class="input" name="title" required placeholder="Lab assistant apprentice"></label>
      <label class="field"><span>${esc(t('e.career', 'Career'))}</span><select name="career">${careers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
      <div class="row"><label class="field grow"><span>${esc(t('login.district', 'District'))}</span><input class="input" name="district" value="Madurai"></label>
        <label class="field grow"><span>💰 ₹/${esc(t('month', 'month'))}</span><input class="input" name="stipend" type="number" value="9000"></label></div>
      <div class="row"><label class="field grow"><span>${esc(t('e.duration', 'Duration'))}</span><input class="input" name="duration" value="12 months"></label>
        <label class="field grow"><span>${esc(t('e.minedu', 'Minimum education'))}</span><select name="min_education">${['class10', 'class12', 'iti', 'diploma', 'ug'].map((x) => `<option value="${x}">${esc(eduLabel(x))}</option>`).join('')}</select></label></div>
      <label class="field"><span>${esc(t('e.desc', 'Description'))}</span><textarea name="description"></textarea></label>
      <label class="row small"><input type="checkbox" name="naps" checked> NAPS</label>
      <label class="row small"><input type="checkbox" name="sponsored"> ${esc(t('e.sponsored', 'Featured / sponsored listing'))}</label>
      <button class="btn" type="submit" style="margin-top:10px">${esc(t('t.publish', 'Publish'))}</button></form>`);
  $('#pf').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      const r = await post('/opportunities', { kind: f.kind, title: f.title, careers: [f.career], district: f.district, stipend_inr_month: +f.stipend || null,
        duration: f.duration, min_education: f.min_education, description: f.description, naps: !!f.naps, sponsored: !!f.sponsored });
      toast(t('e.posted', 'Posted. {n} students match.', { n: r.matches }));
      go('#/e/listings');
    } catch (err) { toast(err.message); }
  };
}

async function viewImpact() {
  loading();
  let d;
  try { d = await get('/employer/impact'); } catch (e) { return errorView(e); }
  const bars = (obj) => {
    const max = Math.max(1, ...Object.values(obj));
    return Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="row small" style="margin:6px 0"><span style="width:120px">${esc(k.replace('_', ' '))}</span>
      <div class="progress grow"><i style="width:${(100 * v) / max}%;background:var(--brand)"></i></div><b>${v}</b></div>`).join('');
  };
  render(`${eTabs('impact')}<h1>📊 ${esc(t('e.impacttitle', 'Impact dashboard'))}</h1>
    <p class="muted small">${esc(t('e.impactsub', 'For CSR reporting (Schedule VII: education and livelihood). Updated live.'))}</p>
    <div class="stats">
      <div class="stat"><b>${d.students_reached}</b><span>${esc(t('e.reached', 'Students reached'))}</span></div>
      <div class="stat"><b>${d.teachers}</b><span>${esc(t('e.teachers', 'Teachers'))}</span></div>
      <div class="stat"><b>${d.profiles_completed}</b><span>${esc(t('t.profiles', 'Profiles done'))}</span></div>
      <div class="stat"><b>${d.goals_chosen}</b><span>${esc(t('t.goals', 'Career goals chosen'))}</span></div>
      <div class="stat"><b>${d.scheme_applications}</b><span>${esc(t('e.schemeapps', 'Scholarship/scheme applications'))}</span></div>
      <div class="stat"><b>${d.opportunity_applications}</b><span>${esc(t('e.oppapps', 'Apprenticeship/job applications'))}</span></div>
      <div class="stat"><b>${d.selected}</b><span>${esc(t('e.selected', 'Selected / placed'))}</span></div>
      <div class="stat"><b>${d.endorsements}</b><span>${esc(t('pp.endorse', 'Teacher endorsements'))}</span></div>
    </div>
    <h2>${esc(t('e.bydistrict', 'Students by district'))}</h2><div class="card">${bars(d.by_district)}</div>
    <h2>${esc(t('e.bygoal', 'Career goals by field'))}</h2><div class="card">${bars(d.goal_categories)}</div>`);
}

function viewMentor() {
  render(`<h1>🤝 ${esc(t('m.title', 'Thank you for mentoring, {name}', { name: state.user.name }))}</h1>
    <div class="card"><p>${esc(t('m.body', 'Students who choose careers you know are matched to you. Their teacher will contact you to set up a call.'))}</p></div>`);
}

// ------------------------------------------------------------------ router
const routes = [
  [/^#\/login$/, viewLogin, null],
  [/^#\/home$/, viewHome, 'student'],
  [/^#\/discover$/, viewDiscover, 'student'],
  [/^#\/careers$/, viewCareers, 'student'],
  [/^#\/pathway(?:\/([\w-]+))?$/, viewPathway, 'student'],
  [/^#\/opportunities$/, viewOpportunities, 'student'],
  [/^#\/passport$/, viewPassport, 'student'],
  [/^#\/modules$/, viewModules, 'student'],
  [/^#\/t(?:\/class)?$/, viewTeacher, 'teacher'],
  [/^#\/t\/student\/(\d+)$/, viewTeacherStudent, 'teacher'],
  [/^#\/t\/add$/, viewTeacherAdd, 'teacher'],
  [/^#\/t\/modules$/, viewTeacherModules, 'teacher'],
  [/^#\/t\/requests$/, viewTeacherRequests, 'teacher'],
  [/^#\/e(?:\/listings)?$/, viewEmployer, 'employer'],
  [/^#\/e\/talent$/, viewTalent, 'employer'],
  [/^#\/e\/post$/, viewPost, 'employer'],
  [/^#\/e\/impact$/, viewImpact, 'employer'],
  [/^#\/m$/, viewMentor, 'mentor'],
];

function route() {
  const h = location.hash || '#/';
  if (!state.user) { if (h !== '#/login') return go('#/login'); return viewLogin(); }
  if (h === '#/' || h === '#/login') return go(homeFor(state.user));
  for (const [re, fn, role] of routes) {
    const m = h.match(re);
    if (!m) continue;
    // A teacher acting for a student may open student screens.
    const ok = !role || role === state.user.role || (role === 'student' && state.user.role === 'teacher' && state.acting);
    if (!ok) return go(homeFor(state.user));
    return fn(...m.slice(1));
  }
  go(homeFor(state.user));
}

async function boot() {
  await setLang(initialLang());
  if (token()) {
    try { state.user = await get('/auth/me'); } catch { state.user = await kv.get('me').catch(() => null); }
    if (state.user && state.user._offline) delete state.user._offline;
  }
  topbar();
  window.addEventListener('hashchange', route);
  route();
  sync();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

boot();
