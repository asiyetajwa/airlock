// Loads the name-finding model in Node (tests and the leak test), from models/ on this computer.
import { join } from 'node:path';
import type { NerPipeline } from './names.js';

let cached: Promise<NerPipeline> | null = null;

export function loadNer(root = process.cwd()): Promise<NerPipeline> {
  cached ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowRemoteModels = false;
    env.localModelPath = join(root, 'models') + '/';
    return (await pipeline('token-classification', 'Xenova/bert-base-NER', { dtype: 'q8' })) as unknown as NerPipeline;
  })();
  return cached;
}
