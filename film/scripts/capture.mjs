// Captures every state the Airlock film shows, from the running app, and records the on-screen box of each element
// the camera reads (public/app/boxes.json). Desktop at 1440 x 900, the phone at 390 x 844. The question to Nemotron
// is asked live, so start the app with a key first:   npm start   (repo root), then   npm run capture   (film/)
// The relay's reply is held back for a moment so the film can show the chambers mid-flight; nothing else is staged.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.AIRLOCK_URL ?? 'http://127.0.0.1:8791';
const OUT = new URL('../public/app/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const boxes = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function open(viewport, scale, mobile = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(BASE);
  await page.waitForFunction(() => /ready/.test(document.querySelector('#status')?.textContent ?? ''), null, { timeout: 180000 });
  return page;
}

async function shot(page, name, keys = {}) {
  await sleep(250);
  for (const [key, sel] of Object.entries(keys)) {
    const b = await page.locator(sel).first().boundingBox();
    if (!b) throw new Error(`No box for ${name}:${key} (${sel})`);
    boxes[`${name}:${key}`] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  }
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log('captured', name);
}

/** Holds the relay's reply until release() is called, so the in-flight state can be captured. */
async function holdRelay(page) {
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route('**/ask', async (route) => {
    const res = await route.fetch();
    await gate;
    await route.fulfill({ response: res });
  });
  return () => release();
}

// ---------------- Desktop ----------------
{
  const page = await open({ width: 1440, height: 900 }, 2);
  await shot(page, 'd-home', { vault: '#vault', tiles: '.tiles', center: '#center', col: '#col', stats: '#stats' });

  await page.click('[data-item="it-support"]');
  await shot(page, 'd-item', { doc: '.doc', col: '#col', alert: '.alert', tile: '.tile.on' });
  await page.click('[data-act="mode-sealed"]');
  await shot(page, 'd-item-sealed', { doc: '.doc', toggle: '.toggle' });

  const q = 'My bank emailed about a transfer. Who was it to, how much, and is anything off?';
  await page.click('[data-go="ask"]');
  await page.fill('#q', q);
  await shot(page, 'd-typed', { ask: '#askform', vault: '#vault' });
  const release = await holdRelay(page);
  await page.press('#q', 'Enter');
  await sleep(1100);
  await shot(page, 'd-flight', { chambers: '.chambers', payload: '.payload', col: '#col', question: '.bubble.q' });
  release();
  await page.waitForSelector('.sentline', { timeout: 120000 });
  await sleep(500);
  await shot(page, 'd-answer', { answer: '.bubble.a', chambers: '.chambers', col: '#col', payload: '.payload', proofs: '.col .proof', sent: '.sentline', center: '#center' });
  // The receipt column scrolled to its proofs.
  await page.evaluate(() => document.querySelector('#col')?.scrollTo({ top: 10000 }));
  await shot(page, 'd-receipt', { col: '#col', proofs: '.col .proof', ghost: '.ghost', rows: '.col .drow' });
  await page.click('[data-act="tamper"]');
  await page.evaluate(() => document.querySelector('#col')?.scrollTo({ top: 10000 }));
  await shot(page, 'd-tamper', { col: '#col', bad: '.proof.bad', ghost: '.ghost' });

  await page.click('[data-go="leak"]');
  await page.waitForSelector('.trow:not(.h)');
  await shot(page, 'd-leak', { table: '.table', stats: '#stats', col: '#col', alert: '.alert' });
  await page.click('[data-act="replay"]');
  await sleep(2600);
  await shot(page, 'd-leak-run1', { stream: '.stream', table: '.table' });
  await sleep(3200);
  await shot(page, 'd-leak-run2', { stream: '.stream' });
  await sleep(4500);
  await shot(page, 'd-leak-done', { stream: '.stream', stats: '#stats', table: '.table' });
  await page.context().close();
}

// ---------------- Phone ----------------
{
  const page = await open({ width: 390, height: 844 }, 3, true);
  await shot(page, 'p-home');
  await page.click('[data-item="add"]');
  await page.fill('.sheet input[name=name]', 'Text from Mom');
  await page.fill('.sheet textarea', "Hi honey, for the rent this month: routing 021000021, account 000123456789. Call me at (614) 555-0147 if the landlord asks. Love, Mom");
  await shot(page, 'p-add');
  await page.click('.sheet button[type=submit]');
  await page.waitForSelector('.doc');
  await sleep(400);
  await shot(page, 'p-item');
  await page.click('[data-act="mode-sealed"]');
  await shot(page, 'p-item-sealed');
  await page.evaluate(() => window.scrollTo(0, 2000));
  await shot(page, 'p-why');
  await page.context().close();
}

writeFileSync(`${OUT}boxes.json`, JSON.stringify(boxes, null, 2));
await browser.close();
console.log('boxes written');
