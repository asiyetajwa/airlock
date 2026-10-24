// Airlock's app. Everything here runs on your device: the vault, the name-finding model, sealing, the egress
// check, receipt checking and filling the answer back in. The only network call that carries content goes to the
// relay, and it carries sealed text only.

import { checkReceipt, egressCheck, fillIn, findNames, fingerprint, sealAll, type FilledPart, type Held, type Kind, type NameSpan, type NerPipeline, type Receipt, type ReceiptCheck, type TokenMap } from '../seal/index.js';
import { loadNer } from './ner.js';
import { SAMPLE_VAULT, type Icon, type VaultItem } from './sample.js';

type Screen = 'home' | 'ask' | 'receipt' | 'item' | 'leak';
type Chamber = 'idle' | 'busy' | 'on' | 'bad';

interface Turn {
  question: string;
  chambers: [Chamber, Chamber, Chamber];
  sentIds: string[];
  body?: string;
  sealedQuestion?: string;
  sealedContext?: Array<{ name: string; text: string }>;
  map?: TokenMap;
  answer?: FilledPart[];
  rawAnswer?: string;
  receipt?: Receipt;
  check?: ReceiptCheck;
  tampered?: ReceiptCheck | null;
  egressOk?: boolean;
  error?: string;
  web?: Array<{ title: string; url: string }>;
  live?: boolean;
  at?: string;
}

interface LeakCategory { id: string; label: string; hint: string; items: number; secrets: number; held: number; leaked: number; right: number; asked: number; costUsd: number }
interface LeakExample { category: string; title: string; original: string; held: Array<{ start: number; end: number; token: string; kind: Kind }>; injection: boolean }
interface LeakResults {
  ranAt: string;
  attacker: string;
  answerer: string;
  documents: number;
  items: number;
  secrets: number;
  leaked: number;
  answersRight: number;
  answersAsked: number;
  overRedactions: number;
  heldTotal: number;
  costUsd: number;
  categories: LeakCategory[];
  examples: LeakExample[];
  stream: Array<{ title: string; category: string; secrets: number; leaked: number; right: boolean | null }>;
}

