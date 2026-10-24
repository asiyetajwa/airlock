// Sealing: find what to hold (rules, names, the user's own list), give each value a consistent token, and
// produce the sealed text that is the only thing allowed to leave the device. Filling in reverses it locally.

import { ruleSpans, type Kind, type Span } from './rules.js';

export interface Held extends Span {
  token: string;
  value: string;
}

export interface TokenEntry {
  token: string;
  kind: Kind;
  /** The value as first seen; fill-in writes this back. */
  value: string;
}

export interface Sealed {
  original: string;
  sealed: string;
  held: Held[];
}

export interface SealOptions {
  /** People's names found by the on-device model, per text (same order as the texts). */
  names?: Array<Array<{ start: number; end: number }>>;
  /** The user's "always hold" list: family names, an address, a project codename. */
  alwaysHold?: string[];
  /** Values already held elsewhere in the vault: held here too, with their kind. */
  known?: Array<{ kind: Kind; value: string }>;
}

const PREFIX: Record<Kind, string> = {
  KEY: 'KEY', PRIVATE_KEY: 'PRIVATE_KEY', PASSWORD: 'PASSWORD', CARD: 'CARD', SSN: 'SSN', ROUTING: 'ROUTING', ACCOUNT: 'ACCOUNT',
  IBAN: 'IBAN', PHONE: 'PHONE', EMAIL: 'EMAIL', PASSPORT: 'PASSPORT', LICENSE: 'LICENSE', AMOUNT: 'AMOUNT', ADDRESS: 'ADDRESS',
  DATE_OF_BIRTH: 'BIRTHDATE', ID: 'ID', PERSON: 'PERSON', HELD: 'HELD',
};

/** Higher wins when two finds overlap. Secrets beat numbers beat names beat amounts. */
const RANK: Record<Kind, number> = {
  PRIVATE_KEY: 9, KEY: 8, PASSWORD: 8, CARD: 7, SSN: 7, IBAN: 7, ROUTING: 6, PASSPORT: 6, LICENSE: 6, ACCOUNT: 5, ID: 5,
  DATE_OF_BIRTH: 5, EMAIL: 4, PHONE: 4, HELD: 4, ADDRESS: 3, PERSON: 3, AMOUNT: 2,
};

const DIGIT_KINDS = new Set<Kind>(['CARD', 'SSN', 'ROUTING', 'ACCOUNT', 'PHONE', 'AMOUNT', 'DATE_OF_BIRTH', 'ID', 'PASSPORT']);
const SPELLED: Record<string, string> = { zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };

/** The form two values are compared in: digits only for numbers (spelled digits too), letters and digits in lower case otherwise. */
export function normalise(value: string, kind?: Kind): string {
  if (kind && DIGIT_KINDS.has(kind)) {
    const d = value.replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gi, (w) => SPELLED[w.toLowerCase()] ?? w).replace(/\D/g, '');
    if (d) return d;
  }
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Resolve overlaps: when two finds overlap, keep one span covering both, with the higher-ranked kind. */
function merge(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start < last.end) {
      if (RANK[s.kind] > RANK[last.kind] || (RANK[s.kind] === RANK[last.kind] && s.end - s.start > last.end - last.start)) {
        last.kind = s.kind;
        last.why = s.why;
        last.source = s.source;
      }
      last.end = Math.max(last.end, s.end);
      continue;
    }
    out.push({ ...s });
  }
  return out;
}

/** Every occurrence of a known value in a text, matched on word boundaries, ignoring case. */
function occurrences(text: string, value: string): Array<[number, number]> {
  const v = value.trim();
  if (v.length < 3) return [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(v).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu');
  return [...text.matchAll(re)].map((m) => [m.index, m.index + m[0].length]);
}

/** A token map shared by everything sealed in one request, so PERSON_1 means the same person everywhere. */
export class TokenMap {
  private byKey = new Map<string, TokenEntry>();
  private counters = new Map<Kind, number>();

  tokenFor(kind: Kind, value: string, alias?: string): string {
    const key = `${kind}:${normalise(alias ?? value, kind)}`;
    const found = this.byKey.get(key);
    if (found) return found.token;
    const n = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, n);
    const entry: TokenEntry = { token: `${PREFIX[kind]}_${String(n)}`, kind, value };
    this.byKey.set(key, entry);
    return entry.token;
  }

  /** A name part ("Megan") shares its full name's token. */
  alias(kind: Kind, part: string, token: string): void {
    const key = `${kind}:${normalise(part, kind)}`;
    if (!this.byKey.has(key)) {
      const entry = [...this.byKey.values()].find((e) => e.token === token);
      if (entry) this.byKey.set(key, entry);
    }
  }

  entries(): TokenEntry[] {
    const seen = new Set<string>();
    return [...this.byKey.values()].filter((e) => (seen.has(e.token) ? false : (seen.add(e.token), true)));
  }

  /** Every value this map holds, for the egress check. */
  values(): Array<{ kind: Kind; value: string }> {
    return this.entries().map((e) => ({ kind: e.kind, value: e.value }));
  }

  lookup(token: string): TokenEntry | undefined {
    return this.entries().find((e) => e.token === token);
  }
}

