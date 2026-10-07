// Reads text aloud. iPhones usually have no Gujarati voice, so this plays
// Google Translate's free voice and falls back to the phone's own voices.
(function (root) {
  const TTS_URL = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob';
  const MAX_CHARS = 180;   // the endpoint refuses longer text
  const ECHO_TAIL_MS = 400; // keep the mic deaf briefly after playback ends

  // Splits text into pieces under MAX_CHARS, preferring sentence and word breaks.
  function pieces(text) {
    const out = [];
    let rest = text.trim();
    while (rest.length > MAX_CHARS) {
      const head = rest.slice(0, MAX_CHARS);
      let at = Math.max(head.lastIndexOf('. '), head.lastIndexOf('। '), head.lastIndexOf('? '));
      if (at < MAX_CHARS / 2) at = head.lastIndexOf(' ');
      if (at <= 0) at = MAX_CHARS - 1;
      out.push(rest.slice(0, at + 1).trim());
      rest = rest.slice(at + 1).trim();
    }
    if (rest) out.push(rest);
    return out;
  }

  // A tenth of a second of silence, used to unlock audio on iOS.
  function silentWavUrl() {
    const rate = 8000;
    const n = rate / 10;
    const buf = new ArrayBuffer(44 + n);
    const v = new DataView(buf);
    const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    str(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  function createSpeaker() {
    const audio = new Audio();
    let token = 0;
    let speaking = false;
    let quietUntil = 0;
    let silent = null;

    function play(url) {
      return new Promise((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('audio failed'));
        audio.src = url;
        audio.play().catch(reject);
      });
    }

    function phoneVoice(text, lang) {
      return new Promise((resolve, reject) => {
        if (!('speechSynthesis' in window)) return reject(new Error('no speech'));
        const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
        if (!voice) return reject(new Error('no voice'));
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        speechSynthesis.speak(u);
      });
    }

    function stop() {
      token++;
      speaking = false;
      audio.pause();
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    }

    return {
      // iOS only plays sound started from a tap. Call this inside one so
      // later playback (after a translation arrives) is allowed.
      unlock() {
        silent = silent || silentWavUrl();
        audio.src = silent;
        audio.play().catch(() => {});
        if ('speechSynthesis' in window) speechSynthesis.getVoices();
      },

      async say(text, lang) {
        if (!text) return;
        stop();
        const mine = ++token;
        speaking = true;
        try {
          for (const piece of pieces(text)) {
            if (mine !== token) return;
            await play(`${TTS_URL}&tl=${lang}&q=${encodeURIComponent(piece)}`);
          }
        } catch {
          if (mine !== token) return;
          try {
            await phoneVoice(text, lang);
          } catch {
            throw new Error(`Couldn't play the ${lang === 'gu' ? 'Gujarati' : 'English'} audio. Check your internet connection.`);
          }
        } finally {
          if (mine === token) {
            speaking = false;
            quietUntil = performance.now() + ECHO_TAIL_MS;
          }
        }
      },

      stop,

      isSpeaking() {
        return speaking || performance.now() < quietUntil;
      },
    };
  }

  root.createSpeaker = createSpeaker;
  root.speechPieces = pieces;
})(window);