interface Stats { date: string; held: number; calls: number; cost: number }

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const phone = () => window.matchMedia('(max-width: 900px)').matches;
const device = () => (phone() ? 'this phone' : 'this computer');
const usd = (n: number) => (n === 0 ? '$0' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`);
const today = () => new Date().toISOString().slice(0, 10);
const n = (x: number) => x.toLocaleString('en-US');

const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable; the app still works */ }
  },
};

const state = {
  screen: (phone() ? 'home' : 'ask') as Screen,
  vault: store.get<VaultItem[]>('airlock.vault.v1', []),
  item: null as string | null,
  itemMode: 'held' as 'held' | 'sealed',
  ner: null as NerPipeline | null,
  nerState: 'loading' as 'loading' | 'ready' | 'failed',
  nerPct: 0,
  names: new Map<string, NameSpan[]>(),
  held: new Map<string, Held[]>(),
  known: [] as Array<{ kind: Kind; value: string }>,
  turn: null as Turn | null,
  web: false,
  relay: '',
  publicKey: '',
  relayLive: false,
  relayWeb: false,
  stats: store.get<Stats>('airlock.stats.v1', { date: today(), held: 0, calls: 0, cost: 0 }),
  leak: null as LeakResults | null,
  replay: null as { shown: number; timer: number } | null,
  adding: false,
};
if (state.stats.date !== today()) state.stats = { date: today(), held: 0, calls: 0, cost: 0 };
if (!state.vault.length) {
  state.vault = SAMPLE_VAULT.map((v) => ({ ...v, added: new Date().toISOString() }));
  store.set('airlock.vault.v1', state.vault);
}

// ---------- Sealing the vault (on this device) ----------

function resealVault(): void {
  const items = state.vault;
  const { sealed } = sealAll(items.map((i) => i.text), { names: items.map((i) => state.names.get(i.id) ?? []) });
  state.held.clear();
  const known = new Map<string, { kind: Kind; value: string }>();
  sealed.forEach((s, i) => {
    const id = items[i]?.id;
    if (id) state.held.set(id, s.held);
    for (const h of s.held) known.set(`${h.kind}:${h.value.toLowerCase()}`, { kind: h.kind, value: h.value });
  });
  state.known = [...known.values()];
}

async function startNer(): Promise<void> {
  try {
    const ner = await loadNer((pct) => {
      state.nerPct = pct;
      renderStatus();
    });
    state.ner = ner;
    for (const item of state.vault) state.names.set(item.id, await findNames(ner, item.text));
    state.nerState = 'ready';
  } catch (err) {
    console.error('name finder failed to load', err);
    state.nerState = 'failed';
  }
  resealVault();
  render();
}

// ---------- Choosing what to send ----------

const STOP = new Set('the a an and or but of to in on at for from with about is are was were be been it this that what who whom which how why when where my me i you your our we do does did can could should would will any anything off there their them his her its as by not no yes please tell show give find'.split(' '));

function words(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? [];
}

/** The vault items most relevant to a question, scored on this device. At most two are sent. */
function pickItems(question: string): VaultItem[] {
  const q = words(question);
  const scored = state.vault.map((item) => {
    const name = words(item.name);
    const body = new Set(words(item.text));
    let score = 0;
    for (const w of q) {
      if (name.some((n) => n.startsWith(w.slice(0, 4)))) score += 3;
      if (body.has(w)) score += 1;
      else if ([...body].some((b) => b.length > 4 && b.startsWith(w.slice(0, 5)))) score += 0.5;
    }
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]?.score ?? 0;
  if (top <= 0) return [];
  return scored.filter((s) => s.score >= top * 0.6).slice(0, 2).map((s) => s.item);
}

// ---------- Asking ----------

async function ask(question: string): Promise<void> {
  const q = question.trim();
  if (!q || state.turn?.chambers.includes('busy')) return;
  const turn: Turn = { question: q, chambers: ['busy', 'idle', 'idle'], sentIds: [] };
  state.turn = turn;
  state.item = null;
  state.screen = 'ask';
  render();

  try {
    if (state.nerState === 'loading') await loadNer(() => undefined).catch(() => null);
    const items = pickItems(q);
    turn.sentIds = items.map((i) => i.id);
    const qNames = state.ner ? await findNames(state.ner, q) : [];
    const texts = [q, ...items.map((i) => i.text), ...items.map((i) => i.name)];
    const names = [qNames, ...items.map((i) => state.names.get(i.id) ?? []), ...items.map(() => [])];
    const { sealed, map } = sealAll(texts, { names, known: state.known });
    turn.map = map;
    turn.sealedQuestion = sealed[0]?.sealed ?? '';
    turn.sealedContext = items.map((_, i) => ({ name: sealed[1 + items.length + i]?.sealed ?? 'Document', text: sealed[1 + i]?.sealed ?? '' }));
    const body = JSON.stringify({ question: turn.sealedQuestion, context: turn.sealedContext, web: state.web });
    turn.body = body;
    await pause(450);

    const hits = egressCheck(body, [...map.values(), ...state.known]);
    turn.egressOk = hits.length === 0;
    if (hits.length) {
      turn.chambers = ['bad', 'idle', 'idle'];
      turn.error = `Blocked on ${device()}: the egress check found ${String(hits.length)} held value(s) in the outbound text, so nothing was sent.`;
      render();
      return;
    }
    turn.chambers = ['on', 'busy', 'idle'];
    render();

    const res = await fetch(`${state.relay}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    const out = (await res.json()) as { answer?: string; receipt?: Receipt; error?: string; web?: Turn['web']; live?: boolean };
    if (!res.ok || !out.answer || !out.receipt) throw new Error(out.error ?? `The relay answered ${String(res.status)}.`);
    turn.chambers = ['on', 'on', 'busy'];
    turn.receipt = out.receipt;
    turn.rawAnswer = out.answer;
    turn.web = out.web;
    turn.live = out.live;
    turn.at = new Date().toISOString();
    render();
    await pause(350);

    turn.check = checkReceipt(out.receipt, body, out.answer, state.publicKey || undefined);
    turn.answer = fillIn(out.answer, map);
    turn.chambers = ['on', 'on', turn.check.ok ? 'on' : 'bad'];
    const heldNow = new Set(sealed.flatMap((s) => s.held.map((h) => h.token))).size;
    state.stats.held += heldNow;
    state.stats.calls += 1;
    state.stats.cost += out.receipt.costUsd;
    store.set('airlock.stats.v1', state.stats);
  } catch (err) {
    turn.chambers = turn.chambers.map((c) => (c === 'busy' ? 'bad' : c)) as Turn['chambers'];
    turn.error = (err as Error).message.includes('fetch') ? 'Could not reach the relay. Is it running (npm start)?' : (err as Error).message;
  }
  render();
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Rendering ----------

