// Downloads the name-finding model (a BERT NER model in ONNX form, quantized) into models/, once.
// The app serves it from there, so the browser loads it from your own computer, never from a third party.
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const REPO = 'Xenova/bert-base-NER';
const FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'];
const root = join('models', REPO);

for (const f of FILES) {
  const dest = join(root, f);
  try { await stat(dest); continue; } catch { /* not there yet */ }
  const res = await fetch(`https://huggingface.co/${REPO}/resolve/main/${f}`);
  if (!res.ok) throw new Error(`model download failed for ${f}: ${String(res.status)}`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`model: ${f}`);
}
console.log(`model: ready in ${root}`);
