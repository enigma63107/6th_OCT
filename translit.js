// Gujarati script -> readable Latin letters (e.g. "કેમ છો" -> "kem chho").
// A learner-friendly approximation, not a formal standard like ISO 15919.
(function (root) {
  const VOWELS = {
    'અ': 'a', 'આ': 'aa', 'ઇ': 'i', 'ઈ': 'ee', 'ઉ': 'u', 'ઊ': 'oo', 'ઋ': 'ru',
    'એ': 'e', 'ઐ': 'ai', 'ઓ': 'o', 'ઔ': 'au', 'ઍ': 'e', 'ઑ': 'o',
  };
  const MATRAS = {
    'ા': 'aa', 'િ': 'i', 'ી': 'ee', 'ુ': 'u', 'ૂ': 'oo', 'ૃ': 'ru',
    'ે': 'e', 'ૈ': 'ai', 'ો': 'o', 'ૌ': 'au', 'ૅ': 'e', 'ૉ': 'o',
  };
  const CONSONANTS = {
    'ક': 'k', 'ખ': 'kh', 'ગ': 'g', 'ઘ': 'gh', 'ઙ': 'ng',
    'ચ': 'ch', 'છ': 'chh', 'જ': 'j', 'ઝ': 'jh', 'ઞ': 'ny',
    'ટ': 't', 'ઠ': 'th', 'ડ': 'd', 'ઢ': 'dh', 'ણ': 'n',
    'ત': 't', 'થ': 'th', 'દ': 'd', 'ધ': 'dh', 'ન': 'n',
    'પ': 'p', 'ફ': 'f', 'બ': 'b', 'ભ': 'bh', 'મ': 'm',
    'ય': 'y', 'ર': 'r', 'લ': 'l', 'ળ': 'l', 'વ': 'v',
    'શ': 'sh', 'ષ': 'sh', 'સ': 's', 'હ': 'h',
  };
  const SIGNS = { 'ં': 'n', 'ઁ': 'n', 'ઃ': 'h', 'ઽ': '' };
  const VIRAMA = '્';
  const NUKTA = '઼';

  function isGujarati(ch) {
    const c = ch.codePointAt(0);
    return c >= 0x0A80 && c <= 0x0AFF;
  }

  // Transliterate one run of Gujarati letters (a word).
  function word(chars) {
    let out = '';
    let syllables = 0;
    let endsWithInherentA = false;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      endsWithInherentA = false;
      if (CONSONANTS[ch]) {
        out += CONSONANTS[ch];
        syllables++;
        let next = chars[i + 1];
        if (next === NUKTA) next = chars[++i + 1];
        if (next && MATRAS[next]) {
          out += MATRAS[next];
          i++;
        } else if (next === VIRAMA) {
          syllables--;
          i++;
        } else {
          out += 'a';
          endsWithInherentA = true;
        }
      } else if (VOWELS[ch]) {
        out += VOWELS[ch];
        syllables++;
      } else if (ch in SIGNS) {
        out += SIGNS[ch];
      } else if (ch >= '૦' && ch <= '૯') {
        out += String(ch.codePointAt(0) - 0x0AE6);
      }
    }
    // Spoken Gujarati drops the final inherent "a": કેમ is "kem", not "kema".
    if (endsWithInherentA && syllables > 1) out = out.slice(0, -1);
    return out;
  }

  function transliterate(text) {
    let out = '';
    let run = [];
    for (const ch of text) {
      if (isGujarati(ch)) {
        run.push(ch);
      } else {
        if (run.length) { out += word(run); run = []; }
        out += ch;
      }
    }
    if (run.length) out += word(run);
    return out;
  }

  // Whisper sometimes writes Gujarati speech in Hindi (Devanagari) letters.
  // The two scripts share a layout, so each letter maps across by a fixed offset.
  function toGujaratiScript(text) {
    let out = '';
    for (const ch of text) {
      const c = ch.codePointAt(0);
      if (c === 0x0964 || c === 0x0965) out += '.'; // danda
      else if (c >= 0x0900 && c <= 0x097F) out += String.fromCodePoint(c + 0x180);
      else out += ch;
    }
    return out;
  }

  root.transliterateGujarati = transliterate;
  root.toGujaratiScript = toGujaratiScript;
  if (typeof module !== 'undefined') module.exports = { transliterate, toGujaratiScript };
})(typeof window !== 'undefined' ? window : globalThis);