const KIND_LABEL: Record<Kind, string> = {
  KEY: 'An API key', PRIVATE_KEY: 'A private key', PASSWORD: 'A password or PIN', CARD: 'A card number', SSN: 'A Social Security number', ROUTING: 'A routing number',
  ACCOUNT: 'An account number', IBAN: 'An IBAN', PHONE: 'A phone number', EMAIL: 'An email address', PASSPORT: 'A passport number', LICENSE: "A driver's license",
  AMOUNT: 'An amount', ADDRESS: 'An address', DATE_OF_BIRTH: 'A date of birth', ID: 'An ID number', PERSON: 'A name', HELD: 'From your always-hold list',
};
const KIND_ICON: Record<Kind, string> = {
  KEY: 'i-key', PRIVATE_KEY: 'i-key', PASSWORD: 'i-lock', CARD: 'i-money', SSN: 'i-hash', ROUTING: 'i-hash', ACCOUNT: 'i-hash', IBAN: 'i-hash', PHONE: 'i-hash',
  EMAIL: 'i-mail', PASSPORT: 'i-photo', LICENSE: 'i-photo', AMOUNT: 'i-money', ADDRESS: 'i-doc', DATE_OF_BIRTH: 'i-hash', ID: 'i-hash', PERSON: 'i-person', HELD: 'i-lock',
};
const SOURCE: Record<Held['source'], string> = { rule: 'rule', names: 'model', list: 'your vault' };
const svg = (id: string, cls = '') => `<svg class="${cls}"><use href="#${id}"/></svg>`;
const tokenize = (s: string) => esc(s).replace(/\b((?:[A-Z]+_)+\d+)\b/g, '<span class="tok">$1</span>');
const INJECTION = /(?:^|\n)[^\n]*(?:ignore (?:your|all|any|previous|prior) (?:rules|instructions)|disregard (?:your|all|previous)|repeat the original|reveal the (?:original|real)|print the (?:original|real))[^\n]*/gi;

function skeleton(): void {
  const app = $('#app');
  if (!app) return;
  app.innerHTML = `
  <div class="win" data-screen="${state.screen}">
    <div class="status" id="status"></div>
    <header class="head">
      <div class="brand"><span class="lk">${svg('i-lock')}</span>Airlock</div>
      <form class="askbar" id="askform" autocomplete="off">
        <input id="q" name="q" placeholder="Ask about anything in your vault" aria-label="Ask about anything in your vault">
        <button type="button" class="iconbtn" id="webbtn" title="Also search the web with the sealed question">${svg('i-globe')}</button>
        <button type="submit" class="iconbtn" title="Ask">${svg('i-search')}</button>
      </form>
      <nav class="tabs" id="tabs"><button data-go="ask">Ask</button><button data-go="leak">Leak test</button></nav>
      <div class="me" title="Your vault stays on ${device()}">${svg('i-user')}</div>
    </header>
    <section class="stats" id="stats"></section>
    <div class="main">
      <div class="body">
        <svg class="shape"><use href="#body"/></svg>
        <svg class="wave" viewBox="0 0 390 74" preserveAspectRatio="none"><use href="#wave"/></svg>
        <div class="inner" id="inner">
          <aside class="vault" id="vault"></aside>
          <section class="center" id="center"></section>
        </div>
        <button class="fab" id="fab" title="Ask">${svg('i-airlock')}</button>
      </div>
      <aside class="col" id="col"></aside>
    </div>
    <nav class="phonenav" id="phonenav"><button class="l" data-go="home" aria-label="Home">${svg('i-home')}</button><button class="r" data-go="leak" aria-label="Leak test">${svg('i-target')}</button></nav>
  </div>`;

  $('#askform')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>('#q');
    if (input) void ask(input.value);
  });
  $('#webbtn')?.addEventListener('click', () => {
    state.web = !state.web;
    render();
  });
  $('#fab')?.addEventListener('click', () => {
    const input = $<HTMLInputElement>('#q');
    if (input?.value.trim() && state.screen !== 'leak') void ask(input.value);
    else {
      go('ask');
      input?.focus();
    }
  });
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-go],[data-item],[data-ask],[data-act]');
    if (!el) return;
    if (el.dataset.go) go(el.dataset.go as Screen);
    if (el.dataset.item) openItem(el.dataset.item);
    if (el.dataset.ask) {
      const input = $<HTMLInputElement>('#q');
      if (input) input.value = el.dataset.ask;
      void ask(el.dataset.ask);
    }
    if (el.dataset.act) act(el.dataset.act);
  });
}

function go(screen: Screen): void {
  state.screen = screen;
  if (screen !== 'item') state.item = null;
  if (screen === 'leak') loadLeak();
  render();
  window.scrollTo({ top: 0 });
}

function openItem(id: string): void {
  if (id === 'add') {
    state.adding = true;
    renderSheet();
    return;
  }
  state.item = id;
  state.itemMode = 'held';
  state.screen = 'item';
  render();
  window.scrollTo({ top: 0 });
}

