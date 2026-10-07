// Listens through the mic, cuts the audio into phrases and sends each phrase
// to Groq's free Whisper API, which copes with speech that mixes English,
// Hindi and Gujarati.
//
// Every phrase is labelled with who was speaking:
//   'them'  - the other person; phrases are cut automatically at pauses
//   any other label - you, for as long as you hold a button (holdStart/holdEnd)
(function (root) {
  const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
  const MODEL = 'whisper-large-v3-turbo';

  const TICK_MS = 50;
  const PAUSE_MS = 700;          // this much quiet after speech ends their phrase
  const MAX_PHRASE_MS = 12000;   // never let one of their phrases run longer
  const MAX_HOLD_MS = 30000;     // safety limit while you hold the button
  const IDLE_RESET_MS = 15000;   // drop recordings that only hold silence
  const MIN_VOICED_MS = 300;     // shorter blips are coughs or clicks
  const MIN_THRESHOLD = 0.012;

  // Whisper sometimes "hears" these in near-silence.
  const HALLUCINATIONS = /^(thank you\.?|thanks for watching!?|you|bye\.?|\.+|धन्यवाद[।.]?|ધન્યવાદ[.]?)$/i;

  function pickMimeType() {
    for (const type of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }

  function createGroqListener(opts) {
    let stream = null;
    let audioCtx = null;
    let analyser = null;
    let timer = null;
    let recorder = null;
    let recStartedAt = 0;
    let voicedMs = 0;
    let lastVoiceAt = 0;
    let noiseFloor = 0.01;
    let active = false;
    let autoListen = false; // whether their phrases are picked up
    let holding = null;     // your label while you hold the button
    let wasMuted = false;
    let queue = Promise.resolve(); // keeps phrases in the order they were spoken
    const mimeType = pickMimeType();
    const samples = new Float32Array(1024);

    function startRecorder(label) {
      voicedMs = 0;
      lastVoiceAt = 0;
      recStartedAt = performance.now();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      // Each recording keeps its own chunks: data arrives after stop(), by
      // which time the next recording has already started.
      rec.chunks = [];
      rec.label = label;
      rec.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
      rec.start();
      recorder = rec;
    }

    // Ends the current recording and, while active, starts the next one.
    function cut(send, nextLabel) {
      const rec = recorder;
      const voiced = voicedMs;
      rec.onstop = () => {
        if (!send || voiced < MIN_VOICED_MS) return;
        const blob = new Blob(rec.chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
        transcribe(blob, voiced, rec.label);
      };
      rec.stop();
      if (active) startRecorder(nextLabel ?? holding ?? 'them');
    }

    function transcribe(blob, voiced, label) {
      const request = sendToGroq(blob, label);
      opts.onState?.('transcribing');
      queue = queue.then(async () => {
        try {
          const text = (await request).trim();
          if (!text || (voiced < 1000 && HALLUCINATIONS.test(text))) return;
          opts.onPhrase(text, label);
        } catch (err) {
          opts.onError?.(err);
        } finally {
          if (active) opts.onState?.('listening');
        }
      });
    }

    async function sendToGroq(blob, label) {
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
      const form = new FormData();
      form.append('file', blob, `phrase.${ext}`);
      form.append('model', MODEL);
      form.append('response_format', 'json');
      form.append('temperature', '0');
      const language = opts.getLanguage(label);
      if (language) form.append('language', language);
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.getKey()}` },
        body: form,
      });
      if (!res.ok) {
        const err = new Error(`Groq ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return (await res.json()).text || '';
    }

    function tick() {
      const now = performance.now();
      const age = now - recStartedAt;

      // Never transcribe the app's own read-aloud audio.
      if (opts.isMuted?.() && !holding) {
        if (!wasMuted) cut(false);
        wasMuted = true;
        opts.onLevel?.(false);
        return;
      }
      wasMuted = false;

      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      const rms = Math.sqrt(sum / samples.length);
      const threshold = Math.max(MIN_THRESHOLD, noiseFloor * 3);
      const voice = rms > threshold;
      if (voice) {
        voicedMs += TICK_MS;
        lastVoiceAt = now;
      } else {
        noiseFloor = noiseFloor * 0.98 + rms * 0.02;
      }
      opts.onLevel?.(voice);

      if (holding) {
        // You decide when your phrase ends, so pauses don't cut it.
        if (age > MAX_HOLD_MS) cut(true);
        return;
      }
      if (!autoListen) {
        if (age > IDLE_RESET_MS) cut(false);
        return;
      }
      if (voicedMs && !voice && now - lastVoiceAt > PAUSE_MS) cut(true);
      else if (voicedMs && age > MAX_PHRASE_MS) cut(true);
      else if (!voicedMs && age > IDLE_RESET_MS) cut(false);
    }

    return {
      get running() { return active; },

      // Must be called from a tap so iOS allows the mic.
      async start() {
        if (active) return;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        try {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          await audioCtx.resume();
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = samples.length;
          audioCtx.createMediaStreamSource(stream).connect(analyser);
        } catch (err) {
          stream.getTracks().forEach((t) => t.stop());
          throw err;
        }
        active = true;
        startRecorder(holding ?? 'them');
        timer = setInterval(tick, TICK_MS);
        opts.onState?.('listening');
      },

      stop() {
        if (!active) return;
        active = false;
        clearInterval(timer);
        // Send whatever was said just before stopping.
        cut(Boolean(holding) || autoListen);
        holding = null;
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close();
      },

      setAutoListen(on) {
        if (autoListen === on) return;
        autoListen = on;
        if (active && !holding) cut(!on); // finish their phrase when turning off
      },

      // You start talking: send what they said so far, then record you.
      holdStart(label) {
        if (holding) return;
        holding = label;
        if (active) cut(autoListen, label);
      },

      // You stop talking: send your phrase and go back to listening to them.
      holdEnd() {
        if (!holding) return;
        holding = null;
        if (active) cut(true, 'them');
      },
    };
  }

  root.createGroqListener = createGroqListener;
})(window);