/**
 * Seal several texts together (a question and the vault items it needs). Finds in one text are held in every text,
 * so a name the model spotted in an email is also held where it appears in the lease.
 */
export function sealAll(texts: string[], opts: SealOptions = {}, map = new TokenMap()): { sealed: Sealed[]; map: TokenMap } {
  const found: Span[][] = texts.map((t, i) => {
    const spans = ruleSpans(t);
    for (const n of opts.names?.[i] ?? []) spans.push({ start: n.start, end: n.end, kind: 'PERSON', why: 'name, on-device model', source: 'names' });
    for (const v of opts.alwaysHold ?? []) for (const [s, e] of occurrences(t, v)) spans.push({ start: s, end: e, kind: 'HELD', why: 'on your always-hold list', source: 'list' });
    return merge(spans);
  });

  // Values found anywhere are held everywhere; a person's first and last names are held on their own too.
  const known = new Map<string, { kind: Kind; value: string }>();
  for (const k of opts.known ?? []) known.set(`${k.kind}:${normalise(k.value, k.kind)}`, k);
  found.forEach((spans, i) => {
    for (const s of spans) {
      const value = texts[i]?.slice(s.start, s.end) ?? '';
      known.set(`${s.kind}:${normalise(value, s.kind)}`, { kind: s.kind, value });
    }
  });
  const parts: Array<{ part: string; full: string }> = [];
  for (const k of known.values()) {
    if (k.kind !== 'PERSON') continue;
    for (const p of k.value.split(/[\s\-]+/)) if (p.length >= 3 && /^\p{Lu}/u.test(p)) parts.push({ part: p, full: k.value });
  }

  const sealed: Sealed[] = texts.map((text, i) => {
    const spans: Span[] = [...(found[i] ?? [])];
    const digitValues = new Map<string, Kind>();
    for (const k of known.values()) {
      if (k.kind === 'AMOUNT') continue;
      for (const [s, e] of occurrences(text, k.value)) spans.push({ start: s, end: e, kind: k.kind, why: 'held elsewhere in your vault', source: 'list' });
      const d = normalise(k.value, k.kind);
      if (DIGIT_KINDS.has(k.kind) && /^\d{6,}$/.test(d)) digitValues.set(d, k.kind);
    }
    // The same number written another way ("07/28/1997" and "zero seven / two eight / ...") is held too.
    if (digitValues.size) {
      for (const m of text.matchAll(/\d[\d\s.\-\/()]*\d/g)) {
        const kind = digitValues.get(m[0].replace(/\D/g, ''));
        if (kind) spans.push({ start: m.index, end: m.index + m[0].length, kind, why: 'held elsewhere in your vault', source: 'list' });
      }
    }
    for (const p of parts) {
      // Longer name parts are matched in any case ("megan"); short ones only as written, to spare ordinary words.
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(p.part)}(?![\\p{L}\\p{N}])`, p.part.length >= 4 ? 'giu' : 'gu');
      for (const m of text.matchAll(re)) spans.push({ start: m.index, end: m.index + m[0].length, kind: 'PERSON', why: 'part of a held name', source: 'names' });
    }
    const merged = merge(spans);
    const held: Held[] = [];
    let out = '';
    let cur = 0;
    for (const s of merged) {
      const value = text.slice(s.start, s.end);
      const full = s.kind === 'PERSON' ? parts.find((p) => normalise(p.part) === normalise(value) && normalise(p.full) !== normalise(value))?.full : undefined;
      const token = full ? map.tokenFor('PERSON', full) : map.tokenFor(s.kind, value);
      if (full) map.alias('PERSON', value, token);
      out += text.slice(cur, s.start) + token;
      cur = s.end;
      held.push({ ...s, token, value });
    }
    out += text.slice(cur);
    return { original: text, sealed: out, held };
  });
  return { sealed, map };
}

export interface FilledPart {
  text: string;
  /** Set when this part was filled in from a token. */
  token?: string;
}

/** Put the real values back into an answer, on the device. Unknown tokens are left as they are. */
export function fillIn(answer: string, map: TokenMap): FilledPart[] {
  const parts: FilledPart[] = [];
  let cur = 0;
  for (const m of answer.matchAll(/\b(?:[A-Z]+_)+\d+\b/g)) {
    const entry = map.lookup(m[0]);
    if (!entry) continue;
    if (m.index > cur) parts.push({ text: answer.slice(cur, m.index) });
    parts.push({ text: entry.value, token: entry.token });
    cur = m.index + m[0].length;
  }
  if (cur < answer.length) parts.push({ text: answer.slice(cur) });
  return parts;
}