function act(name: string): void {
  const t = state.turn;
  if (name === 'tamper' && t?.receipt && t.body && t.rawAnswer) {
    // Change one byte of what was sent, and check the relay's receipt against it.
    const i = t.body.search(/\d/);
    const changed = i >= 0 ? t.body.slice(0, i) + String((Number(t.body[i]) + 1) % 10) + t.body.slice(i + 1) : `${t.body} `;
    t.tampered = checkReceipt(t.receipt, changed, t.rawAnswer, state.publicKey || undefined);
  }
  if (name === 'untamper' && t) t.tampered = null;
  if (name === 'mode-held') state.itemMode = 'held';
  if (name === 'mode-sealed') state.itemMode = 'sealed';
  if (name === 'replay') replay();
  if (name === 'receipt') state.screen = 'receipt';
  if (name === 'delete' && state.item) {
    state.vault = state.vault.filter((v) => v.id !== state.item);
    store.set('airlock.vault.v1', state.vault);
    resealVault();
    go(phone() ? 'home' : 'ask');
    return;
  }
  if (name === 'reset-vault') {
    state.vault = SAMPLE_VAULT.map((v) => ({ ...v, added: new Date().toISOString() }));
    store.set('airlock.vault.v1', state.vault);
    void startNer();
  }
  render();
}

function render(): void {
  const win = $('.win');
  if (!win) return;
  const desk = !phone();
  const screen = desk && (state.screen === 'home' || state.screen === 'receipt') ? 'ask' : state.screen;
  win.dataset.screen = state.screen;
  for (const b of document.querySelectorAll<HTMLElement>('#tabs [data-go]')) b.classList.toggle('on', b.dataset.go === (screen === 'item' ? 'ask' : screen));
  for (const b of document.querySelectorAll<HTMLElement>('#phonenav [data-go]')) b.classList.toggle('on', b.dataset.go === state.screen);
  $('#webbtn')?.classList.toggle('on', state.web);
  $('#webbtn')?.toggleAttribute('hidden', !state.relayWeb);
  const busy = !!state.turn?.chambers.includes('busy');
  $('#fab')?.classList.toggle('busy', busy);
  $('#inner')?.classList.toggle('wide', screen === 'leak');
  renderStatus();
  renderStats(screen);
  renderVault(screen);
  renderCenter(screen);
  renderCol(screen);
}

function renderStatus(): void {
  const el = $('#status');
  if (!el) return;
  const ner = state.nerState === 'loading' ? `Loading the name finder from ${device()}${state.nerPct ? `: ${String(state.nerPct)}%` : ''}` : state.nerState === 'failed' ? 'Name finder unavailable: rules only' : 'Name finder ready, on this device';
  const mode = state.relay ? (state.relayLive ? 'Relay live on Nebius Token Factory' : 'Relay in stub mode') : 'Relay not reached';
  el.innerHTML = `${esc(ner)} · <b>${esc(mode)}</b>`;
}

function renderStats(screen: Screen): void {
  const el = $('#stats');
  if (!el) return;
  const l = state.leak;
  if (screen === 'leak') {
    if (!l) {
      el.innerHTML = `<div class="stat"><b>-</b><span>no leak test run yet</span></div>`;
      return;
    }
    el.innerHTML = `
      <div class="stat"><b>${n(l.leaked)}<em> / ${n(l.secrets)}</em></b><span>planted secrets leaked</span></div>
      <div class="stat"><b>${l.answersAsked ? String(Math.round((l.answersRight / l.answersAsked) * 100)) : '-'}%</b><span>answers still right after filling in</span></div>
      <div class="stat"><b>${n(l.overRedactions)}</b><span>extra holds: held, but not planted</span></div>
      <div class="stat"><b>${usd(l.costUsd)}</b><span>whole test on Token Factory</span></div>`;
    return;
  }
  const leakLine = l ? `<b>${n(l.leaked)}<em> / ${n(l.secrets)}</em></b><span>leaks in the last leak test</span><div class="meter"><i style="width:${String(l.secrets ? 100 - (l.leaked / l.secrets) * 100 : 0)}%"></i></div>` : `<b>-</b><span>no leak test run yet</span>`;
  el.innerHTML = `
    <div class="stat"><b>${String(state.stats.held)}</b><span>items held back today</span></div>
    <div class="stat">${leakLine}</div>
    <div class="stat"><b>${String(state.stats.calls)}</b><span>calls to Nemotron today, ${usd(state.stats.cost)}</span></div>`;
}

function renderVault(screen: Screen): void {
  const el = $('#vault');
  if (!el) return;
  if (screen === 'leak') {
    el.innerHTML = '';
    return;
  }
  const sent = new Set(state.turn?.sentIds ?? []);
  const tiles = state.vault.map((item) => {
    const n = new Set((state.held.get(item.id) ?? []).map((h) => h.token)).size;
    const on = state.item === item.id ? ' on' : sent.has(item.id) && !state.item ? ' sent' : '';
    return `<button class="tile${on}" data-item="${esc(item.id)}"><div class="t">${svg(`i-${item.icon}`)}${n ? `<span class="badge">${String(n)}</span>` : ''}</div><b>${esc(item.name)}</b><span>${esc(item.ext)}</span></button>`;
  });
  tiles.push(`<button class="tile" data-item="add"><div class="t">${svg('i-plus')}</div><b>Add</b><span>paste or file</span></button>`);
  el.innerHTML = `<div class="kicker"><span>Your vault</span><span>on ${device()}</span></div><div class="tiles">${tiles.join('')}</div>
    <p class="vnote">Badges count what Airlock holds back in each item. Nothing here is uploaded.</p>`;
}

