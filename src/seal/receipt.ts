// Two-sided receipts. The relay signs a statement about exactly the bytes it received and the bytes it returned;
// the app hashes what it sent and what came back and checks both against the signed statement.

import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export interface Receipt {
  id: string;
  at: string;
  model: string;
  requestSha256: string;
  responseSha256: string;
  requestBytes: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  /** Ed25519 signature over statement(receipt), hex. */
  signature: string;
  /** The relay's Ed25519 public key, hex. Its fingerprint is published in the README. */
  publicKey: string;
}

export const sha256Hex = (s: string): string => bytesToHex(sha256(utf8ToBytes(s)));

/** The exact text the relay signs. Cost and token counts are reported but not part of the signed statement. */
export function statement(r: Pick<Receipt, 'id' | 'at' | 'model' | 'requestSha256' | 'responseSha256' | 'requestBytes'>): string {
  return ['airlock-receipt-v1', r.id, r.at, r.model, r.requestSha256, r.responseSha256, String(r.requestBytes)].join('\n');
}

export const fingerprint = (publicKeyHex: string): string => sha256Hex(publicKeyHex).slice(0, 16).replace(/(.{4})(?!$)/g, '$1 ');

export interface ReceiptCheck {
  signatureValid: boolean;
  requestMatches: boolean;
  responseMatches: boolean;
  ok: boolean;
}

/** The app's side: hash what it sent and what it got, then check the relay's signature over the statement. */
export function checkReceipt(r: Receipt, sentBody: string, receivedAnswer: string, trustedKey?: string): ReceiptCheck {
  const requestMatches = sha256Hex(sentBody) === r.requestSha256 && utf8ToBytes(sentBody).length === r.requestBytes;
  const responseMatches = sha256Hex(receivedAnswer) === r.responseSha256;
  let signatureValid = false;
  try {
    const keyOk = !trustedKey || trustedKey === r.publicKey;
    signatureValid = keyOk && ed25519.verify(hexToBytes(r.signature), utf8ToBytes(statement(r)), hexToBytes(r.publicKey));
  } catch {
    signatureValid = false;
  }
  return { signatureValid, requestMatches, responseMatches, ok: signatureValid && requestMatches && responseMatches };
}
