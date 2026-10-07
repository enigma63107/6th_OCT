// Live Gujarati: a conversation coach for learning Gujarati.
//
//  - Them: tap Listen. Whatever they say is translated and read aloud
//    (Gujarati if they spoke Hindi/English, the English meaning if they
//    spoke Gujarati).
//  - You: hold the button and reply in Hindi or English. The app shows and
//    says the Gujarati for it.
//  - Practice: hold the button again and say it in Gujarati. The app scores
//    how close you got.
(function () {
  const $ = (id) => document.getElementById(id);
  const els = {
    sourceLang: $('sourceLang'), speakToggle: $('speakToggle'),
    setupBtn: $('setupBtn'), setup: $('setup'), keyForm: $('keyForm'), keyInput: $('keyInput'),
    keyState: $('keyState'),
    scroller: $('scroller'), chat: $('chat'), saved: $('saved'), empty: $('empty'),
    coach: $('coach'), coachGu: $('coachGu'), coachTranslit: $('coachTranslit'),
    coachSay: $('coachSay'), coachSkip: $('coachSkip'),
    listenBtn: $('listenBtn'), listenLabel: $('listenLabel'), meBtn: $('meBtn'), meLabel: $('meLabel'),
    typeForm: $('typeForm'), typeInput: $('typeInput'), status: $('status'), clearBtn: $('clearBtn'),
  };

  const HISTORY_LIMIT = 300;
  const PASS_SCORE = 75;

  // ---- storage (per device; failures are harmless) ----
  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  }

  // Saved phrases from the first version used different field names.
  function fromOldSaved(s) {
    if (s.gu) return s;
    return { id: s.id, gu: s.translated, translit: s.translit, heard: s.original || '', meaning: s.meaning || '' };
  }

  const state = {
    chat: load('lg.chat', []),
    saved: load('lg.saved', []).map(fromOldSaved),
    target: load('lg.target', null), // the Gujarati sentence you're practising
    tab: 'chat',
    listening: false, // listening for the other person
    holding: false,   // you're holding the button and talking
  };
  const prefs = load('lg.prefs', {});
  if ([...els.sourceLang.options].some((o) => o.value === prefs.sourceLang)) {
    els.sourceLang.value = prefs.sourceLang;
  }
  els.speakToggle.checked = prefs.speak ?? true;
  function savePrefs() {
    save('lg.prefs', { sourceLang: els.sourceLang.value, speak: els.speakToggle.checked });
  }

  function groqKey() { return load('lg.groqKey', '') || ''; }

  function setStatus(msg, isError) {
    els.status.textContent = msg || '';
    els.status.classList.toggle('error', !!isError);
  }

  // ---- translation (Google's free endpoint, MyMemory as backup) ----
  const cache = new Map();

  async function googleFree(text, sl, tl) {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t'
      + `&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google ${res.status}`);
    const data = await res.json();
    // data[2] is the language Google detected.
    return { text: data[0].map((part) => part[0]).join(''), detected: data[2] || sl };
  }

  async function myMemory(text, sl, tl) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}`
      + `&langpair=${encodeURIComponent(sl)}|${encodeURIComponent(tl)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MyMemory ${res.status}`);
    const data = await res.json();
    if (data.responseStatus !== 200) throw new Error(data.responseDetails || 'MyMemory error');
    return data.responseData.translatedText;
  }

  async function translate(text, tl, sl = 'auto') {
    const key = `${sl}|${tl}|${text}`;
    if (cache.has(key)) return cache.get(key);
    let result;
    try {
      result = await googleFree(text, sl, tl);
    } catch (err) {
      // MyMemory can't detect languages, so it only helps when the source is known.
      if (sl === 'auto') throw err;
      result = { text: await myMemory(text, sl, tl), detected: sl };
    }
    cache.set(key, result);
    return result;
  }

  // The other person's language as chosen in the menu: 'auto' or e.g. 'hi'.
  function theirLanguage() {
    const v = els.sourceLang.value;
    return v === 'auto' ? 'auto' : v.split('-')[0];
  }

  const romanize = (gu) => window.transliterateGujarati(gu);

  // ---- reading aloud ----
  const speaker = window.createSpeaker();

  function say(text, lang) {
    if (!els.speakToggle.checked) return;
    speaker.say(text, lang).catch((err) => setStatus(err.message, true));
  }

  function play(text, lang) {
    speaker.unlock();
    speaker.say(text, lang).catch((err) => setStatus(err.message, true));
  }

  // ---- what happens with each phrase ----
  // Phrases are handled one at a time so they appear in the order spoken.
  let pipeline = Promise.resolve();
  function handle(text, who) {
    text = text.trim();
    if (!text) return;
    pipeline = pipeline
      .then(() => handleNow(text, who))
      .catch(() => setStatus('Translation failed. Check your internet connection.', true));
  }

  async function handleNow(text, who) {
    let entry;
    if (who === 'them') {
      const result = await translate(text, 'gu', theirLanguage());
      if (result.detected === 'gu') {
        const meaning = (await translate(text, 'en', 'gu')).text;
        entry = { who, heard: text, gu: text, translit: romanize(text), meaning };
        say(meaning, 'en');
      } else {
        entry = { who, heard: text, gu: result.text, translit: romanize(result.text), meaning: '' };
        say(result.text, 'gu');
      }
      setTarget(null); // the conversation has moved on
    } else if (who === 'practice' && state.target) {
      const attempt = window.toGujaratiScript(text);
      const { score, words } = window.scoreAttempt(attempt, state.target.gu);
      entry = {
        who, heard: attempt, gu: attempt, translit: romanize(attempt),
        target: state.target.gu, targetTranslit: state.target.translit, score, words,
      };
      if (score >= PASS_SCORE) setTarget(null);
      else say(state.target.gu, 'gu'); // hear it again before retrying
    } else {
      // Your reply in Hindi or English (or Gujarati, if you already know how).
      const result = await translate(text, 'gu');
      if (result.detected === 'gu') {
        const meaning = (await translate(text, 'en', 'gu')).text;
        entry = { who: 'me', heard: text, gu: text, translit: romanize(text), meaning };
      } else {
        entry = { who: 'me', heard: text, gu: result.text, translit: romanize(result.text), meaning: '' };
        setTarget({ gu: result.text, translit: entry.translit });
        say(result.text, 'gu');
      }
    }
    entry.id = Date.now() + Math.random().toString(36).slice(2, 6);
    state.chat.push(entry);
    if (state.chat.length > HISTORY_LIMIT) state.chat.splice(0, state.chat.length - HISTORY_LIMIT);
    save('lg.chat', state.chat);
    if (!state.holding) setStatus(state.listening ? 'Listening to them…' : '');
    render();
  }

  function setTarget(target) {
    state.target = target;
    save('lg.target', target);
    renderCoach();
  }

  // ---- the mic ----
  const listener = window.createGroqListener({
    getKey: groqKey,
    getLanguage: (label) => {
      if (label === 'practice') return 'gu';
      if (label === 'them' && theirLanguage() !== 'auto') return theirLanguage();
      return ''; // let Whisper work it out
    },
    onPhrase: (text, label) => handle(text, label),
    isMuted: () => speaker.isSpeaking(),
    onLevel: (voice) => {
      els.listenBtn.classList.toggle('hearing', voice && state.listening && !state.holding);
      els.meBtn.classList.toggle('hearing', voice && state.holding);
    },
    onState: (s) => {
      if (state.holding) return;
      if (s === 'transcribing') setStatus('Translating…');
      else if (state.listening) setStatus('Listening to them…');
    },
    onError: (err) => {
      if (err.status === 401) {
        setStatus('Groq didn\'t accept your key. Check it under Setup.', true);
        stopAll();
      } else if (err.status === 429) {
        setStatus('Free Groq limit reached for now. Wait a minute and it will carry on.', true);
      } else {
        setStatus('Couldn\'t reach Groq. Check your internet connection.', true);
      }
    },
  });

  function needKey() {
    if (groqKey()) return false;
    setStatus('Add your free Groq key under Setup first.', true);
    showSetup(true);
    return true;
  }

  async function ensureMic() {
    if (listener.running) return true;
    try {
      await listener.start();
      keepAwake(true);
      return true;
    } catch {
      setStatus('The microphone is blocked. Allow it in Settings → Safari → Microphone, then try again.', true);
      return false;
    }
  }

  function releaseMicIfIdle() {
    if (state.listening || state.holding) return;
    listener.stop();
    keepAwake(false);
  }

  function stopAll() {
    state.listening = false;
    state.holding = false;
    listener.setAutoListen(false);
    listener.holdEnd();
    releaseMicIfIdle();
    renderControls();
  }

  async function toggleListening() {
    if (state.listening) {
      state.listening = false;
      listener.setAutoListen(false);
      releaseMicIfIdle();
      setStatus('');
      renderControls();
      return;
    }
    if (needKey()) return;
    speaker.unlock();
    state.listening = true;
    listener.setAutoListen(true);
    renderControls();
    if (!(await ensureMic())) { stopAll(); return; }
    setStatus('Listening to them…');
  }

  // Holding the button records you, whether or not Listen is on.
  async function holdStart(e) {
    e.preventDefault();
    if (state.holding || needKey()) return;
    state.holding = true;
    speaker.stop();
    speaker.unlock();
    listener.holdStart(state.target ? 'practice' : 'me');
    renderControls();
    setStatus(state.target ? 'Say it in Gujarati… let go when you finish.' : 'Speak your reply… let go when you finish.');
    if (!(await ensureMic())) stopAll();
  }

  function holdEnd() {
    if (!state.holding) return;
    state.holding = false;
    listener.holdEnd();
    releaseMicIfIdle();
    setStatus('Translating…');
    renderControls();
  }

  // Keep the screen on while the mic is in use; iOS stops the mic when it locks.
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && 'wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch { /* not supported or refused */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && listener.running) keepAwake(true);
  });

  // ---- drawing ----
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function isSaved(gu) {
    return state.saved.some((s) => s.gu === gu);
  }

  function toggleSaved(entry) {
    if (isSaved(entry.gu)) {
      state.saved = state.saved.filter((s) => s.gu !== entry.gu);
    } else {
      state.saved.unshift({
        id: entry.id, gu: entry.gu, translit: entry.translit,
        heard: entry.heard !== entry.gu ? entry.heard : '', meaning: entry.meaning || '',
      });
    }
    save('lg.saved', state.saved);
    render();
  }

  function actions(entry) {
    const box = el('div', 'actions');
    const sayBtn = el('button', null, '🔊');
    sayBtn.setAttribute('aria-label', 'Play the Gujarati');
    sayBtn.onclick = () => play(entry.gu, 'gu');
    const saved = isSaved(entry.gu);
    const starBtn = el('button', saved ? 'on' : null, saved ? '★' : '☆');
    starBtn.setAttribute('aria-label', saved ? 'Remove from saved phrases' : 'Save phrase');
    starBtn.onclick = () => toggleSaved(entry);
    box.append(sayBtn, starBtn);
    return box;
  }

  function messageEl(entry) {
    const li = el('li', `msg ${entry.who}`);
    if (entry.who === 'practice') {
      const good = entry.score >= PASS_SCORE;
      li.append(
        el('p', 'who', 'You tried'),
        el('p', 'translated', entry.gu),
        el('p', 'translit', entry.translit),
        el('p', `score ${good ? 'good' : 'retry'}`,
          good ? `${entry.score}% match. Well said!` : `${entry.score}% match. Listen and try again.`),
      );
      const target = el('p', 'target');
      for (const w of entry.words) target.append(el('span', w.ok ? 'ok' : 'missed', w.word), ' ');
      li.append(target, el('p', 'translit', entry.targetTranslit));
      return li;
    }
    li.append(el('p', 'who', entry.who === 'them' ? 'They said' : 'You said'));
    if (entry.heard !== entry.gu) li.append(el('p', 'original', entry.heard));
    li.append(el('p', 'translated', entry.gu), el('p', 'translit', entry.translit));
    if (entry.meaning) li.append(el('p', 'meaning', entry.meaning));
    li.append(actions(entry));
    return li;
  }

  function renderCoach() {
    const t = state.target;
    els.coach.hidden = !t;
    if (t) {
      els.coachGu.textContent = t.gu;
      els.coachTranslit.textContent = t.translit;
    }
    renderControls();
  }

  function renderControls() {
    els.listenBtn.classList.toggle('on', state.listening);
    els.listenLabel.textContent = state.listening ? 'Stop listening' : 'Listen to them';
    els.meBtn.classList.toggle('on', state.holding);
    els.meBtn.classList.toggle('practice', !!state.target);
    els.meLabel.textContent = state.target ? 'Hold: say it in Gujarati' : 'Hold: your reply';
  }

  function render() {
    els.chat.replaceChildren(...state.chat.map(messageEl));
    els.saved.replaceChildren(...state.saved.map((s) => {
      const li = el('li', 'msg saved');
      if (s.heard) li.append(el('p', 'original', s.heard));
      li.append(el('p', 'translated', s.gu), el('p', 'translit', s.translit));
      if (s.meaning) li.append(el('p', 'meaning', s.meaning));
      li.append(actions(s));
      return li;
    }));
    if (!state.saved.length) els.saved.append(el('li', 'empty-note', 'Tap ☆ on a phrase to save it for practice.'));
    els.chat.hidden = state.tab !== 'chat';
    els.saved.hidden = state.tab !== 'saved';
    els.empty.hidden = state.tab !== 'chat' || state.chat.length > 0;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === state.tab));
    if (state.tab === 'chat') els.scroller.scrollTop = els.scroller.scrollHeight;
    renderCoach();
  }

  // ---- setup ----
  function showSetup(open) {
    els.setup.hidden = !open;
    const key = groqKey();
    els.keyState.textContent = key
      ? `Key saved (ends in …${key.slice(-4)}).`
      : 'No key yet. The app needs one to listen.';
  }

  // ---- wiring ----
  els.setupBtn.onclick = () => showSetup(els.setup.hidden);
  els.keyForm.onsubmit = (e) => {
    e.preventDefault();
    const key = els.keyInput.value.trim();
    els.keyInput.value = '';
    save('lg.groqKey', key);
    setStatus(key ? 'Key saved. Tap "Listen to them" to start.' : 'Key removed.');
    showSetup(!key);
  };

  els.listenBtn.onclick = toggleListening;
  els.meBtn.addEventListener('pointerdown', holdStart);
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) els.meBtn.addEventListener(type, holdEnd);
  els.meBtn.addEventListener('contextmenu', (e) => e.preventDefault());

  els.coachSay.onclick = () => play(state.target.gu, 'gu');
  els.coachSkip.onclick = () => setTarget(null);

  els.sourceLang.onchange = savePrefs;
  els.speakToggle.onchange = () => {
    savePrefs();
    if (!els.speakToggle.checked) speaker.stop();
  };

  els.typeForm.onsubmit = (e) => {
    e.preventDefault();
    speaker.unlock();
    const text = els.typeInput.value;
    els.typeInput.value = '';
    // Gujarati typed while practising counts as a practice attempt.
    handle(text, state.target && /[઀-૿]/.test(text) ? 'practice' : 'me');
  };

  els.clearBtn.onclick = () => {
    if (!confirm('Clear the conversation? Saved phrases are kept.')) return;
    state.chat = [];
    save('lg.chat', state.chat);
    setTarget(null);
    render();
  };

  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => { state.tab = t.dataset.tab; render(); };
  });

  if (!groqKey()) showSetup(true);
  render();
})();
