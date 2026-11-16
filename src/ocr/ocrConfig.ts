import { OEM, PSM, type WorkerParams } from 'tesseract.js';

export const OCR_ENGINE = OEM.LSTM_ONLY;

export const OCR_PARAMS: Partial<WorkerParams> = {
  tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
  preserve_interword_spaces: '1',
};
