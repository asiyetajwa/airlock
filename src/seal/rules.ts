// The rules layer: secrets, numbers and labelled values that can be recognised by their shape.
// Each rule runs on the text as written and on "views" of it that undo common hiding tricks
// (digits spelled out, characters spaced apart, a key split across lines), then maps matches
// back to the original text. Pure TypeScript: the same code runs in the browser, on a phone and in Node.

export type Kind =
  | 'KEY' | 'PRIVATE_KEY' | 'PASSWORD' | 'CARD' | 'SSN' | 'ROUTING' | 'ACCOUNT' | 'IBAN'
  | 'PHONE' | 'EMAIL' | 'PASSPORT' | 'LICENSE' | 'AMOUNT' | 'ADDRESS' | 'DATE_OF_BIRTH' | 'ID' | 'PERSON' | 'HELD';

export interface Span {
  start: number;
  end: number;
  kind: Kind;
  /** Why it was held, in a few words, for the "why it was held" list. */
  why: string;
  source: 'rule' | 'names' | 'list';
}

/** A transformed copy of the text, with map[i] = index in the original of view character i. */
interface View {
  text: string;
  map: number[];
  /** mapEnd[i] = index just past the original characters view character i came from. */
  mapEnd: number[];
}

const identity = (text: string): View => ({ text, map: Array.from({ length: text.length }, (_, i) => i), mapEnd: Array.from({ length: text.length }, (_, i) => i + 1) });

const ends = (map: number[]): number[] => map.map((i) => i + 1);

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

/** "four one one seven" -> "4117": runs of four or more spelled digits become digits. */
function spelledDigits(text: string): View | null {
  const re = /\b(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)(?:[\s,\-]+(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)){3,}\b/gi;
  if (!re.test(text)) return null;
  re.lastIndex = 0;
  let out = '';
  const map: number[] = [];
  const mapEnd: number[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    for (let i = last; i < m.index; i++) { out += text[i]; map.push(i); mapEnd.push(i + 1); }
    for (const w of m[0].matchAll(/[a-z]+/gi)) {
      out += NUMBER_WORDS[w[0].toLowerCase()] ?? '';
      map.push(m.index + w.index);
      mapEnd.push(m.index + w.index + w[0].length);
    }
    last = m.index + m[0].length;
  }
  for (let i = last; i < text.length; i++) { out += text[i]; map.push(i); mapEnd.push(i + 1); }
  return { text: out, map, mapEnd };
}

/** "A K I A 4 Q X 7" -> "AKIA4QX7": runs of eight or more single characters separated by single spaces or dots. */
function despaced(text: string): View | null {
  const re = /(?<![A-Za-z0-9])[A-Za-z0-9](?:[ .\-_][A-Za-z0-9](?![A-Za-z0-9])){7,}/g;
  if (!re.test(text)) return null;
  re.lastIndex = 0;
  let out = '';
  const map: number[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    for (let i = last; i < m.index; i++) { out += text[i]; map.push(i); }
    for (let i = 0; i < m[0].length; i++) if (/[A-Za-z0-9]/.test(m[0][i] ?? '')) { out += m[0][i]; map.push(m.index + i); }
    last = m.index + m[0].length;
  }
  for (let i = last; i < text.length; i++) { out += text[i]; map.push(i); }
  return { text: out, map, mapEnd: ends(map) };
}

const KEYISH = /[A-Za-z0-9_+/=\-]/;

/** A key broken over lines: join a line break when both sides are long key-like runs. */
function lineJoined(text: string): View | null {
  const re = /([A-Za-z0-9_+/=\-]{6,})[ \t]*\r?\n[ \t>]*([A-Za-z0-9_+/=\-]{4,})/g;
  if (!re.test(text)) return null;
  re.lastIndex = 0;
  const drop = new Set<number>();
  for (const m of text.matchAll(re)) {
    const a = m[1] ?? '';
    const b = m[2] ?? '';
    // Only fragments that look like machine strings (digits mixed with letters, or a known key prefix).
    if (!(/\d/.test(a) && /[A-Za-z]/.test(a)) && !KEY_PREFIX.test(a)) continue;
    if (!/\d/.test(b) && !/^[A-Z0-9]+$/.test(b)) continue;
    for (let i = m.index + a.length; i < m.index + m[0].length - b.length; i++) drop.add(i);
  }
  if (!drop.size) return null;
  let out = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) if (!drop.has(i)) { out += text[i]; map.push(i); }
  return { text: out, map, mapEnd: ends(map) };
}

