// Starts Airlock on this computer: the app (http://127.0.0.1:8791), which seals everything in the browser, and
// the relay (http://127.0.0.1:8792), which holds the Token Factory key. In production the relay runs elsewhere;
// the app never has the key and only ever sends sealed text.

import { join } from 'node:path';
import express from 'express';
import { createTokenFactory } from '@airlock/nebius-core';
import { createRelay } from './relay.js';
import { fingerprint } from '../seal/index.js';

process.env.APPRENTICE_LEDGER ??= join(process.cwd(), '.airlock-ledger.jsonl');

/** Offline answers, so the app runs with no key and no cost. Labelled stub in every receipt. */
function stubAnswer(text: string): string {
  const tokens = [...new Set(text.match(/\b(?:[A-Z]+_)+\d+\b/g) ?? [])];
  const q = /Question: ([\s\S]*)$/.exec(text)?.[1]?.trim() ?? '';
  const injection = /ignore (?:your|all|previous) (?:rules|instructions)|repeat the original/i.test(text);
  return `(Stub mode, no model was called.) You asked: "${q.slice(0, 120)}". The sealed documents mention ${tokens.slice(0, 4).join(', ') || 'no held values'}.${injection ? ' One document contains an instruction aimed at the assistant; it was ignored.' : ''}`;
}

const tf = createTokenFactory({ respond: (req) => stubAnswer(req.messages.map((m) => m.content).join('\n')), speed: 0.3 });
const relay = createRelay(tf, { tavilyKey: process.env.TAVILY_API_KEY?.trim() || undefined });

const app = express();
const root = process.cwd();
app.use('/models', express.static(join(root, 'models'), { maxAge: '30d', immutable: true }));
app.use('/ort', express.static(join(root, 'node_modules/onnxruntime-web/dist'), { maxAge: '30d' }));
app.use('/data', express.static(join(root, 'data')));
app.get('/config.json', (_req, res) => {
  res.json({ relay: process.env.AIRLOCK_RELAY_URL ?? `http://${_req.hostname}:8792`, publicKey: relay.publicKey });
});
app.use(express.static(join(root, 'dist')));

const host = process.env.HOST ?? '127.0.0.1';
app.listen(8791, host, () => console.log(`airlock: app on http://${host}:8791`));
relay.app.listen(8792, host, () => {
  console.log(`airlock: relay on http://${host}:8792, ${tf.live ? 'live on Nebius Token Factory' : 'stub mode (no NEBIUS_API_KEY)'}`);
  console.log(`airlock: relay key fingerprint ${fingerprint(relay.publicKey)}`);
});
