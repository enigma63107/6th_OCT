// Scores how close your spoken Gujarati was to the sentence you were practising.
// Compares the sounds (via English letters), so spelling slips don't count against you.
(function (root) {
  const translit = typeof module !== 'undefined'
    ? require('./translit.js').transliterate
    : root.transliterateGujarati;

  // Smooths over differences that don't change how a word sounds.
  function sound(text) {
    return translit(text).toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u')
      .replace(/chh/g, 'ch').replace(/sh/g, 's').replace(/w/g, 'v')
      .replace(/\s+/g, ' ').trim();
  }

  function distance(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return row[b.length];
  }

  function similarity(a, b) {
    if (!a.length && !b.length) return 1;
    return 1 - distance(a, b) / Math.max(a.length, b.length);
  }

  // Returns a 0-100 score and, for each word of the target, whether you said it.
  function scoreAttempt(attempt, target) {
    const said = sound(attempt);
    const saidWords = said.split(' ').filter(Boolean);
    const score = Math.round(100 * similarity(said.replace(/ /g, ''), sound(target).replace(/ /g, '')));
    const words = target.split(/\s+/).filter(Boolean).map((word) => {
      const w = sound(word);
      return { word, ok: !w || saidWords.some((s) => similarity(s, w) >= 0.6) };
    });
    return { score, words };
  }

  root.scoreAttempt = scoreAttempt;
  if (typeof module !== 'undefined') module.exports = { scoreAttempt };
})(typeof window !== 'undefined' ? window : globalThis);
