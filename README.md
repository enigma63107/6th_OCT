# Live Gujarati

A web app for iPhone that listens to someone speaking and shows a live Gujarati
translation as they talk, with the Gujarati also written in English letters
(e.g. "તમે કેમ છો" → *tame kem chho*) so you can learn to read and say it.

## How it works

1. **Them:** tap **Listen to them**. Whatever the other person says (English, Hindi,
   Gujarati or a mix) appears as Gujarati with English letters underneath, and is read
   aloud. If they spoke Hindi or English you hear the Gujarati; if they spoke Gujarati
   you hear the English meaning.
2. **You:** **hold the green button** and reply in Hindi or English. The app shows and
   says the Gujarati for your reply.
3. **Practice:** the button changes to **Hold: say it in Gujarati**. Hold it and say the
   sentence to the person in Gujarati. The app scores how close you got and marks any
   words you missed; below the pass mark it plays the sentence again so you can retry.

Holding the button is how the app knows it's you talking. Everything else is treated as
the other person. Earphones help: the other person won't hear the app, and the app
won't hear itself.

Other features: tap 🔊 to replay any Gujarati, ☆ to save a phrase (Saved phrases tab),
or type a reply instead of speaking.

## Groq key (free)

Listening uses Groq's free Whisper speech AI:

1. Sign up at [console.groq.com](https://console.groq.com) (free, no card needed).
2. Go to **API Keys → Create API Key** and copy it (it starts with `gsk_`).
3. In the app, tap **Setup**, paste the key and tap **Save**. The key stays on your phone.

The free plan allows about 20 phrases a minute.

## Putting it on your iPhone

The microphone only works over `https://`, so the app needs to be hosted. The
easiest free option is GitHub Pages:

1. On GitHub, open the repo → **Settings → Pages**. Under *Build and deployment*,
   pick **Deploy from a branch**, then choose the branch that has these files and
   `/ (root)`, and save. (On a free GitHub account, Pages needs the repo to be public.)
2. After a minute or so, open `https://enigma63107.github.io/6th_OCT/` in **Safari** on your iPhone.
3. Tap the Share button → **Add to Home Screen** so it opens like an app.
4. Tap **Listen to them** and allow the microphone when iPhone asks.

## How it works

| Step | What does it |
| --- | --- |
| Speech → text | Groq's Whisper, phrase by phrase (`listen-groq.js`) |
| Translation | Google Translate's free web endpoint, falling back to MyMemory |
| Gujarati → English letters | `translit.js`, on the phone |
| Practice score | `practice.js`, on the phone |
| Read aloud | Google Translate's voice, falling back to the iPhone's voices (`speak.js`) |

It needs an internet connection. Everything is plain HTML/CSS/JS, with no build step.

## Files

- `index.html`, `style.css`: the screen (light and dark mode)
- `app.js`: conversation flow, translation, saved phrases
- `listen-groq.js`: mic recording, pause detection, who's speaking, Groq transcription
- `speak.js`: reading Gujarati and English aloud
- `practice.js`: scoring your spoken Gujarati
- `translit.js`: Gujarati → English letters
