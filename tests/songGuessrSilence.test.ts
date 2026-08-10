import { detectLeadingSilence } from '../src/renderer/src/utils/songGuessr/silence';
import type { AnalyzableAudio } from '../src/renderer/src/utils/songGuessr/silence';

const SAMPLE_RATE = 1000;

type Segment = { seconds: number; amplitude: number; rampTo?: number };

/**
 * Builds samples that alternate between +amplitude and -amplitude, so the RMS
 * of any window equals the amplitude exactly and the expected offsets stay
 * arithmetic instead of approximate.
 */
const buildSamples = (segments: Segment[], sampleRate: number) => {
  const total = segments.reduce(
    (sum, segment) => sum + Math.round(segment.seconds * sampleRate),
    0
  );
  const data = new Float32Array(total);
  let index = 0;

  for (const segment of segments) {
    const count = Math.round(segment.seconds * sampleRate);
    for (let offset = 0; offset < count; offset += 1) {
      const progress = count > 1 ? offset / (count - 1) : 1;
      const amplitude =
        segment.rampTo === undefined
          ? segment.amplitude
          : segment.amplitude + (segment.rampTo - segment.amplitude) * progress;
      data[index] = index % 2 === 0 ? amplitude : -amplitude;
      index += 1;
    }
  }

  return data;
};

const buildAudio = (segments: Segment[], channels = 1, sampleRate = SAMPLE_RATE) => {
  const data = buildSamples(segments, sampleRate);
  return {
    sampleRate,
    duration: data.length / sampleRate,
    numberOfChannels: channels,
    getChannelData: () => data
  } satisfies AnalyzableAudio;
};

const silence = (seconds: number): Segment => ({ seconds, amplitude: 0 });
const music = (seconds: number, amplitude = 0.5): Segment => ({ seconds, amplitude });
/** -70 dBFS: audible as a hiss, nowhere near digital zero. */
const noiseFloor = (seconds: number): Segment => ({ seconds, amplitude: 10 ** (-70 / 20) });
/** One sample of full scale — a bad edit, not the start of the track. */
const click = (sampleRate = SAMPLE_RATE): Segment => ({
  seconds: 1 / sampleRate,
  amplitude: 1
});

describe('SongGuessr leading silence', () => {
  it('trims digital silence at the head of the track', () => {
    const audio = buildAudio([silence(3), music(27)]);
    expect(detectLeadingSilence(audio)).toBeCloseTo(2.96, 2);
  });

  it('trims a low-level noise floor that is not digital silence', () => {
    const audio = buildAudio([noiseFloor(3), music(27)]);
    expect(detectLeadingSilence(audio)).toBeCloseTo(2.96, 2);
  });

  it('ignores a lone click and waits for sustained audio', () => {
    const audio = buildAudio([silence(0.5), click(), silence(3), music(27)]);
    expect(detectLeadingSilence(audio)).toBeCloseTo(3.46, 2);
  });

  it('follows the click when the sustain requirement is removed', () => {
    const audio = buildAudio([silence(0.5), click(), silence(3), music(27)]);
    expect(detectLeadingSilence(audio, { sustainWindows: 1 })).toBeCloseTo(0.46, 2);
  });

  it('starts a fade-in early rather than at full volume', () => {
    const audio = buildAudio([{ seconds: 4, amplitude: 0, rampTo: 0.5 }, music(26)]);
    const offset = detectLeadingSilence(audio);
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(1);
  });

  it('does not trim a track that is loud from the first sample', () => {
    expect(detectLeadingSilence(buildAudio([music(30)]))).toBe(0);
  });

  it('does not trim an entirely silent track', () => {
    expect(detectLeadingSilence(buildAudio([silence(30)]))).toBe(0);
  });

  it('averages channels instead of trusting only the first one', () => {
    const data = buildSamples([silence(3), music(27)], SAMPLE_RATE);
    const quiet = new Float32Array(data.length);
    const audio: AnalyzableAudio = {
      sampleRate: SAMPLE_RATE,
      duration: data.length / SAMPLE_RATE,
      numberOfChannels: 2,
      getChannelData: (channel: number) => (channel === 0 ? quiet : data)
    };
    expect(detectLeadingSilence(audio)).toBeCloseTo(2.96, 2);
  });

  it('refuses to trim more than maxTrimSeconds', () => {
    const audio = buildAudio([silence(35), music(30)]);
    expect(detectLeadingSilence(audio)).toBe(0);
    expect(detectLeadingSilence(audio, { maxTrimSeconds: 60 })).toBeCloseTo(34.96, 2);
  });

  it('refuses to trim when too little audio would remain', () => {
    const audio = buildAudio([silence(3), music(10)]);
    expect(detectLeadingSilence(audio)).toBe(0);
    expect(detectLeadingSilence(audio, { minRemainingSeconds: 1 })).toBeCloseTo(2.96, 2);
  });

  it('respects an overridden absolute floor', () => {
    const audio = buildAudio([noiseFloor(3), music(27)]);
    // A floor below the noise turns that hiss into "the track has started".
    expect(detectLeadingSilence(audio, { absoluteFloorDb: -90, relativeDropDb: 90 })).toBe(0);
  });

  it('survives degenerate buffers without throwing', () => {
    const empty: AnalyzableAudio = {
      sampleRate: SAMPLE_RATE,
      duration: 0,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(0)
    };
    expect(detectLeadingSilence(empty)).toBe(0);

    const noRate: AnalyzableAudio = { ...buildAudio([silence(3), music(27)]), sampleRate: 0 };
    expect(detectLeadingSilence(noRate)).toBe(0);

    const noChannels: AnalyzableAudio = {
      ...buildAudio([silence(3), music(27)]),
      numberOfChannels: 0
    };
    expect(detectLeadingSilence(noChannels)).toBe(0);
  });
});