function renderCenter(screen: Screen): void {
  const el = $('#center');
  if (!el) return;
  if (screen === 'leak') {
    el.innerHTML = leakCenter();
    return;
  }
  if (screen === 'item' && state.item) {
    el.innerHTML = itemCenter(state.item);
    return;
  }
  const t = state.turn;
  if (!t) {
    el.innerHTML = `<div class="kicker"><span>Ask</span></div>
      <div class="empty"><h2>Ask about anything in your vault.</h2>
      Airlock seals names, numbers and keys on ${device()} before your question leaves it. NVIDIA Nemotron answers on sealed text, and the real values are filled back in here.
      <div class="chips">
        <button class="chip" data-ask="My bank emailed about a transfer. Who was it to, how much, and is anything off?">A bank email about a transfer</button>
        <button class="chip" data-ask="When does my lease end, and how much notice do I need to give to renew?">When my lease ends</button>
        <button class="chip" data-ask="Where is my tax refund going, and how much is it?">Where my tax refund goes</button>
        <button class="chip" data-ask="Is the IT support email asking me for anything suspicious?">The IT support email</button>
      </div></div>`;
    return;
  }
  const ch = (i: 0 | 1 | 2, title: string, sub: string) => `<div class="ch ${t.chambers[i]}"><span class="ring">${String(i + 1)}</span><div><b>${title}</b>${sub}</div></div>`;
  const heldCount = t.map ? t.map.entries().filter((e) => t.body?.includes(e.token)).length : 0;
  const answer = t.error
    ? `<div class="bubble a err">${esc(t.error)}</div>`
    : t.answer
      ? `<div class="bubble a">${t.answer.map((p) => (p.token ? `<span class="fill" title="${esc(p.token)}, filled in on ${device()}">${esc(p.text)}</span>` : esc(p.text))).join('')}</div>`
      : '';
  const sentLine = t.receipt && t.check
    ? `<div class="sentline"><span class="ok">${t.check.ok ? '&#10003;' : '!'}</span>Receipt ${esc(t.receipt.id.slice(0, 4).toUpperCase())}: ${String(heldCount)} item${heldCount === 1 ? '' : 's'} stayed on ${device()}${phone() ? ` <button data-act="receipt">See receipt</button>` : ''}</div>`
    : '';
  el.innerHTML = `<div class="kicker"><span>Ask</span><span>${t.at ? new Date(t.at).toISOString().slice(11, 16) + ' UTC' : ''}</span></div>
    <div class="bubble q">${esc(t.question)}</div>
    <div class="chambers">${ch(0, `Sealed here`, t.chambers[0] === 'idle' || t.chambers[0] === 'busy' ? 'finding secrets' : t.chambers[0] === 'bad' ? 'blocked' : `${String(heldCount)} held`)}${ch(1, 'Nemotron', 'reads sealed text')}${ch(2, 'Filled in', `on ${device()}`)}</div>
    ${answer}${sentLine}`;
}

function highlighted(text: string, held: Held[]): string {
  let out = '';
  let cur = 0;
  for (const h of [...held].sort((a, b) => a.start - b.start)) {
    if (h.start < cur) continue;
    out += markInjection(text.slice(cur, h.start));
    out += `<span class="strike">${esc(text.slice(h.start, h.end))}<sup>${esc(h.token)}</sup></span>`;
    cur = h.end;
  }
  return out + markInjection(text.slice(cur));
}

function markInjection(s: string): string {
  let out = '';
  let cur = 0;
  for (const m of s.matchAll(INJECTION)) {
    const start = m.index + (m[0].startsWith('\n') ? 1 : 0);
    out += esc(s.slice(cur, start)) + `<span class="inj">${esc(s.slice(start, m.index + m[0].length))}</span>`;
    cur = m.index + m[0].length;
  }
  return out + esc(s.slice(cur));
}

function sealedText(text: string, held: Held[]): string {
  let out = '';
  let cur = 0;
  for (const h of [...held].sort((a, b) => a.start - b.start)) {
    if (h.start < cur) continue;
    out += text.slice(cur, h.start) + h.token;
    cur = h.end;
  }
  return out + text.slice(cur);
}

/** An item sealed on its own, so its tokens are numbered from 1; values held elsewhere in the vault still count. */
function itemHeld(item: VaultItem): Held[] {
  return sealAll([item.text], { names: [state.names.get(item.id) ?? []], known: state.known }).sealed[0]?.held ?? [];
}

