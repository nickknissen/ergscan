import { Decoder, Stream } from '@garmin/fitsdk';
import { hasHeartRate, resample, type WatchRecording, type WatchSample } from './watchHeartRate';
import { isZip, readZipEntry } from './zip';

export type WatchFileProblem = 'noFit' | 'unreadable' | 'noHeartRate';

export class WatchFileError extends Error {
  constructor(readonly problem: WatchFileProblem) {
    super(problem);
  }
}

/**
 * The heart rate and stroke rate recorded in a watch activity: a FIT file, or the ZIP that
 * Garmin Connect's "Export Original" gives, with the FIT file inside.
 */
export async function readWatchFile(bytes: Uint8Array): Promise<WatchRecording> {
  let fit = bytes;
  if (isZip(bytes)) {
    const entry = await readZipEntry(bytes, (name) => name.toLowerCase().endsWith('.fit')).catch(() => {
      throw new WatchFileError('unreadable');
    });
    if (!entry) throw new WatchFileError('noFit');
    fit = entry;
  }

  const decoder = new Decoder(Stream.fromByteArray(fit));
  if (!decoder.isFIT()) throw new WatchFileError('unreadable');
  const { messages, errors } = decoder.read({ convertDateTimesToDates: true });
  const records = (messages.recordMesgs ?? []) as WatchSample[];
  if (errors.length > 0 && records.length === 0) throw new WatchFileError('unreadable');

  const recording = resample(records.filter((r) => r.timestamp instanceof Date));
  if (!recording || !hasHeartRate(recording)) throw new WatchFileError('noHeartRate');
  return recording;
}
