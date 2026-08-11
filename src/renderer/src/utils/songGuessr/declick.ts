// Cutting a snippet dead at an arbitrary sample is a step from that sample's
// value straight to zero — the click you hear when a stop misses a zero
// crossing. The cure is a short gain ramp at both ends, and the constraint is
// that it must not eat the snippet: on the 0.1 s rung an 8 ms fade would be 8%
// of everything the player gets to hear.
//
// So the ramps live OUTSIDE the rung. Playback starts a lead-in earlier than
// the snippet and reaches full level exactly on its first sample, and the
// fade-out begins exactly on its last one, running into a tail of track the
// rung was never going to include. Every sample of the rung plays at full gain.

export const FADE_IN_SECONDS = 0.008;
export const FADE_OUT_SECONDS = 0.015;
/** Stop a hair after the ramp so the element is always cut in silence. */
export const STOP_EPSILON_SECONDS = 0.005;

export type SnippetEnvelope = {
  /** Seconds of track played before the snippet proper, at rising gain. */
  leadIn: number;
  /** Seconds spent ramping up; equals `leadIn` unless there was no room. */
  rampIn: number;
  /** When the fade-out starts, relative to playback start. */
  fadeOutAt: number;
  /** Total seconds of playback, ramps included. */
  duration: number;
  /** Where to seek: the snippet start minus whatever lead-in there was room for. */
  startAt: number;
};

/**
 * Pure geometry of one snippet play. `offset` is where the audible part of the
 * track begins; a track that starts inside the first few milliseconds simply
 * has no room for a lead-in, and there the ramp has to happen inside the rung.
 */
export const buildSnippetEnvelope = (offset: number, snippetLength: number): SnippetEnvelope => {
  const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const safeLength = Number.isFinite(snippetLength) && snippetLength > 0 ? snippetLength : 0;
  const leadIn = Math.min(FADE_IN_SECONDS, safeOffset);
  const rampIn = leadIn > 0 ? leadIn : Math.min(FADE_IN_SECONDS, safeLength);

  return {
    leadIn,
    rampIn,
    fadeOutAt: leadIn + safeLength,
    duration: leadIn + safeLength + FADE_OUT_SECONDS,
    startAt: safeOffset - leadIn
  };
};

export type DeclickChain = {
  context: AudioContext;
  gain: GainNode;
  disconnect: () => void;
};

/*
  One context for the whole document: Chromium caps how many a page may hold,
  and a dialog that is opened and closed all evening would burn through them.
*/
let sharedContext: AudioContext | undefined;
let isDeclickAvailable = true;

export const canDeclick = () => isDeclickAvailable;

/**
 * Called when an element refuses to load as CORS: without a clean source the
 * graph would output silence, so the game drops back to plain playback and
 * simply lives with the click.
 */
export const disableDeclick = () => {
  isDeclickAvailable = false;
};

export const connectDeclickChain = (audio: HTMLAudioElement): DeclickChain | undefined => {
  if (!isDeclickAvailable) return undefined;

  try {
    if (!sharedContext) sharedContext = new AudioContext();
    const context = sharedContext;
    void context.resume();

    // An element can be handed to createMediaElementSource once, and from then
    // on its audio ONLY reaches the speakers through this graph.
    const source = context.createMediaElementSource(audio);
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(context.destination);

    return {
      context,
      gain,
      disconnect: () => {
        try {
          source.disconnect();
          gain.disconnect();
        } catch {
          // A graph torn down twice is not worth reporting.
        }
      }
    };
  } catch {
    isDeclickAvailable = false;
    return undefined;
  }
};

/** Schedules the ramps against the audio clock, starting now. */
export const applySnippetEnvelope = (chain: DeclickChain, envelope: SnippetEnvelope) => {
  const { context, gain } = chain;
  const now = context.currentTime;

  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + Math.max(envelope.rampIn, 0.001));
  gain.gain.setValueAtTime(1, now + envelope.fadeOutAt);
  gain.gain.linearRampToValueAtTime(0, now + envelope.duration);
};
