# WriteOn

**Your words. Your voice.**

WriteOn is an ALS communication prototype that connects an adaptive writing aid
to a handwriting-to-speech web application. It was developed for the BioHacks
2026 Wearable Devices and Quality of Life track.

The physical concept combines a 3D-printed marker mount, an adjustable strap
system, a cap dock, and a phone support. This repository contains the full
application, including real Gemini and ElevenLabs API integrations.

## How it works

1. Open the application on a laptop and sign in.
2. Open **Setup**, enter a Gemini API key, and optionally enter an ElevenLabs key
   with **Text to Speech** and **Voices read** permissions.
3. Click **Connect phone**, scan the QR code, and use the same account on the phone.
4. Tap **Start camera**, allow camera access, and position the phone above the
   whiteboard. Keep the camera page visible and the phone awake.
5. Write a message, move the writing hand out of frame, and press **Capture writing**
   on the laptop. An existing photo can also be uploaded.
6. Review and correct Gemini's transcription, then press **Speak**. Choose an
   ElevenLabs voice or the separately labelled browser voice option.
7. Press **Stop** or **Escape** to interrupt speech. **End session** clears the
   stored image and transcript for that session.

Nothing is spoken automatically. The space bar captures a photo when focus is
outside form fields, links, buttons, and dialogs.

## Technology

- React and TypeScript for the laptop and phone interfaces
- Vinext and Vite for the application build
- Tailwind CSS and custom CSS for the interface
- Google Gemini API for image-to-text transcription
- ElevenLabs API for text-to-speech
- Web Speech API for an optional browser voice
- Cloudflare Workers and D1 for the backend and session state
- QR codes for phone pairing

## Project structure

| Path | Purpose |
| --- | --- |
| `components/writeon.tsx` | Laptop pairing, review, API setup, and speech controls |
| `components/writeon-phone.tsx` | Phone camera, image capture, and reconnect logic |
| `lib/writeon-api.ts` | Session authorization and provider API requests |
| `app/api/[...path]/route.ts` | Backend route entry point |
| `db/` and `drizzle/` | Database schema and migrations |
| `tests/writeon-api.test.mjs` | SQLite-backed tests with mocked providers |

## Development

Use Node.js 24 or newer. Install the dependencies using the repository's pinned
package manager and setup script:

```sh
npm run install:ci
npm run dev
```

Run the backend tests without live API credentials:

```sh
npm test
```

Build the application:

```sh
npm run build
```

The backend targets a Cloudflare Worker with a D1 binding named `DB`. Apply the
SQL migrations in `drizzle/` before exercising session routes. The hosted
application relies on an authenticated gateway that provides verified visitor
identity; a deployment elsewhere must implement equivalent authentication and
must not trust identity headers supplied directly by a client. The development
configuration provides mock authentication for local development only.

The hosting manifest included here contains no deployment identity. Register a
new deployment and configure its identity and storage bindings when deploying
your own copy.

## API credentials and privacy

No API credentials are included. Enter your own keys in **Setup**, or configure
the following server environment variables using the blank `.env.example` as
a reference:

```text
GEMINI_API_KEY
ELEVENLABS_API_KEY
GEMINI_MODEL
```

The default Gemini model is `gemini-3.8-flash`. Keys entered in Setup remain in
the laptop tab's memory and are cleared on refresh. They travel through the
backend to the selected provider and are not written to the database, browser
storage, or repository. The paired phone does not receive the provider keys.

The backend stores one current JPEG and transcript per session, with access
restricted to its authenticated owner. Photos and transcripts expire after
30 minutes and sessions after eight hours; expired data is removed on later
session access. Ending a session deletes its stored image and transcript
immediately. Provider-side retention follows the applicable account terms.

## Prototype status

WriteOn is intended for people who retain sufficient movement to write with
support. Its fit, comfort, and clinical benefit have not been validated. Phone
positioning and setup may require assistance, and handwriting recognition can
make mistakes.

Automated provider tests use mocks. Live camera capture, provider credentials,
account quota, transcription, and audio playback must be tested together on the
demonstration devices before presenting the complete workflow as verified.

Third-party notices included with the source remain in their original files.
