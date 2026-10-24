# Devpost Submission Draft

Copy each section into the Devpost form.
- **Hackathon:** Nebius x NVIDIA.
- **Deadline:** Thursday 30 October 2026, 10:00 PDT (17:00 UTC).
- **Track:** Personal AI.

## Links

- **Demo video (YouTube, about 1:35):** to add once uploaded (file: `film/out/AirlockLandscape.mp4`, rendered from the repo).
- **Repository (public, MIT license):** https://github.com/asiyetajwa/airlock
- **Thumbnails:** `docs/thumbnail.jpg` (3:2) and `docs/thumbnail-youtube.jpg` (16:9).
- **Results, every run including the misses:** `docs/RESULTS.md`.

Narration is the ElevenLabs voice Eric. Music and sound were made with ElevenLabs on Brian's account.

## Project name

Airlock

## Tagline

A personal AI that seals your secrets on your own device, proves what left with a signed receipt, and publishes its leak score against a Nemotron red team.

## Built with

TypeScript, Node.js, Express, Nebius Token Factory, NVIDIA Nemotron 3 Ultra, NVIDIA Nemotron 3 Super, Transformers.js, ONNX Runtime Web, BERT NER, Ed25519, Tavily, Remotion, Playwright, ElevenLabs

## Description

### Inspiration

People want an AI that reads their bank emails, lease, tax return and passport scan, but they cannot see what happens to those secrets once they are pasted into a chat. "We take privacy seriously" is a promise, not something you can check. We wanted the boundary to be visible, checkable and tested.

### What it does

Airlock is a desktop app, with a phone companion from the same code, for asking questions about your own documents. Your vault stays on your device. When you ask a question:

1. **Sealed here.** Airlock finds what to hold and replaces each value with a consistent token, so the model can still reason ("PERSON_1 sent AMOUNT_1 from ACCOUNT_1"). It finds them three ways:
   - rules for secrets and numbers, with checksums;
   - an on-device name finder;
   - your own "always hold" list.

   An egress check scans the outbound text for every value the vault holds and blocks the call on any hit.
2. **Nemotron reads sealed text.** NVIDIA Nemotron 3 Super on Nebius Token Factory answers, through a relay that holds the API key.
3. **Filled in here.** The real values are put back on your device, highlighted.

**Three things set it apart:**

- **Sealed on your device, desktop and phone.** Nothing leaves unsealed. The rules see through common hiding tricks: digits spelled out, characters spaced apart, keys split across lines, numbers regrouped with dots or dashes. The name model runs in the browser from your own computer.
- **Two-sided receipts.** The relay signs (Ed25519) the hash of exactly the bytes it received and the answer it returned. Airlock checks that signature against what it sent. Change one byte, and the check fails on screen. A log a system keeps about itself cannot do that.
- **Proof by attack.** Nemotron 3 Ultra plays red team: it writes documents built to smuggle secrets out, with planted secrets of known type and position. We publish the score, including what got through.

**Results, scored run 2:** 48 new red-team documents, 240 items, half the people with rarer names.
- **Held:** Airlock held **1,083 of 1,170 planted secrets (92.6%)**, including 159 of 160 in the prompt-injection documents.
- **Leaked:** 87 got through, mostly rare first names in lower case. Every one is in the results.
- **Answers:** 149 of 209 answers were still right after filling in.
- **Cost:** the whole attack cost **$0.05** on Token Factory.

### How we built it

- **The sealer** (`src/seal`) is pure TypeScript and runs unchanged in the browser, on a phone and in Node, so the leak test runs the exact code the app runs:
  - rules with Luhn, ABA routing and IBAN checks;
  - text "views" that undo hiding tricks and map matches back to the original;
  - a BERT NER model through Transformers.js and ONNX Runtime Web, served from the user's own machine, never from a third party;
  - public US name lists;
  - a token map shared across the vault.
- **The relay** holds the Token Factory key. It refuses any payload in which its own rules still see a raw secret, and signs every receipt. Long contexts go to Nemotron 3 Ultra.
- **Every model call** goes through a spend guard shared with our other entry, Apprentice. It prices calls from Token Factory's published prices, reserves the worst case before sending, and hard-stops at the cap.
- **The leak test** (`scripts/leak-test.ts`) has Ultra write documents with secret slots and disguises; we plant invented secrets and score leaks, extra holds and filled-in answers.
- **The film** is made from stills of the real app, with one live question to Nemotron.

### Challenges we ran into

- **Our first scored run humbled us.** On fresh red-team documents, 142 planted secrets leaked (88% held). Most were names the cased name model misses in lower case, and birth dates spelled out. We fixed those as general rules on the development material, then scored a second, fresh set once instead of re-scoring the first.
- **Common names flatter a name list.** So in run 2, half the people have rarer names on no list we use. That is where most of the 87 leaks come from, and we report it.
- **The red team bent the rules.** Ultra used the date-of-birth slot for key-rotation dates. We count a date as a birth date only when the document says so, and report the others separately.
- **Our own test keys tripped GitHub's secret scanning.** Slack-style tokens have no checksum, so the scanner could not tell they were invented. We switched to formats scanners can tell apart.

### Accomplishments that we're proud of

- **A boundary you can check:** a receipt that fails on screen when one byte changes.
- **A leak score from an adversary,** published with its misses.
- **One sealer for every surface:** the same code runs on the desktop, on the phone and in the test harness.
- **Small spend:** everything for $0.18 of Token Factory credit, under the $0.20 cap we set.

### What we learned

- Pattern rules catch structure. Names are the hard part, and lower-case names in casual text are the hardest.
- An adversarial eval found more in ten minutes than a week of hand-written tests would have.
- Scoring a fresh set only once keeps you honest.

### What's next for Airlock

- **Names:** an uncased or multilingual name model for lower-case names.
- **Images:** on-device text recognition for photographed letters.
- **The relay:** run it inside an OpenShell sandbox whose network policy allows only Token Factory.
- **The leak test:** re-run it automatically with every release.

## Product feedback (Token Factory and NVIDIA)

- **What helped:**
  - the verbose model list with live prices, which our spend guard reads;
  - Nemotron at prices that make a full red-team run cost five cents;
  - `enable_thinking: false` for short, cheap answers.
- **What would help most:**
  - structured outputs for Nemotron, so the red team's JSON never needs a repair pass;
  - a per-project spending cap on the platform itself.
