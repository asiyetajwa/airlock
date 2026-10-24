// The egress check: the last step before anything leaves the device. The outbound payload is scanned for every
// value the vault holds, as written and in a normalised form (case, spacing, digits only). Any hit blocks the call.
// It catches what the sealer knew about and let slip; it cannot know about a secret nothing ever found.

import type { Kind } from './rules.js';
import { normalise } from './seal.js';

export interface EgressHit {
  kind: Kind;
  value: string;
  how: 'exact' | 'normalised';
}

export function egressCheck(payload: string, values: Array<{ kind: Kind; value: string }>): EgressHit[] {
  const lower = payload.toLowerCase();
  const letters = normalise(payload);
  const digits = payload.replace(/\D/g, '');
  const hits: EgressHit[] = [];
  const seen = new Set<string>();
  for (const { kind, value } of values) {
    const v = value.trim();
    if (v.length < 3 || seen.has(`${kind}:${v}`)) continue;
    seen.add(`${kind}:${v}`);
    if (lower.includes(v.toLowerCase())) {
      hits.push({ kind, value: v, how: 'exact' });
      continue;
    }
    const n = normalise(v, kind);
    // Short or amount-like values would match by accident in a normalised scan; they are only checked exactly.
    if (kind === 'AMOUNT' || n.length < 6) continue;
    const pool = /^\d+$/.test(n) ? digits : letters;
    if (pool.includes(n)) hits.push({ kind, value: v, how: 'normalised' });
  }
  return hits;
}
