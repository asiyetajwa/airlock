// Airlock film: scene order, voiceover lines and minimum on-screen time. Every scene shows one of the three
// differences or sets one up: sealed on your device (desktop, then phone), the two-sided receipt, and the leak score.
// The screens are stills of the real app (scripts/capture.mjs); the question is answered live by Nemotron 3 Super on
// Nebius Token Factory, and the leak test numbers are scored run 2 (docs/RESULTS.md). Voiceover: npm run voiceover
// Written for the ear: numbers as words. <break time="0.4s" /> is an ElevenLabs pause tag.

export type SceneId = 'intro' | 'vault' | 'caught' | 'phone' | 'ask' | 'receipt' | 'leak' | 'score' | 'outro';

export type SceneSpec = {
  id: SceneId;
  voiceover: string;
  /** Length in seconds the choreography needs; audio can only extend it. */
  minSeconds: number;
  /** A sound after the line (public/sfx, made with ElevenLabs Sound Effects). */
  after?: { file: string; gap: number; seconds: number; volume: number };
};

export const SCENES: SceneSpec[] = [
  { id: 'intro', voiceover: 'This is Airlock. Ask an AI about your private life, and keep your secrets on your own computer.', minSeconds: 5.4 },
  { id: 'vault', voiceover: 'Your vault stays here: a bank email, a lease, a tax return, a Wi-Fi note. The badges count what Airlock will hold back from each one.', minSeconds: 7.0 },
  { id: 'caught', voiceover: 'Open the IT support email. The access key, the password, and a hidden instruction to the AI are caught right here, before anything is sent. And this is all that would leave.', minSeconds: 10.0 },
  { id: 'phone', voiceover: 'The same gatekeeper runs on your phone. Paste a text with a routing number and an account number, and both are sealed on the phone itself.', minSeconds: 8.6 },
  { id: 'ask', voiceover: 'Now ask about the bank email. Names, amounts and account numbers become tokens. NVIDIA Nemotron 3 Super, on Nebius Token Factory, reads only the sealed text. The real values are filled back in here, and it spots the phishing.', minSeconds: 13.0 },
  { id: 'receipt', voiceover: 'Every answer comes with a receipt. The relay that holds the API key signs the exact bytes it received, and Airlock checks that signature against what it sent. Change a single byte, and the check fails.', minSeconds: 11.0 },
  { id: 'leak', voiceover: 'Then we attacked it. Nemotron 3 Ultra wrote forty-eight documents built to smuggle secrets out: keys split across lines, numbers spelled out, names in lower case, and prompt injections.', minSeconds: 10.0 },
  { id: 'score', voiceover: 'Airlock held one thousand and eighty-three of eleven hundred and seventy planted secrets. Eighty-seven got through, mostly rare first names in lower case, and we publish every one. The whole test cost five cents.', minSeconds: 10.0 },
  { id: 'outro', voiceover: 'Airlock. <break time="0.4s" /> Your secrets stay home. The thinking still gets done.', minSeconds: 5.6, after: { file: 'sfx/chime.mp3', gap: 0.3, seconds: 1.4, volume: 0.35 } },
];
