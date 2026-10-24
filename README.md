# Airlock

A personal assistant for your own documents and messages that seals every secret on your device before anything reaches the cloud, shows you a receipt of exactly what left, and proves it with a leak test.

Airlock is a desktop app with a phone companion built from the same code. Your vault (bank emails, a lease, a tax return, a Wi-Fi note) stays on your device. When you ask a question:
1. Airlock replaces names, numbers and keys with tokens on the device.
2. NVIDIA Nemotron on Nebius Token Factory reasons over the sealed text.
3. The real values are filled back in on the device.

## What makes it different

- **Sealed on your device, desktop and phone.** Three layers find what to hold:
  - rules for secrets and numbers, with checksums (Luhn, ABA routing, IBAN mod-97) and views that undo hiding tricks: digits spelled out, characters spaced apart, keys split across lines, numbers regrouped with dots or dashes;
  - an on-device name finder (BERT NER via Transformers.js, served from your own computer) plus public US name lists;
  - your own "always hold" list.

  Each value becomes a consistent token (PERSON_1, ACCOUNT_1), so the model can still reason about it.

  An **egress check** scans every outbound byte for every value your vault holds, as written and normalised, and blocks the call on any hit.
- **Two-sided receipts.** The relay that holds the API key signs (Ed25519) the SHA-256 of exactly the bytes it received and the answer it returned. The app hashes what it sent and what came back and checks the signature. The app can also change one byte of what it sent and show the check fail. A log that a system keeps about itself cannot do that.
- **Proof by attack.** Nemotron 3 Ultra plays red team: it writes documents designed to smuggle secrets out. We plant invented secrets of known type and position and publish the score, including the misses.

## Leak test results

The second scored run: 48 new documents written by Nemotron 3 Ultra, each filled with 5 sets of invented secrets (240 items, 1,170 planted secrets). Half the people in it have rarer names that are on no list Airlock uses.

| | Held | Answers still right |
|---|---|---|
| Keys and passwords | 225 / 230 | 29 / 60 |
| Names and addresses | 333 / 390 | 38 / 45 |
| Numbers (SSNs, cards, routing, accounts, IBANs, passports, licenses) | 366 / 390 | 40 / 55 |
| Prompt injections | 159 / 160 | 42 / 49 |
| **All** | **1,083 / 1,170 (92.6%)** | **149 / 209 (71%)** |

- **What leaked:** 87 planted secrets reached the outbound text. Most were rare first names written in lower case ("caoimhe", "anouk"), which neither the cased name model nor the name lists catch. The rest were SSNs and licenses in unlabelled odd formats.
- **Cost:** the whole run cost $0.051 on Token Factory.
- **First run, older sealer:** 1,038 / 1,180 (88.0%). Every run, and what changed between them, is in [`docs/RESULTS.md`](docs/RESULTS.md).

The score is a measurement, not a promise: a secret format nobody wrote a rule for, or a name nothing recognises, can still leak, and the leak test exists to find those.

## Run it

```bash
npm install
npm run model        # downloads the name-finding model (105 MB) into models/, once
npm start            # app on http://127.0.0.1:8791, relay on http://127.0.0.1:8792
npm test
```

**Without a key:** without `NEBIUS_API_KEY`, the relay runs in stub mode, so everything except the model's answer works offline.

**Live:** for live answers, put `NEBIUS_API_KEY` and a spend cap `APPRENTICE_BUDGET_USD` in `.env`. Optionally add `TAVILY_API_KEY`: the globe button then searches the web with the sealed question only.

**Phone:** the app is responsive and installable. On a phone it becomes the companion: one screen at a time, sealing on the phone itself.

**Leak test:** `npm run leak-test -- dev` writes and scores a small development set. `-- test2` is the scored set. `--free` re-scores cached documents with no paid calls.

## How it is built

- `src/seal`: the sealer. Pure TypeScript that runs unchanged in the browser, on a phone and in Node:
  - `rules.ts`: shapes, checksums and the views that undo hiding tricks;
  - `names.ts`: the name model, aligned back to character offsets;
  - `names-data.ts`: US name lists, built by `scripts/build-names.mjs` from the 2010 Census surnames and US baby names;
  - `seal.ts`: the token map, propagation across the vault, and fill-in;
  - `egress.ts`: the check that blocks an outbound call;
  - `receipt.ts`: receipt verification.
- `src/server/relay.ts`: the only part that talks to the cloud. It holds the Token Factory key, refuses a payload in which its own rules still see a raw secret, calls Nemotron 3 Super (Ultra for long context), and signs the receipt.
- `src/web`: the app. The vault lives in the browser's own storage.
- `packages/nebius-core`: the shared Token Factory client and spend guard from [Apprentice](https://github.com/asiyetajwa/apprentice). Every call is priced from Token Factory's published prices, reserved before it is sent, and refused past the cap.
- `scripts/leak-test.ts`: the red team and the scoring.

## What the receipt does and does not prove

The relay is our own code, so its signature proves exactly which bytes the relay received and which answer it returned. The app checks that against what it sent, so any change to the bytes on the way, or a relay that signed something other than what it received, would show as a mismatch. It does not prove what happens after the relay. Publishing the relay's code and its key fingerprint (shown in the app) lets anyone check that the relay forwards only what it signs.

## License

MIT
