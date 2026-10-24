// Renders the thumbnails: node thumbnail/shoot.mjs  (from film/)
import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [name, w, h] of [['thumbnail', 1500, 1000], ['thumbnail-youtube', 1280, 720]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await p.goto(new URL('thumbnail.html', import.meta.url).href);
  await p.addStyleTag({ content: `:root { --w: ${String(w)}px; --h: ${String(h)}px; }` });
  await p.waitForTimeout(500);
  await p.screenshot({ path: new URL(`../../docs/${name}.jpg`, import.meta.url).pathname, type: 'jpeg', quality: 90 });
  console.log(name);
}
await b.close();
