// The name-finding layer: a small BERT model (bert-base-NER, ONNX, quantized) that runs on the device through
// Transformers.js. It finds people's names the rules cannot know about. The model gives labels per word piece
// without character offsets, so we align the pieces back to the text ourselves.

export interface NamePiece {
  entity: string;
  score: number;
  index: number;
  word: string;
}

/** The parts of a Transformers.js token-classification pipeline we use. */
export interface NerPipeline {
  (text: string): Promise<NamePiece[]>;
  tokenizer: { tokenize(text: string): string[] };
}

export interface NameSpan {
  start: number;
  end: number;
  score: number;
}

/** Split long text into chunks the model can read (it takes 512 word pieces), on line breaks where possible. */
export function chunks(text: string, max = 900): Array<{ offset: number; text: string }> {
  const out: Array<{ offset: number; text: string }> = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + max);
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      const sp = text.lastIndexOf(' ', end);
      end = nl > start + max / 3 ? nl + 1 : sp > start + max / 3 ? sp + 1 : end;
    }
    out.push({ offset: start, text: text.slice(start, end) });
    start = end;
  }
  return out;
}

/** Character offsets of each word piece, found by walking the text. Unknown pieces take the next non-space run. */
export function alignPieces(text: string, pieces: string[]): Array<{ start: number; end: number } | null> {
  const out: Array<{ start: number; end: number } | null> = [];
  let cur = 0;
  for (const raw of pieces) {
    const piece = raw.startsWith('##') ? raw.slice(2) : raw;
    while (cur < text.length && /\s/.test(text[cur] ?? '')) cur++;
    if (raw === '[UNK]') {
      const m = /^\S+?(?=\s|[.,;:!?]|$)/.exec(text.slice(cur));
      const len = Math.max(1, m?.[0].length ?? 1);
      out.push({ start: cur, end: cur + len });
      cur += len;
      continue;
    }
    if (text.startsWith(piece, cur)) {
      out.push({ start: cur, end: cur + piece.length });
      cur += piece.length;
      continue;
    }
    // Accents and odd characters: search a little way ahead, case-insensitively.
    const at = text.toLowerCase().indexOf(piece.toLowerCase(), cur);
    if (at >= 0 && at - cur < 8) {
      out.push({ start: at, end: at + piece.length });
      cur = at + piece.length;
    } else {
      out.push(null);
    }
  }
  return out;
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}'’\-]/u.test(c);

/** People's names in the text, as character spans. */
export async function findNames(ner: NerPipeline, text: string, minScore = 0.6): Promise<NameSpan[]> {
  const spans: NameSpan[] = [];
  for (const chunk of chunks(text)) {
    if (!chunk.text.trim()) continue;
    const pieces = ner.tokenizer.tokenize(chunk.text);
    const offsets = alignPieces(chunk.text, pieces);
    const labels = await ner(chunk.text);
    let run: { start: number; end: number; scores: number[]; last: number } | null = null;
    const flush = () => {
      if (!run) return;
      const score = run.scores.reduce((a, b) => a + b, 0) / run.scores.length;
      let { start, end } = run;
      // Widen to whole words: a name piece in the middle of a word takes the word.
      while (start > 0 && isWordChar(chunk.text[start - 1])) start--;
      while (end < chunk.text.length && isWordChar(chunk.text[end])) end++;
      while (end > start && /['’\-]/.test(chunk.text[end - 1] ?? '')) end--;
      if (score >= minScore && /\p{L}{2,}/u.test(chunk.text.slice(start, end))) spans.push({ start: chunk.offset + start, end: chunk.offset + end, score });
      run = null;
    };
    for (const l of labels) {
      if (!l.entity.endsWith('PER')) continue;
      const off = offsets[l.index - 1];
      if (!off) continue;
      const joins = run && l.index === run.last + 1 && (l.entity.startsWith('I-') || l.word.startsWith('##') || off.start - run.end <= 1);
      if (!joins) flush();
      if (!run) run = { start: off.start, end: off.end, scores: [], last: l.index };
      run.end = Math.max(run.end, off.end);
      run.scores.push(l.score);
      run.last = l.index;
    }
    flush();
  }
  return spans;
}