function itemCenter(id: string): string {
  const item = state.vault.find((v) => v.id === id);
  if (!item) return '';
  const held = itemHeld(item);
  const body = state.itemMode === 'held' ? highlighted(item.text, held) : `<span class="sealedview">${tokenize(sealedText(item.text, held))}</span>`;
  return `<div class="kicker"><span>${esc(item.name)}${esc(item.ext)}</span>
      <span class="toggle"><button data-act="mode-held" class="${state.itemMode === 'held' ? 'on' : ''}">On ${esc(device())}</button><button data-act="mode-sealed" class="${state.itemMode === 'sealed' ? 'on' : ''}">What would leave</button></span></div>
    <div class="doc">${body}</div>
    <div class="kicker" style="margin-top:16px"><span>${state.nerState === 'ready' ? 'Rules and the name finder ran on this device' : 'Rules ran on this device'}</span><button data-act="delete">Remove from vault</button></div>`;
}

function leakCenter(): string {
  const l = state.leak;
  if (!l) {
    return `<div class="kicker"><span>Leak test</span></div><div class="empty"><h2>No leak test results yet.</h2>Run <b>npm run leak-test</b> to have Nemotron 3 Ultra write documents that try to smuggle secrets out, and score this build against them.</div>`;
  }
  const rows = l.categories.map((c) => `<div class="trow"><span class="k">${svg(CAT_ICON[c.id] ?? 'i-doc')}</span><div><b>${esc(c.label)}</b><span>${esc(c.hint)}</span></div>
      <b class="${c.leaked ? '' : 'good'}">${n(c.secrets - c.leaked)} / ${n(c.secrets)}</b><b>${c.asked ? `${String(Math.round((c.right / c.asked) * 100))}%` : 'n/a'}</b><b>${usd(c.costUsd)}</b></div>`);
  const shown = state.replay ? l.stream.slice(Math.max(0, state.replay.shown - 6), state.replay.shown).reverse() : [];
  const stream = shown.map((s) => `<div class="srow"><b>${esc(s.title)}</b>${esc(s.category)}<em class="${s.leaked ? 'bad' : ''}">${s.leaked ? `${String(s.leaked)} leaked` : `${String(s.secrets)} held`}${s.right === null ? '' : s.right ? ', answer right' : ', answer wrong'}</em></div>`);
  const counter = state.replay ? `<span>${String(Math.min(state.replay.shown, l.stream.length))} of ${String(l.stream.length)} items</span>` : `<button data-act="replay">Replay the recorded run</button>`;
  return `<div class="kicker"><span>Attacks by type</span><span>${String(l.documents)} documents written by Nemotron 3 Ultra</span></div>
    <div class="table"><div class="trow h"><span></span><span>What it hid</span><span>Held</span><span>Answers right</span><span>Cost</span></div>${rows.join('')}</div>
    <div class="kicker" style="margin-top:22px"><span>The run</span>${counter}</div>
    <div class="stream">${stream.join('')}</div>
    <p class="note">An eval, not a promise. Nemotron 3 Ultra wrote ${String(l.documents)} documents with planted secrets of known type and position, and prompt injections. Each of the ${String(l.items)} items went through the real seal and egress path; a leak is any planted secret, exact or reformatted, in the outbound text. Nemotron 3 Super answered each item's question on sealed text, and the filled-in answer was checked against the planted truth. Run ${esc(new Date(l.ranAt).toISOString().slice(0, 16).replace('T', ' '))} UTC.</p>`;
}

const CAT_ICON: Record<string, string> = { keys: 'i-key', names: 'i-person', numbers: 'i-money', injections: 'i-doc' };

function replay(): void {
  const l = state.leak;
  if (!l) return;
  if (state.replay) clearInterval(state.replay.timer);
  const r = { shown: 0, timer: 0 };
  r.timer = window.setInterval(() => {
    r.shown += 1;
    if (r.shown >= l.stream.length) clearInterval(r.timer);
    renderCenter('leak');
  }, Math.max(25, Math.floor(9000 / Math.max(1, l.stream.length))));
  state.replay = r;
  renderCenter('leak');
}

