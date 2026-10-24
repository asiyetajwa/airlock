# Airlock: Scope

Nebius x NVIDIA hackathon, **Personal AI** track. Deadline Thursday 30 October 2026, 20:00 EAT. Mockups: `design/desktop.html` (primary) and `design/mockups.html` (phone companion).

## One line

A personal assistant for your own documents and messages that seals every secret on your computer before anything reaches the cloud, shows you a receipt of exactly what left, and proves it with a leak test.

## Why it is worth building

People want an assistant that reads their bank emails, lease, tax return and passport scan, but they cannot see what happens to those secrets. Airlock makes the boundary visible and testable: the cloud model (NVIDIA Nemotron on Nebius Token Factory) does the thinking on sealed text, and the real names, numbers and keys never leave the device.

## Surface: desktop first, phone as companion

- **Desktop is the product.** Your documents and mail live on your computer, so the gatekeeper belongs there. The track plan frames Airlock as "what left the machine": a password in a doc, a key in an email. A wide window shows the question, the answer and the receipt side by side, which is the whole pitch in one frame. Judges will watch the film on a laptop.
- **The phone is the companion**, from the same codebase (a responsive web app). It seals on the phone with the same rules, for the things you have on you: a photo of a letter, a forwarded text. It keeps Brian's mobile look and answers Muse's "mobile-first where a UI is shown" bar without making the phone the main story.
- **The film shows desktop**, with a 10-second "and in your pocket" beat on the phone near the end.

## The closest rival, and how Airlock differs

**Confidant** (github.com/nvmmonsalud/confidant) is in the same track with a similar promise: a personal AI that can prove what it did not send. It is a desktop web app with three panes. A rule-based classifier and a policy router send work to local or cloud tiers; placeholder tokens replace identifiers; a hash-chained ledger records every decision.

Airlock must not read as a copy. It stands on three things Confidant does not do:

| | Confidant | Airlock |
|---|---|---|
| Form | Desktop web app, local Python server | Desktop app with a phone companion from the same code; the gatekeeper runs inside the app on each device |
| Detection | Keyword and PII-shape rules | Rules for secrets and numbers, an on-device name-finding model, and your own "always hold" list |
| Proof | Hash-chained ledger on the same machine | **Two-sided receipts**: the relay that holds the API key signs exactly the bytes it received, and the app checks the signature against what it sent |
| Evidence | Unit and HTTP tests | **A leak test**: Nemotron 3 Ultra plays red team, writing documents that try to smuggle secrets out, and Airlock publishes its leak score per release |

## Screens (see the mockups)

Desktop (`design/desktop-ask.png`, `design/desktop-leak-test.png`) combines these into two windows: **Ask**, with the vault, the conversation and the live receipt side by side; and **Leak test**, with the score table and a caught-live card. The phone shows them as five screens:

1. **Home**: the vault (items stay on the device, each badged with how many secrets it holds), today's seal count, and the leak score.
2. **Ask**: the question, the three airlock chambers lighting up (sealed here, Nemotron reads sealed text, filled in here), and the answer with the real values filled back in.
3. **Receipt**: the exact sealed text that left, what stayed (by type), the relay's signature check, the egress check and the cost.
4. **Caught live**: an email carrying a cloud key, a password and a prompt injection; what was held and why.
5. **Leak test**: the red-team score: secrets leaked, answers still right, over-redactions, cost.

## How it works

1. **Vault, on the device.** Documents and messages are added by drag and drop, paste or file picker on the desktop; on the phone by share sheet, file or photo, with on-device text recognition where the browser allows. Stored in the browser's own storage, never uploaded.
2. **Seal, on the device.** Three layers find what to hold:
   - rules for secrets (cloud keys such as `AKIA`, `sk-`, `ghp_`, private keys, JWTs, passwords after a label or with high entropy), card numbers (Luhn check), Social Security numbers, bank routing numbers (ABA checksum) and account numbers, IBANs (mod-97 check), US phone numbers, emails, driver's license and passport numbers, and dollar amounts;
   - a small name-finding model running in the app (Transformers.js, ONNX, cached after first load) for people, places and organisations;
   - the user's own "always hold" list (family names, an address).

   Local formats plug in as extra rules (the first is Kenyan M-Pesa codes); they stay out of the demo and get one line in the README.

   Each value becomes a consistent token (PERSON_1, AMOUNT_1), so the cloud model can still reason ("PERSON_1 paid PERSON_2 twice"). The token map never leaves the device.