const KEY_PREFIX = /^(?:AKIA|ASIA|sk-|sk_live_|sk_test_|rk_live_|ghp_|gho_|ghs_|github_pat_|glpat-|xox[abpr]-|AIza|tvly-|hf_|pk_live_)/;

export function luhn(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

/** ABA routing number checksum: 3(d1+d4+d7) + 7(d2+d5+d8) + (d3+d6+d9) is a multiple of 10. */
export function abaValid(d: string): boolean {
  if (!/^\d{9}$/.test(d)) return false;
  const n = [...d].map(Number) as [number, number, number, number, number, number, number, number, number];
  const sum = 3 * (n[0] + n[3] + n[6]) + 7 * (n[1] + n[4] + n[7]) + (n[2] + n[5] + n[8]);
  return sum % 10 === 0 && sum > 0;
}

export function ibanValid(raw: string): boolean {
  const s = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const c of v) rem = (rem * 10 + Number(c)) % 97;
  }
  return rem === 1;
}

function ssnPlausible(d: string): boolean {
  if (!/^\d{9}$/.test(d)) return false;
  const area = d.slice(0, 3);
  return area !== '000' && area !== '666' && area[0] !== '9' && d.slice(3, 5) !== '00' && d.slice(5) !== '0000';
}

function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
}

/** A string a person would not type as a word: long, mixed character classes, high entropy. */
export function machineString(s: string): boolean {
  if (s.length < 16) return false;
  if (/^https?:/i.test(s) || /^[a-z]+(?:[-_][a-z]+)+$/i.test(s)) return false;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[_+/=\-]/].filter((r) => r.test(s)).length;
  return classes >= 3 && entropy(s) >= 3.5;
}

type Found = { start: number; end: number; kind: Kind; why: string };

const labelled = (label: string, value: string) => new RegExp(`\\b(?:${label})\\b[^\\S\\n]*(?:#|no\\.?|number|is|was|:|=|-|\\s)*[^\\S\\n]*["'“‘]?${value}`, 'gi');

