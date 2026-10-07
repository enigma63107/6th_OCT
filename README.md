# Live Gujarati

A web app for iPhone that listens to someone speaking and shows a live Gujarati
translation as they talk, with the Gujarati also written in English letters
(e.g. "તમે કેમ છો" → *tame kem chho*) so you can learn to read and say it.

## Features

- **Live translation**: the translation updates while the person is still talking.
  When they pause, the sentence is added to the conversation log.
- **Transliteration**: every Gujarati line also appears in English letters.
- **Saved phrases**: tap ☆ to keep a phrase for practice. Saved phrases stay on your phone.
- **Speak aloud** (🔊): reads the Gujarati out loud if your iPhone has a Gujarati voice.
- **Type to translate**: for when you want to check something yourself.
- The speaker's language can be English, Hindi, Marathi or Gujarati. The output can be Gujarati, English or Hindi.
- **When they speak Gujarati**, you see their words in Gujarati, the English-letter version,
  and the English meaning.

Pick the speaker's language before you start. Speech recognition listens for one
language at a time, so it can't detect which one is being spoken.

## Putting it on your iPhone

The microphone only works over `https://`, so the app needs to be hosted. The
easiest free option is GitHub Pages:

1. Merge this branch into `main`.
2. On GitHub, open the repo → **Settings → Pages**. Under *Build and deployment*,
   pick **Deploy from a branch**, then choose `main` and `/ (root)`, and save.
   (On a free GitHub account, Pages needs the repo to be public.)
3. After a minute or so, open `https://enigma63107.github.io/6th_OCT/` in **Safari** on your iPhone.
4. Tap the Share button → **Add to Home Screen** so it opens like an app.
5. Tap the mic. Allow the microphone and speech recognition when iPhone asks.

If the mic doesn't work from the home-screen icon, open the same link in Safari.
Older iOS versions only allow speech recognition inside Safari itself.

## How it works

| Step | What does it |
| --- | --- |
| Speech → text | Safari's built-in speech recognition (Apple's, the same as dictation) |
| Text → Gujarati | Google Translate's free web endpoint, falling back to MyMemory |
| Gujarati → English letters | `translit.js`, which runs on the phone |
| Read aloud | The iPhone's built-in voices |

It needs an internet connection. Everything is plain HTML/CSS/JS, with no build step.

## Files

- `index.html`: page layout
- `style.css`: styling (light and dark mode)
- `app.js`: listening, live translation, conversation log, saved phrases
- `translit.js`: Gujarati → English letters