3. **Egress check.** Just before sending, the sealed text is scanned for every original value in the vault, exact and normalised (spaces, case, digits only). Any hit blocks the call.
4. **Relay.** A small server holds the Token Factory key, so the key is never on the device. It receives only sealed text, calls Nemotron, and returns the answer with a signed receipt: SHA-256 of the bytes it received, signed with the relay's key. The app compares that hash with its own.
5. **Think, on Nebius.** Nemotron 3 Super answers by default (thinking off for short answers); Nemotron 3 Ultra handles long or hard questions. Every call goes through Apprentice's shared Token Factory core: published prices, the spend guard and per-call receipts.
6. **Fill in, on the device.** Tokens in the answer are replaced with the real values, and the replacements are shown subtly highlighted.
7. **Web lookups (optional).** With a Tavily key, questions that need fresh facts search the web with the sealed query only.

## The leak test (the centrepiece)

Nemotron 3 Ultra writes adversarial vault items with planted secrets of known type and position:
- keys split across lines, spelled out, or inside code;
- names in signatures, nicknames, misspellings;
- SSNs, card numbers, routing numbers, IBANs and IDs in odd formats (spaced, dotted, spelled out).

It also writes prompt injections that ask the cloud model to reveal originals.

Each item goes through the real seal and egress path, and three things are scored:
- **Leaks:** any planted secret, exact or normalised, in the outbound payload.
- **Over-redaction:** ordinary words held back for no reason.
- **Answers still right:** each item comes with a question; Nemotron 3 Super grades the filled-in answer against the known truth.

The score appears in the app and the README and is re-run for every release. Expected cost: about $0.05 to $0.10 per full test.

## Track tooling

The track names NemoClaw, OpenShell, Hermes Agent and Nebius Serverless as examples, not requirements. The hard requirement is a runtime call to Token Factory and an NVIDIA open model, which Airlock meets with Nemotron. We use the named tools only where they do real work:
- **Stretch: OpenShell around the relay**, with a network policy that allows only Token Factory. It is a genuine fit, because it proves the relay cannot send anywhere else.
- **Not planned:** Hermes Agent and NemoClaw. They would be decoration here.

## Budget

Shared Nebius trial credit left after Apprentice: about $0.68, to cover Airlock, the Pawzoo port and Wind Tunnel. Airlock target: **$0.20 or less** for all development calls, the leak test and the filmed demo. The spend guard from Apprentice enforces it.

## Demo film (under 3 minutes)

Every second shows one of the three differences from Confidant or sets one up. No generic chat, no settings screens. Desktop leads; the phone has its own shot.

| Time | Scene | Difference shown |
|---|---|---|
| 0:00 | Desktop, the vault: "nothing here leaves this computer unsealed" | sets up 1 |
| 0:10 | Caught on the device: the "IT support" email; an API key, a password, a card number and an SSN light up and are held before anything is sent | 1. Sealed on your device |
| 0:35 | The same, on a phone: a photographed bank letter, the routing number and account number held on the phone itself | 1. On every device, including your pocket |
| 0:55 | Ask about the bank email; the sealed text goes out, the answer comes back with the real names filled in (one pass, no lingering) | sets up 2 |
| 1:10 | The receipt: the relay's signature over the exact bytes it received; Airlock hashes what it sent; the two match on screen. Then a tampered byte: the match fails red | 2. Two-sided receipt |
| 1:45 | The leak test: Nemotron 3 Ultra's red-team documents stream through; counters climb; it ends on the leak score | 3. Proof by attack |
| 2:30 | Close: the three differences in one line each, the models, the platform | |

On-screen secrets are ones any judge reads in under a second: API keys, passwords, card numbers, SSNs, routing numbers, IBANs, passport numbers.

## Build plan

Airlock comes after Apprentice and before the Pawzoo port and Wind Tunnel.

| Day | Work |
|---|---|
| Oct 24 | Approve scope and look. Repo, app shell in the approved style, vault storage, rules layer with unit tests |
| Oct 25 | Name-finding model in the app, token map, fill-in, egress check |
| Oct 26 | Relay with signed receipts, Nemotron through the shared core, the Ask and Receipt screens live |
| Oct 27 | Leak test harness and the first live score; Caught Live screen |
| Oct 28 | Polish, desktop and phone checks, README, results, friction log |
| Oct 29 | Film (capture, Eric's narration, render), thumbnails, Devpost text |
| Oct 30 | Buffer and submit by 18:00 EAT |

## Decisions needed from Brian

1. **The look and the differentiation:** approve the desktop mockups and the phone companion (lavender and navy from your samples, with a periwinkle-blue accent), desktop first in the film, and the three differences from Confidant.
2. **Repo:** create an empty public `asiyetajwa/airlock` (this session cannot create repositories).
3. **Budget:** a cap of $0.20 of the remaining trial credit for Airlock.
4. **Tavily:** optional. A free Tavily key enables sealed web lookups and makes Airlock eligible for the Best Use of Tavily bonus.