/** Every rule, as a function from text to matches. Order matters only for overlaps: earlier wins on ties. */
const RULES: Array<(t: string) => Found[]> = [
  (t) => [...t.matchAll(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g)].map((m) => ({ start: m.index, end: m.index + m[0].length, kind: 'PRIVATE_KEY', why: 'private key block' })),
  (t) => [...t.matchAll(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g)].map((m) => ({ start: m.index, end: m.index + m[0].length, kind: 'KEY', why: 'cloud access key, AKIA prefix' })),
  (t) => [...t.matchAll(/(?<![A-Za-z0-9])(?:sk-(?:proj-|ant-)?|sk_live_|sk_test_|rk_live_|pk_live_|ghp_|gho_|ghs_|github_pat_|glpat-|xox[abpr]-|AIza|tvly-|hf_)[A-Za-z0-9_\-]{12,}/g)].map((m) => ({ start: m.index, end: m.index + m[0].length, kind: 'KEY', why: 'API key, known prefix' })),
  (t) => [...t.matchAll(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g)].map((m) => ({ start: m.index, end: m.index + m[0].length, kind: 'KEY', why: 'signed token (JWT)' })),
  // A labelled password, passcode, PIN or Wi-Fi key: the value runs to the next whitespace.
  (t) => [...t.matchAll(labelled('pass(?:word|code|phrase)?|pwd|pin|wi-?fi(?: password| key)?|network key|login', '(?<v>[^\\s"\'`]{4,64})'))].flatMap((m) => {
    const v = (m.groups?.v ?? '').replace(/[.,;:!?)\]"'”’]+$/, '');
    if (!v || /^(?:is|was|the|your|for|to|and|reset|below|above|here|change|changed|number|password|passcode|key|pin|code|manager|protected|required|expired|expires|policy|hint)$/i.test(v)) return [];
    if (/^\d+$/.test(v) && v.length > 8) return [];
    const start = (m.index ?? 0) + m[0].length - (m.groups?.v ?? '').length;
    return [{ start, end: start + v.length, kind: 'PASSWORD' as Kind, why: 'labelled password' }];
  }),
  // A labelled key, token or secret that is a machine string.
  (t) => [...t.matchAll(labelled('api[ _-]?key|access[ _-]?key|secret(?:[ _-]?key)?|token|key', '(?<v>[A-Za-z0-9_+/=\\-]{16,})'))].flatMap((m) => {
    const v = m.groups?.v ?? '';
    if (!machineString(v)) return [];
    const start = (m.index ?? 0) + m[0].length - v.length;
    return [{ start, end: start + v.length, kind: 'KEY' as Kind, why: 'labelled secret' }];
  }),
  (t) => [...t.matchAll(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g)].filter((m) => ibanValid(m[0])).map((m) => ({ start: m.index, end: m.index + m[0].length, kind: 'IBAN', why: 'IBAN, mod-97 check' })),
  (t) => [...t.matchAll(/(?<![\d-])\d(?:[ \-.]?\d){12,18}(?![\d-])/g)].filter((m) => luhn(m[0].replace(/\D/g, ''))).map((m) => ({ start: m.index, end: m.index + m[0].length, kind: 'CARD', why: 'card number, Luhn check' })),
  (t) => [...t.matchAll(/(?<![\d-])\d{3}([ \-.])\d{2}\1\d{4}(?![\d-])/g)].filter((m) => ssnPlausible(m[0].replace(/\D/g, ''))).map((m) => ({ start: m.index, end: m.index + m[0].length, kind: 'SSN', why: 'Social Security number shape' })),
  (t) => [...t.matchAll(labelled('ssn|social security(?: number| no\\.?)?|social', '(?<v>\\d{3}[ \\-.]?\\d{2}[ \\-.]?\\d{4})'))].map((m) => {
    const v = m.groups?.v ?? '';
    const start = (m.index ?? 0) + m[0].length - v.length;
    return { start, end: start + v.length, kind: 'SSN' as Kind, why: 'labelled Social Security number' };
  }),
  (t) => [...t.matchAll(labelled('routing(?: number| no\\.?| #)?|aba|rtn', '(?<v>\\d{9})'))].map((m) => {
    const v = m.groups?.v ?? '';
    const start = (m.index ?? 0) + m[0].length - v.length;
    return { start, end: start + v.length, kind: 'ROUTING' as Kind, why: 'labelled routing number' };
  }),
  (t) => [...t.matchAll(/(?<![\d-])\d{9}(?![\d-])/g)].filter((m) => abaValid(m[0])).map((m) => ({ start: m.index, end: m.index + m[0].length, kind: 'ROUTING', why: 'routing number, ABA check' })),
  (t) => [...t.matchAll(labelled('account|acct|a\\/c|checking|savings|ending(?: in)?|member(?: id| number)?|policy(?: number)?', '(?<v>(?:x{2,}|\\*{2,}|…)?\\d[\\d\\- ]{2,20}\\d)'))].map((m) => {
    const v = (m.groups?.v ?? '').trim();
    const start = (m.index ?? 0) + m[0].length - (m.groups?.v ?? '').length;
    return { start, end: start + v.length, kind: 'ACCOUNT' as Kind, why: 'labelled account number' };
  }),
  (t) => [...t.matchAll(labelled('passport', '(?<v>[A-Z0-9]{6,9})'))].filter((m) => /\d/.test(m.groups?.v ?? '')).map((m) => {
    const v = m.groups?.v ?? '';
    const start = (m.index ?? 0) + m[0].length - v.length;
    return { start, end: start + v.length, kind: 'PASSPORT' as Kind, why: 'labelled passport number' };
  }),
  (t) => [...t.matchAll(labelled("driver'?s?\\s+licen[cs]e|licen[cs]e|dl", '(?<v>[A-Z0-9][A-Z0-9\\-]{4,16})'))].filter((m) => /\d/.test(m.groups?.v ?? '')).map((m) => {
    const v = m.groups?.v ?? '';
    const start = (m.index ?? 0) + m[0].length - v.length;
    return { start, end: start + v.length, kind: 'LICENSE' as Kind, why: "labelled driver's license" };
  }),
  (t) => [...t.matchAll(labelled('date of birth|dob|born(?: on)?|birthday', '(?<v>(?:\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{2,4})|(?:[A-Z][a-z]+\\.? \\d{1,2},? \\d{4}))'))].map((m) => {
    const v = m.groups?.v ?? '';
    const start = (m.index ?? 0) + m[0].length - v.length;
    return { start, end: start + v.length, kind: 'DATE_OF_BIRTH' as Kind, why: 'labelled date of birth' };
  }),
  (t) => [...t.matchAll(labelled('member id|employee id|customer id|patient id|case(?: number)?|ein|tax id|itin|medicare', '(?<v>[A-Z0-9][A-Z0-9\\-]{5,16})'))].filter((m) => /\d/.test(m.groups?.v ?? '')).map((m) => {
    const v = m.groups?.v ?? '';
    const start = (m.index ?? 0) + m[0].length - v.length;
    return { start, end: start + v.length, kind: 'ID' as Kind, why: 'labelled ID number' };
  }),
  (t) => [...t.matchAll(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g)].map((m) => ({ start: m.index, end: m.index + m[0].length, kind: 'EMAIL', why: 'email address' })),
  (t) => [...t.matchAll(/(?<![\d\-])(?:\+?1[ .\-]?)?(?:\(\d{3}\)|\d{3})[ .\-]\d{3}[ .\-]\d{4}(?![\d\-])/g)].map((m) => ({ start: m.index, end: m.index + m[0].length, kind: 'PHONE', why: 'phone number' })),
  (t) => [...t.matchAll(/(?:US)?\$ ?\d{1,3}(?:,\d{3})+(?:\.\d{2})?|(?:US)?\$ ?\d+(?:\.\d{2})?|\b\d{1,3}(?:,\d{3})*(?:\.\d{2})? ?(?:USD|dollars)\b/g)].map((m) => ({ start: m.index, end: m.index + m[0].length, kind: 'AMOUNT', why: 'money amount' })),
  (t) => [...t.matchAll(/\b\d{1,6}(?: [A-Z][a-z]+| [NSEW]\.?){1,4} (?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Ln|Lane|Dr|Drive|Ct|Court|Way|Pl|Place|Ter|Terrace|Pkwy|Parkway|Cir|Circle|Hwy|Highway)\b\.?(?:,? (?:Apt|Apartment|Unit|Suite|Ste|#) ?[A-Za-z0-9\-]+)?/g)].map((m) => ({ start: m.index, end: m.index + m[0].length, kind: 'ADDRESS', why: 'street address' })),
  // A machine string standing alone, with no label: long, mixed, high entropy.
  (t) => [...t.matchAll(/(?<![A-Za-z0-9_+/=\-])[A-Za-z0-9_+/=\-]{20,}(?![A-Za-z0-9_+/=\-])/g)].filter((m) => machineString(m[0])).map((m) => ({ start: m.index, end: m.index + m[0].length, kind: 'KEY', why: 'unlabelled secret, high entropy' })),
];

/** Run every rule on the text and on each view of it; return spans in the original text's coordinates. */
export function ruleSpans(text: string): Span[] {
  const views: Array<{ view: View; how: string | null }> = [{ view: identity(text), how: null }];
  for (const [make, how] of [[spelledDigits, 'spelled out'], [despaced, 'spaced apart'], [lineJoined, 'split across lines']] as const) {
    const view = make(text);
    if (view) views.push({ view, how });
  }
  const out: Span[] = [];
  for (const { view, how } of views) {
    for (const rule of RULES) {
      for (const f of rule(view.text)) {
        if (f.end <= f.start) continue;
        const start = view.map[f.start] ?? 0;
        const end = view.mapEnd[f.end - 1] ?? start + 1;
        out.push({ start, end, kind: f.kind, why: how ? `${f.why}, ${how}` : f.why, source: 'rule' });
      }
    }
  }
  return out;
}
