# Results

All numbers come from live calls on Nebius Token Factory, recorded in `data/leak-test/`. Times are UTC.

## How the leak test works

1. **The red team writes documents.** Nemotron 3 Ultra writes realistic personal documents (emails, texts, notes, config files, chat logs, forms) built to smuggle secrets past Airlock. Wherever a secret goes, it writes a slot and a disguise: `{{SSN_A|spelled}}`, `{{KEY_B|split}}`, `{{NAME_FIRST_C|lower}}`. Ultra never writes a secret itself.
2. **We plant the secrets.** We fill each slot with an invented secret of known type and position:
   - checksum-valid card, routing and IBAN numbers;
   - SSN-shaped numbers;
   - AWS-, OpenAI- and GitHub-style keys;
   - passwords and US-format phone numbers;
   - people with names.

   Each document is filled five times with different secrets.
3. **Each item goes through the real seal and egress path,** the same code the app runs, and is scored three ways:
   - **Leaked:** any planted secret, exact or reformatted (case, spacing, spelled-out digits), in the outbound text.
   - **Extra holds:** values held that were not planted. Most are real-looking emails and amounts the red team wrote outside its slots.
   - **Answers still right:** Nemotron 3 Super answers the document's question on sealed text. The filled-in answer must contain the planted value the question asks for.

Ultra sometimes used the date-of-birth slot for other dates (key rotation, expiry). Airlock holds dates of birth but leaves ordinary dates alone, so a date slot counts as a secret only when the document marks it as a birth date. From the second run on, the other date slots are reported separately (20 in run 2), not hidden.

## Runs

| Run | Documents | Items | Planted secrets | Held | Answers right | Cost |
|---|---|---|---|---|---|---|
| Dev set (used to build the sealer) | 16 | 48 | 204 | 200 (98.0%) | not a score | $0.074 over many re-runs |
| Scored run 1, 08:41 | 48 | 240 | 1,180 | 1,038 (88.0%) | 195 / 235 (83%) | $0.057 |
| **Scored run 2, 08:49** | 48 new | 240 | 1,170 | **1,083 (92.6%)** | 149 / 209 (71%) | $0.051 |

**Run 1** was scored once on documents the sealer had never seen. Its leaks were mostly:
- names the cased name model misses (lower case, all capitals, "Destiny Washington");
- birth dates spelled out with slashes ("zero seven / two eight / one nine nine seven");
- lower-case AWS keys;
- one password pattern.

After run 1, its documents became development material, and we added:
- public US name lists (2010 Census surnames, US baby names), with words like "will" and "grace" marked ambiguous;
- spelled digits that keep their separators;
- any held number held again in any other format;
- stricter chat-speaker detection.

Run 1 used the original scoring, which counted every date slot as a birth date.

**Run 2** is fresh: 48 new documents from Ultra. Because the name lists would flatter a test whose people all have common names, half the people in run 2 have rarer names (Saoirse, Oluwaseun, Quackenbush, Szczepanski) that are on no list Airlock uses. Run 2 was scored once.

| Run 2 by attack type | Held | Answers right |
|---|---|---|
| Keys and passwords | 225 / 230 | 29 / 60 |
| Names and addresses | 333 / 390 | 38 / 45 |
| Numbers | 366 / 390 | 40 / 55 |
| Prompt injections | 159 / 160 | 42 / 49 |

**What leaked in run 2 (87):**
- first names alone (50), mostly the rarer names in lower case;
- SSNs (10);
- full names (6);
- addresses in capitals (5);
- unlabelled licenses (5);
- surnames (5);
- account numbers (3);
- keys (2);
- a password (1).

**Extra holds:** 60. One item was blocked by the egress check: a value the sealer held elsewhere in the same document slipped through in another form, so nothing was sent.

**Answers right** were lower in run 2 (71%). The keys category asks questions such as "which secret is rotated quarterly", where the model has to name a token among several and our check requires the exact value.

**After run 2:** reading its leaks turned up two plain bugs:
- a sentence-ending period stopped the long-number rule;
- a curly apostrophe in "Driver’s license" stopped the license label.

Both are fixed in the app. On run 2's documents the fixed sealer leaks 74 instead of 87, but that is not an independent score, so the published number stays 87.

## Known limits

- Lower-case first names in running text ("bring logan") are found only when the name is on a list or appears elsewhere in a held form.
- A secret in a format no rule covers and with no label can leak; the egress check only knows values something has already found.
- The name model is English and cased.

## Spend

Airlock's development, both scored runs and the filmed demo stay inside a $0.20 cap enforced by the spend guard. At the end of run 2 the ledger stood at **$0.182**:
- Nemotron 3 Ultra red team: $0.069 (32 calls: dev and both runs);
- Nemotron 3 Super: $0.113 (961 calls: every leak-test answer, including dev re-runs, and the app trials).

Each live question in the app costs about $0.0002.
