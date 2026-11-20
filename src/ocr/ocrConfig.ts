import { OEM, PSM, type Block, type WorkerParams } from 'tesseract.js';
import type { WordBox } from './headerRow';

/** Flattens Tesseract's block tree to its words with their boxes. */
export function wordBoxes(blocks: Block[] | null): WordBox[] {
  return (blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words.map((w) => ({ text: w.text, ...w.bbox })))));
}

export const OCR_ENGINE = OEM.LSTM_ONLY;

export const OCR_PARAMS: Partial<WorkerParams> = {
  tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
  preserve_interword_spaces: '1',
};