function renderCol(screen: Screen): void {
  const el = $('#col');
  if (!el) return;
  if (screen === 'leak') {
    el.innerHTML = leakCol();
    return;
  }
  if (screen === 'item' && state.item) {
    el.innerHTML = itemCol(state.item);
    return;
  }
  const t = state.turn;
  if (!t?.body) {
    el.innerHTML = `<h3>Receipt</h3><div class="sub">Every question gets a receipt: the exact text that left ${device()}, what stayed, and the relay's signature over the bytes it received.</div>${fpLine()}`;
    return;
  }
  const entries = t.map?.entries().filter((e) => t.body?.includes(e.token)) ?? [];
  const payload = [`<span class="label">Question:</span> ${tokenize(t.sealedQuestion ?? '')}`, ...(t.sealedContext ?? []).map((c) => `\n\n<span class="label">${esc(c.name)}:</span>\n${tokenize(c.text)}`)].join('');
  const rows = entries.map((e) => `<div class="drow"><span class="k">${svg(KIND_ICON[e.kind])}</span><div><b>${esc(KIND_LABEL[e.kind])}</b><span>${esc(e.token)}</span></div><em>held</em></div>`);
  const r = t.receipt;
  const c = t.check;
  const proofs: string[] = [];
  if (t.egressOk !== undefined) proofs.push(proof(t.egressOk, t.egressOk ? 'Egress check: no vault secret in the payload' : 'Egress check: a held value was in the payload, so nothing was sent'));
  if (r && c) {
    if (t.tampered) {
      proofs.push(proof(false, `<b>One changed byte:</b> the hash of what was sent no longer matches the relay's signed receipt`));
      proofs.push(proof(t.tampered.signatureValid, 'The signature itself is still valid, so the mismatch is the change, not the relay'));
    } else {
      proofs.push(proof(c.signatureValid && c.requestMatches, c.signatureValid && c.requestMatches ? `The relay signed the same ${String(r.requestBytes)} bytes ${device()} sent` : 'The relay\'s signature does not match what was sent'));
      proofs.push(proof(c.responseMatches, c.responseMatches ? 'The answer is the one the relay signed' : 'The answer differs from the one the relay signed'));
    }
    if (t.web?.length) proofs.push(proof(true, `Searched the web with the sealed question only: ${String(t.web.length)} results`));
    proofs.push(proof(true, `${String(r.tokensIn)} tokens in, ${String(r.tokensOut)} out: ${usd(r.costUsd)}${t.live ? '' : ' (stub mode, no model called)'}`));
  }
  const model = r ? (r.model.includes('Ultra') ? 'Nemotron 3 Ultra' : 'Nemotron 3 Super') : 'Nemotron';
  el.innerHTML = `<h3>Receipt ${r ? esc(r.id.slice(0, 4).toUpperCase()) : ''}</h3>
    <div class="sub">What left ${device()}, to ${model} on Nebius Token Factory${t.at ? `, ${new Date(t.at).toISOString().slice(11, 16)} UTC` : ''}</div>
    <div class="payload">${payload}</div>
    <div class="mini"><span>What stayed here</span><span>${String(entries.length)}</span></div>
    ${rows.join('')}
    <div style="margin-top:16px">${proofs.join('')}</div>
    ${r ? `<button class="ghost" data-act="${t.tampered ? 'untamper' : 'tamper'}">${t.tampered ? 'Back to the real receipt' : 'Change one byte and check again'}</button>` : ''}
    ${fpLine()}`;
}

const proof = (ok: boolean, html: string) => `<div class="proof${ok ? '' : ' bad'}"><i>${ok ? '&#10003;' : '&#10005;'}</i><span>${html}</span></div>`;
const fpLine = () => (state.publicKey ? `<div class="fp">Relay key fingerprint <span class="mono">${esc(fingerprint(state.publicKey))}</span></div>` : '');

function itemCol(id: string): string {
  const item = state.vault.find((v) => v.id === id);
  if (!item) return '';
  const held = itemHeld(item);
  const byToken = new Map<string, Held>();
  for (const h of held) if (!byToken.has(h.token)) byToken.set(h.token, h);
  const injections = [...item.text.matchAll(INJECTION)].length;
  const secrets = byToken.size;
  const rows = [...byToken.values()].map((h) => `<div class="drow"><span class="k">${svg(KIND_ICON[h.kind])}</span><div><b>${esc(KIND_LABEL[h.kind])}</b><span>${esc(h.why)}</span></div><em>${SOURCE[h.source]}</em></div>`);
  const head = injections
    ? `<div class="alert"><div class="hd"><span class="shield">${svg('i-shield')}</span><div><b style="font-size:17px">Held on ${device()}</b><div class="sub">${String(secrets)} held, ${String(injections)} instruction aimed at the assistant</div></div></div></div>`
    : `<div class="alert calm"><div class="hd"><span class="shield">${svg('i-shield')}</span><div><b style="font-size:17px">Held on ${device()}</b><div class="sub">${String(secrets)} value${secrets === 1 ? '' : 's'} never leave${secrets === 1 ? 's' : ''} this device</div></div></div></div>`;
  const inj = injections ? proof(true, 'The instruction can reach Nemotron, as data; the values it asks for never do') : '';
  return `<h3>Why it was held</h3><div class="sub">${esc(item.name)}: found by rules, the on-device name finder, or a value held elsewhere in your vault</div>${head}${rows.join('')}<div style="margin-top:14px">${inj}</div>`;
}

