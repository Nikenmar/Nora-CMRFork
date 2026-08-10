import { detectLeadingSilence } from './silence';

// Decoding happens in the renderer through the Web Audio API: Chromium already
// decodes every format the library can hold, so this needs no dependency and no
// main-process work. The offset is cached per song because a round can be
// replayed and the answer can come back around.

const CACHE_LIMIT = 200;
const ANALYSIS_TIMEOUT_MS = 6000;
/**
 * Analysis only needs a loudness envelope, so decoding at 8 kHz is plenty and
 * keeps the decoded buffer roughly five times smaller than the source rate.
 */
const ANALYSIS_SAMPLE_RATE = 8000;

const offsetCache = new Map<string, number>();
const inFlightRequests = new Map<string, Promise<number>>();

const rememberOffset = (songId: string, offset: number) => {
  offsetCache.set(songId, offset);
  if (offsetCache.size > CACHE_LIMIT) {
    const oldest = offsetCache.keys().next();
    if (!oldest.done) offsetCache.delete(oldest.value);
  }
  return offset;
};

const decodeAndMeasure = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) return 0;

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0) return 0;

  const context = new OfflineAudioContext(1, 1, ANALYSIS_SAMPLE_RATE);
  const buffer = await context.decodeAudioData(bytes);
  return detectLeadingSilence(buffer);
};

/**
 * Seconds of leading silence to skip for this track. Resolves to 0 on any
 * failure or timeout, so playback is never blocked by the analysis.
 */
export const getTrackStartOffset = (songId: string, url: string): Promise<number> => {
  const cached = offsetCache.get(songId);
  if (cached !== undefined) return Promise.resolve(cached);

  const inFlight = inFlightRequests.get(songId);
  if (inFlight) return inFlight;

  let didComplete = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const analysis = decodeAndMeasure(url)
    .catch(() => 0)
    .then((offset) => {
      didComplete = true;
      return offset;
    });

  const timeout = new Promise<number>((resolve) => {
    timeoutId = setTimeout(() => resolve(0), ANALYSIS_TIMEOUT_MS);
  });

  const request = Promise.race([analysis, timeout])
    .catch(() => 0)
    .then((offset) => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      inFlightRequests.delete(songId);

      const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
      // A timeout is not a result — leave it uncached so a later round can retry.
      return didComplete ? rememberOffset(songId, safeOffset) : safeOffset;
    });

  inFlightRequests.set(songId, request);
  return request;
};

export const clearTrackStartOffsetCache = () => {
  offsetCache.clear();
  inFlightRequests.clear();
};
