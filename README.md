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

## Mixed languages (English + Hindi + Gujarati)

Choose **Mixed** as the speaker's language. This uses Groq's free Whisper speech AI,
which understands speech that switches between languages:

1. Sign up at [console.groq.com](https://console.groq.com) (free, no card needed).
2. Go to **API Keys → Create API Key** and copy it (it starts with `gsk_`).
3. In the app, tap **Setup**, paste the key and tap **Save**. The key stays on your phone.

The app cuts the audio at each pause and sends that phrase to Groq. Text shows up a
second or two after each phrase. The free plan allows about 20 phrases a minute.

Without a key, the app uses Safari's built-in listening. That only understands the one
language you pick, and it needs **Settings → General → Keyboard → Enable Dictation** on.

## Putting it on your iPhone

The microphone only works over `https://`, so the app needs to be hosted. The
easiest free option is GitHub Pages:

1. On GitHub, open the repo → **Settings → Pages**. Under *Build and deployment*,
   pick **Deploy from a branch**, then choose the branch that has these files and
   `/ (root)`, and save. (On a free GitHub account, Pages needs the repo to be public.)
2. After a minute or so, open `https://enigma63107.github.io/6th_OCT/` in **Safari** on your iPhone.
3. Tap the Share button → **Add to Home Screen** so it opens like an app.
4. Tap the mic. Allow the microphone and speech recognition when iPhone asks.

If the mic doesn't work from the home-screen icon, open the same link in Safari.
Older iOS versions only allow speech recognition inside Safari itself.

## How it works

| Step | What does it |
| --- | --- |
| Speech → text | Groq's Whisper (`listen-groq.js`) with a key, otherwise Safari's built-in recognition |
| Text → Gujarati | Google Translate's free web endpoint, falling back to MyMemory |
| Gujarati → English letters | `translit.js`, which runs on the phone |
| Read aloud | The iPhone's built-in voices |

It needs an internet connection. Everything is plain HTML/CSS/JS, with no build step.

## Files

- `index.html`: page layout
- `style.css`: styling (light and dark mode)
- `app.js`: live translation, conversation log, saved phrases, Safari listening
- `listen-groq.js`: mic recording, pause detection, Groq transcription
- `translit.js`: Gujarati → English letters
