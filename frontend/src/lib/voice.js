// Voice in and out with the browser's free speech APIs (Android Chrome supports
// ta-IN, hi-IN and en-IN). The server-side adapter can swap in BHASHINI or
// another speech service where the phone has no local voice.
const SPEECH = { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN' };
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;

export const canListen = !!Rec;
export const canSpeak = 'speechSynthesis' in window;

let voices = [];
function loadVoices() { voices = canSpeak ? speechSynthesis.getVoices() : []; }
if (canSpeak) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

export function hasVoice(lang) {
  const code = SPEECH[lang] || 'en-IN';
  return voices.some((v) => v.lang && v.lang.replace('_', '-').toLowerCase().startsWith(code.slice(0, 2)));
}

export function speak(text, lang, onend) {
  if (!canSpeak || !text) { onend && onend(); return; }
  speechSynthesis.cancel();
  const clean = text.replace(/[*_#`>]/g, '').replace(/https?:\/\/\S+/g, '');
  const u = new SpeechSynthesisUtterance(clean);
  const code = SPEECH[lang] || 'en-IN';
  u.lang = code;
  const v = voices.find((x) => x.lang && x.lang.replace('_', '-').toLowerCase() === code.toLowerCase())
    || voices.find((x) => x.lang && x.lang.toLowerCase().startsWith(code.slice(0, 2)));
  if (v) u.voice = v;
  u.rate = 0.95;
  u.onend = () => onend && onend();
  u.onerror = () => onend && onend();
  speechSynthesis.speak(u);
}

export function stopSpeaking() { if (canSpeak) speechSynthesis.cancel(); }

// Returns a stop() function. onText(final, interim) is called as words arrive.
export function listen(lang, { onText, onEnd, onError }) {
  if (!Rec) { onError && onError('unsupported'); return () => {}; }
  stopSpeaking();
  const r = new Rec();
  r.lang = SPEECH[lang] || 'en-IN';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let finalText = '';
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    onText && onText(finalText, interim);
  };
  r.onerror = (e) => onError && onError(e.error);
  r.onend = () => onEnd && onEnd(finalText.trim());
  try { r.start(); } catch (e) { onError && onError(String(e)); }
  return () => { try { r.stop(); } catch {} };
}
