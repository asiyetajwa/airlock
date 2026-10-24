// Loads the name-finding model in the browser, from this app's own server (models/ on your computer).
// Nothing is fetched from a third party: remote models are switched off, and the runtime's WebAssembly is served locally.
import type { NerPipeline } from '../seal/names.js';

let cached: Promise<NerPipeline> | null = null;

export function loadNer(onProgress: (pct: number) => void): Promise<NerPipeline> {
  cached ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = '/models/';
    const wasm = env.backends.onnx.wasm;
    if (wasm) {
      wasm.wasmPaths = '/ort/';
      wasm.proxy = false;
    }
    const loaded = new Map<string, [number, number]>();
    const ner = await pipeline('token-classification', 'Xenova/bert-base-NER', {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status === 'progress' && p.file && p.total) {
          loaded.set(p.file, [p.loaded ?? 0, p.total]);
          const [a, b] = [...loaded.values()].reduce(([x, y], [l, t]) => [x + l, y + t], [0, 0]);
          onProgress(b ? Math.round((a / b) * 100) : 0);
        }
      },
    });
    return ner as unknown as NerPipeline;
  })();
  return cached;
}