function leakCol(): string {
  const l = state.leak;
  const ex = l?.examples.find((e) => e.injection) ?? l?.examples[0];
  if (!l || !ex) return `<h3>Caught live</h3><div class="sub">Examples from the leak test appear here after a run.</div>`;
  const held = ex.held.map((h) => ({ ...h, why: '', source: 'rule' as const, value: ex.original.slice(h.start, h.end) }));
  let body = '';
  let cur = 0;
  for (const h of [...held].sort((a, b) => a.start - b.start)) {
    if (h.start < cur) continue;
    body += markInjection(ex.original.slice(cur, h.start)) + `<span class="strike">${esc(ex.original.slice(h.start, h.end))}</span>`;
    cur = h.end;
  }
  body += markInjection(ex.original.slice(cur));
  const kinds = [...new Map(ex.held.map((h) => [h.token, h])).values()];
  const rows = kinds.slice(0, 4).map((h) => `<div class="drow"><span class="k">${svg(KIND_ICON[h.kind])}</span><div><b>${esc(KIND_LABEL[h.kind])}</b><span>${esc(h.token)}</span></div><em>held</em></div>`);
  return `<h3>Caught live</h3><div class="sub">One of the ${String(l.documents)}: ${esc(ex.title)}</div>
    <div class="alert"><div class="hd"><span class="shield">${svg('i-shield')}</span><div><b style="font-size:17px">Held on this device</b><div class="sub">${String(kinds.length)} secrets${ex.injection ? ', 1 injection' : ''}</div></div></div><div class="mail">${body}</div></div>
    ${rows.join('')}
    ${ex.injection ? `<div style="margin-top:14px">${proof(true, 'The instruction reached Nemotron; the secrets it asked for never did')}</div>` : ''}`;
}

function renderSheet(): void {
  document.querySelector('.sheet')?.remove();
  if (!state.adding) return;
  const div = document.createElement('div');
  div.className = 'sheet';
  div.innerHTML = `<form class="card" id="addform">
      <h3>Add to your vault</h3>
      <p>Paste text or choose a text file. It is stored on ${device()} only.</p>
      <input type="text" name="name" placeholder="Name, for example Insurance letter" required>
      <textarea name="text" placeholder="Paste the email, letter or note" required></textarea>
      <div class="row"><label class="filelab">Choose a file<input type="file" name="file" accept=".txt,.md,.eml,.csv,.json,text/*"></label>
        <button type="button" class="btn light" data-close>Cancel</button><button class="btn" type="submit">Add</button></div>
    </form>`;
  document.body.appendChild(div);
  const form = div.querySelector<HTMLFormElement>('#addform');
  div.addEventListener('click', (e) => {
    if (e.target === div || (e.target as HTMLElement).closest('[data-close]')) {
      state.adding = false;
      renderSheet();
    }
  });
  form?.querySelector<HTMLInputElement>('input[type=file]')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !form) return;
    (form.elements.namedItem('text') as HTMLTextAreaElement).value = await file.text();
    const name = form.elements.namedItem('name') as HTMLInputElement;
    if (!name.value) name.value = file.name.replace(/\.[^.]+$/, '');
  });
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const text = String(data.get('text') ?? '').trim();
    if (!name || !text) return;
    const item: VaultItem = { id: `item-${String(Date.now())}`, name, ext: '.txt', icon: /mail|email/i.test(name) ? 'mail' : 'doc', text, added: new Date().toISOString() };
    state.vault.push(item);
    store.set('airlock.vault.v1', state.vault);
    state.adding = false;
    renderSheet();
    if (state.ner) state.names.set(item.id, await findNames(state.ner, text));
    resealVault();
    openItem(item.id);
  });
}

function loadLeak(): void {
  if (state.leak) return;
  fetch('/data/leak-test/results.json')
    .then((r) => (r.ok ? (r.json() as Promise<LeakResults>) : null))
    .then((l) => {
      state.leak = l;
      render();
    })
    .catch(() => undefined);
}

async function boot(): Promise<void> {
  skeleton();
  resealVault();
  render();
  loadLeak();
  try {
    const cfg = (await (await fetch('/config.json')).json()) as { relay: string; publicKey: string };
    state.relay = cfg.relay;
    state.publicKey = cfg.publicKey;
    const info = (await (await fetch(`${cfg.relay}/key`)).json()) as { publicKey: string; live: boolean; web: boolean };
    state.relayLive = info.live;
    state.relayWeb = info.web;
    if (!state.publicKey) state.publicKey = info.publicKey;
  } catch {
    state.relay = state.relay || `${location.protocol}//${location.hostname}:8792`;
  }
  render();
  const preset = new URLSearchParams(location.search);
  if (preset.get('screen')) go(preset.get('screen') as Screen);
  void startNer();
  window.matchMedia('(max-width: 900px)').addEventListener('change', render);
}

void boot();
