import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { checkReceipt, sha256Hex, statement, type Receipt } from '../src/seal/index.js';

test('a receipt verifies, and one changed byte fails it', () => {
  const secret = ed25519.utils.randomSecretKey();
  const body = JSON.stringify({ sealed: 'PERSON_1 sent AMOUNT_1' });
  const answer = 'You sent AMOUNT_1 to PERSON_1.';
  const base = { id: 'r1', at: '2026-10-24T12:00:00Z', model: 'm', requestSha256: sha256Hex(body), responseSha256: sha256Hex(answer), requestBytes: utf8ToBytes(body).length };
  const r: Receipt = { ...base, tokensIn: 1, tokensOut: 1, costUsd: 0, publicKey: bytesToHex(ed25519.getPublicKey(secret)), signature: bytesToHex(ed25519.sign(utf8ToBytes(statement(base)), secret)) };
  assert.ok(checkReceipt(r, body, answer).ok);
  const tampered = body.replace('AMOUNT_1', 'AMOUNT_2');
  const c = checkReceipt(r, tampered, answer);
  assert.ok(!c.ok && !c.requestMatches && c.signatureValid);
  assert.ok(!checkReceipt({ ...r, requestSha256: sha256Hex(tampered) }, tampered, answer).signatureValid);
});
