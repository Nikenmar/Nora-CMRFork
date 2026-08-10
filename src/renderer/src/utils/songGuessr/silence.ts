// Finds where a track actually starts.
//
// A lot of files open with something that is quiet but not empty: room tone, a
// tape or vinyl noise floor, a slow fade-in, a stray click from a bad edit. A
// plain "first non-zero sample" test trips over all of them and a fixed dBFS
// gate is wrong for quiet masters, so the threshold here is derived from the
// track's own loudness and only backed by an absolute floor.

export type AnalyzableAudio = {
  sampleRate: number;
  duration: number;
  numberOfChannels: number;
  getChannelData: (channel: number) => Float32Array;
};

export type LeadingSilenceOptions = {
  /** RMS window size. 20 ms is short enough to place the start precisely. */
  windowSeconds?: number;
  /** How far into the track to look before giving up. */
  scanSeconds?: number;
  /** How far below the loudest window still counts as silence. */
  relativeDropDb?: number;
  /** Absolute gate, so a track that is quiet all through is not "all music". */
  absoluteFloorDb?: number;
  /** Consecutive loud windows required — this is what ignores clicks and pops. */
  sustainWindows?: number;
  /** Kept before the detected start so the attack is not clipped. */
  preRollSeconds?: number;
  /** Never skip more than this. */
  maxTrimSeconds?: number;
  /** Never trim a track down to less than this. */
  minRemainingSeconds?: number;
};

const DEFAULT_OPTIONS = {
  windowSeconds: 0.02,
  scanSeconds: 45,
  relativeDropDb: 32,
  absoluteFloorDb: -55,
  sustainWindows: 4,
  preRollSeconds: 0.04,
  maxTrimSeconds: 30,
  minRemainingSeconds: 20
};

/** Treat anything below this as digital silence. */
const SILENT_PEAK_EPSILON = 1e-6;

const dbToGain = (db: number) => 10 ** (db / 20);

const collectChannels = (audio: AnalyzableAudio, channelCount: number) => {
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < channelCount; channel += 1) {
    const data = audio.getChannelData(channel);
    if (data && data.length > 0) channels.push(data);
  }
  return channels;
};

/**
 * Returns the offset in seconds where the audible part of the track begins, or
 * 0 when nothing should be trimmed. Never throws — a bad buffer just means "no
 * trim", because guessing wrong here is worse than not trimming at all.
 */
export const detectLeadingSilence = (
  audio: AnalyzableAudio,
  options: LeadingSilenceOptions = {}
): number => {
  try {
    if (!audio || typeof audio.getChannelData !== 'function') return 0;

    const {
      windowSeconds,
      scanSeconds,
      relativeDropDb,
      absoluteFloorDb,
      sustainWindows,
      preRollSeconds,
      maxTrimSeconds,
      minRemainingSeconds
    } = { ...DEFAULT_OPTIONS, ...options };

    const { sampleRate, numberOfChannels } = audio;
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) return 0;
    if (!Number.isFinite(numberOfChannels) || numberOfChannels < 1) return 0;
    if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) return 0;

    const channels = collectChannels(audio, numberOfChannels);
    if (channels.length === 0) return 0;

    const sampleCount = channels.reduce(
      (shortest, channel) => Math.min(shortest, channel.length),
      Number.POSITIVE_INFINITY
    );
    if (!Number.isFinite(sampleCount) || sampleCount <= 0) return 0;

    const windowSamples = Math.max(1, Math.round(windowSeconds * sampleRate));
    const scanSamples = Math.min(sampleCount, Math.max(windowSamples, scanSeconds * sampleRate));
    const windowCount = Math.floor(scanSamples / windowSamples);
    if (windowCount < 1) return 0;

    const windowRms = new Float64Array(windowCount);
    let peak = 0;

    for (let index = 0; index < windowCount; index += 1) {
      const start = index * windowSamples;
      const end = start + windowSamples;
      let sum = 0;

      for (let sample = start; sample < end; sample += 1) {
        let mixed = 0;
        for (let channel = 0; channel < channels.length; channel += 1)
          mixed += channels[channel][sample] ?? 0;
        mixed /= channels.length;
        sum += mixed * mixed;
      }

      const rms = Math.sqrt(sum / windowSamples);
      windowRms[index] = rms;
      if (rms > peak) peak = rms;
    }

    if (peak <= SILENT_PEAK_EPSILON) return 0;

    const threshold = Math.max(peak * dbToGain(-relativeDropDb), dbToGain(absoluteFloorDb));
    const requiredRun = Math.max(1, Math.round(sustainWindows));

    let firstLoudWindow = -1;
    let run = 0;
    for (let index = 0; index < windowCount; index += 1) {
      if (windowRms[index] >= threshold) {
        run += 1;
        if (run >= requiredRun) {
          firstLoudWindow = index - requiredRun + 1;
          break;
        }
      } else {
        run = 0;
      }
    }

    // Not found at all, or the music was already playing at 0:00.
    if (firstLoudWindow <= 0) return 0;

    const offset = firstLoudWindow * windowSeconds - preRollSeconds;
    if (offset <= 0) return 0;
    if (offset > maxTrimSeconds) return 0;

    const duration =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : sampleCount / sampleRate;
    if (duration - offset < minRemainingSeconds) return 0;

    return offset;
  } catch {
    return 0;
  }
};
