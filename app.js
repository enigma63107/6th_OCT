// Live Gujarati: listens to speech, shows a running translation while the
// person talks, and keeps each finished sentence in a conversation log.
(function () {
  const $ = (id) => document.getElementById(id);
  const els = {
    sourceLang: $('sourceLang'), targetLang: $('targetLang'),
    live: $('live'), hint: $('hint'),
    liveOriginal: $('liveOriginal'), liveTranslated: $('liveTranslated'),
    liveTranslit: $('liveTranslit'), liveMeaning: $('liveMeaning'),
    history: $('history'), saved: $('saved'),
    micBtn: $('micBtn'), clearBtn: $('clearBtn'), speakToggle: $('speakToggle'),
    typeForm: $('typeForm'), typeInput: $('typeInput'), status: $('status'),
  };

  // iOS Safari often never marks a result final while the mic stays open,
  // so a pause this long ends the sentence ourselves.
  const SILENCE_MS = 1500;
  const LIVE_TRANSLATE_DEBOUNCE_MS = 350;
  const HISTORY_LIMIT = 200;

  // ---- storage (per device; failures are harmless) ----
  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  }

  const state = {
    history: load('lg.history', []),
    saved: load('lg.saved', []),
    tab: 'history',
  };
  const prefs = load('lg.prefs', {});
  if (prefs.sourceLang) els.sourceLang.value = prefs.sourceLang;
  if (prefs.targetLang) els.targetLang.value = prefs.targetLang;
  els.speakToggle.checked = !!prefs.speak;
  function savePrefs() {
    save('lg.prefs', {
      sourceLang: els.sourceLang.value,
      targetLang: els.targetLang.value,
      speak: els.speakToggle.checked,
    });
  }

  function setStatus(msg, isError) {
    els.status.textContent = msg || '';
    els.status.classList.toggle('error', !!isError);
  }

  // ---- translation ----
  const cache = new Map();

  async function googleFree(text, sl, tl, signal) {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t'
      + `&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Google ${res.status}`);
    const data = await res.json();
    return data[0].map((part) => part[0]).join('');
  }

  async function myMemory(text, sl, tl, signal) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}`
      + `&langpair=${encodeURIComponent(sl)}|${encodeURIComponent(tl)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`MyMemory ${res.status}`);
    const data = await res.json();
    if (data.responseStatus !== 200) throw new Error(data.responseDetails || 'MyMemory error');
    return data.responseData.translatedText;
  }

  async function translate(text, signal, tl) {
    const sl = els.sourceLang.value.split('-')[0];
    const key = `${sl}|${tl}|${text}`;
    if (cache.has(key)) return cache.get(key);
    let result;
    try {
      result = await googleFree(text, sl, tl, signal);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      result = await myMemory(text, sl, tl, signal);
    }
    cache.set(key, result);
    return result;
  }

  function romanize(text) {
    return els.targetLang.value === 'gu' ? window.transliterateGujarati(text) : '';
  }

  // Turns what was heard into the lines a card shows.
  async function process(heard, signal) {
    const sl = els.sourceLang.value.split('-')[0];
    const tl = els.targetLang.value;
    if (sl === tl) {
      // They speak the language you're learning: show their words as heard,
      // plus the English meaning so you know what they said.
      const meaning = sl === 'en' ? '' : await translate(heard, signal, 'en');
      return { original: '', translated: heard, translit: romanize(heard), meaning };
    }
    const translated = await translate(heard, signal, tl);
    return { original: heard, translated, translit: romanize(translated), meaning: '' };
  }

  function fillLive(lines) {
    els.liveOriginal.textContent = lines.original;
    els.liveTranslated.textContent = lines.translated;
    els.liveTranslit.textContent = lines.translit;
    els.liveMeaning.textContent = lines.meaning;
  }

  // ---- speaking translations aloud ----
  function speak(text) {
    if (!els.speakToggle.checked || !('speechSynthesis' in window)) return;
    const tl = els.targetLang.value;
    const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(tl));
    if (!voice) {
      setStatus(`No ${els.targetLang.selectedOptions[0].text} voice on this phone, so it can't be read aloud.`);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    speechSynthesis.speak(u);
  }

  // ---- live panel ----
  let liveTimer = null;
  let liveAbort = null;
  let liveText = '';

  function showLive(original) {
    liveText = original;
    els.hint.hidden = true;
    els.liveOriginal.textContent = original;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(async () => {
      liveAbort?.abort();
      liveAbort = new AbortController();
      try {
        const lines = await process(original, liveAbort.signal);
        if (original !== liveText) return; // a newer partial sentence arrived
        fillLive(lines);
      } catch (err) {
        if (err.name !== 'AbortError') setStatus('Translation failed. Check your internet connection.', true);
      }
    }, LIVE_TRANSLATE_DEBOUNCE_MS);
  }

  function resetLive() {
    clearTimeout(liveTimer);
    liveAbort?.abort();
    liveText = '';
    fillLive({ original: '', translated: '', translit: '', meaning: '' });
  }

  // ---- finished sentences ----
  async function commit(original) {
    original = original.trim();
    if (!original) return;
    try {
      const entry = {
        id: Date.now() + Math.random().toString(36).slice(2, 6),
        ...(await process(original)),
      };
      state.history.unshift(entry);
      state.history.length = Math.min(state.history.length, HISTORY_LIMIT);
      save('lg.history', state.history);
      render();
      // Keep the finished sentence visible in the live panel until the next one starts.
      fillLive(entry);
      liveText = '';
      setStatus('');
      speak(entry.translated);
    } catch {
      setStatus('Translation failed. Check your internet connection.', true);
    }
  }

  // ---- lists ----
  function isSaved(entry) {
    return state.saved.some((s) => s.original === entry.original && s.translated === entry.translated);
  }

  function toggleSaved(entry) {
    if (isSaved(entry)) {
      state.saved = state.saved.filter((s) => !(s.original === entry.original && s.translated === entry.translated));
    } else {
      state.saved.unshift({ ...entry });
    }
    save('lg.saved', state.saved);
    render();
  }

  function renderList(listEl, entries, emptyText) {
    listEl.replaceChildren();
    if (!entries.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = emptyText;
      listEl.append(li);
      return;
    }
    for (const entry of entries) {
      const li = document.createElement('li');
      li.className = 'card';
      const p = (cls, text) => {
        const el = document.createElement('p');
        el.className = cls;
        el.textContent = text;
        return el;
      };
      const actions = document.createElement('div');
      actions.className = 'actions';
      const sayBtn = document.createElement('button');
      sayBtn.textContent = '🔊';
      sayBtn.setAttribute('aria-label', 'Read aloud');
      sayBtn.onclick = () => {
        const was = els.speakToggle.checked;
        els.speakToggle.checked = true;
        speak(entry.translated);
        els.speakToggle.checked = was;
      };
      const starBtn = document.createElement('button');
      starBtn.textContent = isSaved(entry) ? '★' : '☆';
      starBtn.classList.toggle('on', isSaved(entry));
      starBtn.setAttribute('aria-label', 'Save phrase');
      starBtn.onclick = () => toggleSaved(entry);
      actions.append(sayBtn, starBtn);
      li.append(p('original', entry.original), p('translated', entry.translated), p('translit', entry.translit), p('meaning', entry.meaning || ''), actions);
      listEl.append(li);
    }
  }

  function render() {
    renderList(els.history, state.history, 'Nothing yet. What you hear will show up here.');
    renderList(els.saved, state.saved, 'Tap ☆ on a phrase to save it for practice.');
    els.history.hidden = state.tab !== 'history';
    els.saved.hidden = state.tab !== 'saved';
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === state.tab));
  }

  // ---- speech recognition ----
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let listening = false;
  let silenceTimer = null;
  let pending = '';        // text heard but not yet committed
  let ignoreResults = false; // set while we force-restart after a silence commit

  function flushPending() {
    clearTimeout(silenceTimer);
    const text = pending;
    pending = '';
    if (text) commit(text);
  }

  function startRecognition() {
    rec = new SpeechRecognition();
    rec.lang = els.sourceLang.value;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      if (ignoreResults) return;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          pending = '';
          clearTimeout(silenceTimer);
          commit(r[0].transcript);
        } else {
          interim += r[0].transcript;
        }
      }
      if (!interim) return;
      pending = interim;
      showLive(interim);
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        flushPending();
        // Restart so the next sentence starts with a clean transcript.
        ignoreResults = true;
        try { rec.stop(); } catch { /* already stopped */ }
      }, SILENCE_MS);
    };

    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'language-not-supported') {
        setStatus(`This iPhone can't recognise ${els.sourceLang.selectedOptions[0].text} speech. Try another language.`, true);
      } else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setStatus('Microphone or speech recognition is blocked. Allow it in Settings → Safari, then try again.', true);
      } else {
        setStatus(`Speech recognition error: ${e.error}`, true);
      }
      stopListening();
    };

    // iOS ends the session after pauses; keep it going until the user stops.
    rec.onend = () => {
      ignoreResults = false;
      if (listening) {
        try { startRecognition(); } catch { stopListening(); }
      }
    };

    rec.start();
  }

  function startListening() {
    if (!SpeechRecognition) {
      setStatus('This browser has no speech recognition. On iPhone, open this page in Safari.', true);
      return;
    }
    listening = true;
    els.micBtn.classList.add('on');
    els.micBtn.setAttribute('aria-label', 'Stop listening');
    els.live.classList.add('listening');
    resetLive();
    els.hint.hidden = false;
    els.hint.textContent = 'Listening…';
    setStatus('');
    startRecognition();
  }

  function stopListening() {
    listening = false;
    els.micBtn.classList.remove('on');
    els.micBtn.setAttribute('aria-label', 'Start listening');
    els.live.classList.remove('listening');
    flushPending();
    try { rec?.stop(); } catch { /* already stopped */ }
  }

  // ---- wiring ----
  els.micBtn.onclick = () => (listening ? stopListening() : startListening());

  els.sourceLang.onchange = () => {
    savePrefs();
    if (listening) { stopListening(); startListening(); }
  };
  els.targetLang.onchange = () => {
    savePrefs();
    els.liveTranslated.lang = els.targetLang.value;
  };
  els.speakToggle.onchange = savePrefs;

  els.typeForm.onsubmit = (e) => {
    e.preventDefault();
    const text = els.typeInput.value;
    els.typeInput.value = '';
    commit(text);
  };

  els.clearBtn.onclick = () => {
    if (!confirm('Clear the conversation? Saved phrases are kept.')) return;
    state.history = [];
    save('lg.history', state.history);
    resetLive();
    els.hint.hidden = false;
    render();
  };

  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => { state.tab = t.dataset.tab; render(); };
  });

  // Voices load asynchronously on some browsers.
  if ('speechSynthesis' in window) speechSynthesis.getVoices();

  render();
})();
