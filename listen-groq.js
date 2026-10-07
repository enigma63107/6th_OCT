// Listens through the mic, cuts the audio into phrases at natural pauses and
// sends each phrase to Groq's free Whisper API, which copes with speech that
// mixes English, Hindi and Gujarati.
(function (root) {
  const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
  const MODEL = 'whisper-large-v3-turbo';

  const TICK_MS = 50;
  const PAUSE_MS = 700;          // this much quiet after speech ends a phrase
  const MAX_PHRASE_MS = 12000;   // never let one phrase run longer than this
  const IDLE_RESET_MS = 15000;   // drop recordings that only hold silence
  const MIN_VOICED_MS = 300;     // shorter blips are coughs or clicks
  const MIN_THRESHOLD = 0.012;

  // Whisper sometimes "hears" these in near-silence.
  const HALLUCINATIONS = /^(thank you\.?|thanks for watching!?|you|bye\.?|\.+)$/i;

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
    let queue = Promise.resolve(); // keeps phrases in the order they were spoken
    const mimeType = pickMimeType();
    const samples = new Float32Array(1024);

    function startRecorder() {
      voicedMs = 0;
      lastVoiceAt = 0;
      recStartedAt = performance.now();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      // Each recording keeps its own chunks: data arrives after stop(), by
      // which time the next recording has already started.
      rec.chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
      rec.start();
      recorder = rec;
    }

    // Ends the current recording and starts the next one straight away.
    function cut(send) {
      const rec = recorder;
      const voiced = voicedMs;
      rec.onstop = () => {
        if (!send || voiced < MIN_VOICED_MS) return;
        const blob = new Blob(rec.chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
        transcribe(blob, voiced);
      };
      rec.stop();
      if (active) startRecorder();
    }

    function transcribe(blob, voiced) {
      const request = sendToGroq(blob);
      opts.onState?.('transcribing');
      queue = queue.then(async () => {
        try {
          const text = (await request).trim();
          if (!text || (voiced < 1000 && HALLUCINATIONS.test(text))) return;
          opts.onPhrase(text);
        } catch (err) {
          opts.onError?.(err);
        } finally {
          if (active) opts.onState?.('listening');
        }
      });
    }

    async function sendToGroq(blob) {
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
      const form = new FormData();
      form.append('file', blob, `phrase.${ext}`);
      form.append('model', MODEL);
      form.append('response_format', 'json');
      form.append('temperature', '0');
      const language = opts.getLanguage();
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
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      const rms = Math.sqrt(sum / samples.length);
      const now = performance.now();
      // Don't transcribe our own read-aloud output.
      const selfTalking = 'speechSynthesis' in window && speechSynthesis.speaking;
      const threshold = Math.max(MIN_THRESHOLD, noiseFloor * 3);
      const voice = !selfTalking && rms > threshold;
      if (voice) {
        voicedMs += TICK_MS;
        lastVoiceAt = now;
      } else {
        noiseFloor = noiseFloor * 0.98 + rms * 0.02;
      }
      opts.onLevel?.(voice, rms);

      const age = now - recStartedAt;
      if (voicedMs && !voice && now - lastVoiceAt > PAUSE_MS) cut(true);
      else if (voicedMs && age > MAX_PHRASE_MS) cut(true);
      else if (!voicedMs && age > IDLE_RESET_MS) cut(false);
    }

    return {
      // Must be called from a tap so iOS allows the mic and audio.
      async start() {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        await audioCtx.resume();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = samples.length;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        active = true;
        startRecorder();
        timer = setInterval(tick, TICK_MS);
        opts.onState?.('listening');
      },
      stop() {
        if (!active) return;
        active = false;
        clearInterval(timer);
        cut(true); // send whatever was said just before stopping
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close();
      },
    };
  }

  root.createGroqListener = createGroqListener;
})(window);
