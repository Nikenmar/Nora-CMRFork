import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@tanstack/react-store';

import { store } from '@renderer/store';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { getPerceptualGain } from '../../other/player';
import {
  applySnippetEnvelope,
  buildSnippetEnvelope,
  canDeclick,
  connectDeclickChain,
  disableDeclick,
  STOP_EPSILON_SECONDS,
  type DeclickChain
} from '../../utils/songGuessr/declick';
import VolumeSlider from '../VolumeSlider';

type SongGuessrPlayerProps = {
  round: SongGuessrRound;
  /** Seconds of the track unlocked so far. */
  snippetLength: number;
  /** Every rung, drawn as the pip row above the bar. */
  ladder: readonly number[];
  /** Where the audible part of the track begins. */
  startOffset: number;
  /** Bumped by the parent to force playback to stop. */
  stopSignal: number;
  /** Bumped by the parent (space bar) to request playback. */
  playSignal: number;
  isAnalyzing?: boolean;
};

const EQUALIZER_BARS = [0, 1, 2, 3, 4];
/** At rest the bars keep a waveform silhouette; equal heights read as dots. */
const IDLE_BAR_SCALES = [0.35, 0.62, 0.45, 0.72, 0.4];

/** Deterministic wobble so the bars move with playback without a CSS keyframe. */
const getBarScale = (index: number, position: number, isPlaying: boolean) => {
  if (!isPlaying) return IDLE_BAR_SCALES[index] ?? 0.4;
  const wave = Math.sin(position * 11 + index * 1.7) + Math.sin(position * 5.3 + index * 0.9);
  return 0.3 + Math.abs(wave) * 0.32;
};

const SongGuessrPlayer = (props: SongGuessrPlayerProps) => {
  const { round, snippetLength, ladder, startOffset, stopSignal, playSignal } = props;
  const { isAnalyzing } = props;
  const { toggleSongPlayback, toggleMutedState } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  // The snippet has no volume of its own: it is the main player's, so a level
  // set here is the level the answer plays back at afterwards.
  const volume = useStore(store, (state) => state.player.volume.value);
  const isMuted = useStore(store, (state) => state.player.volume.isMuted);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const declickChainRef = useRef<DeclickChain | undefined>(undefined);
  const animationFrameRef = useRef<number | null>(null);
  const deadlineTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedMainPlayerRef = useRef(false);
  const handledPlaySignalRef = useRef(playSignal);
  /** Where the current play actually began, in file seconds. */
  const playheadOriginRef = useRef(0);
  /** A press that arrived while the start offset was still being measured. */
  const pendingPlayRef = useRef(false);
  /** Lets the CORS fallback replay through the callback that owns it. */
  const playFromOffsetRef = useRef<((offset: number) => void) | undefined>(undefined);
  const startOffsetRef = useRef(startOffset);
  const isAnalyzingRef = useRef(isAnalyzing);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    startOffsetRef.current = startOffset;
    isAnalyzingRef.current = !!isAnalyzing;
  }, [isAnalyzing, startOffset]);

  const cancelAnimationFrameLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const clearDeadline = useCallback(() => {
    if (deadlineTimeoutRef.current !== null) {
      clearTimeout(deadlineTimeoutRef.current);
      deadlineTimeoutRef.current = null;
    }
  }, []);

  const teardownAudio = useCallback(() => {
    cancelAnimationFrameLoop();
    clearDeadline();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    // The element is done for good — once it has been through
    // createMediaElementSource its audio can never leave the graph again.
    declickChainRef.current?.disconnect();
    declickChainRef.current = undefined;
    audioRef.current = null;
  }, [cancelAnimationFrameLoop, clearDeadline]);

  const finishPlayback = useCallback(() => {
    teardownAudio();
    setPosition(snippetLength);
    setIsPlaying(false);
    setIsPreparing(false);
  }, [snippetLength, teardownAudio]);

  const stopPlayback = useCallback(() => {
    pendingPlayRef.current = false;
    teardownAudio();
    setPosition(0);
    setIsPlaying(false);
    setIsPreparing(false);
  }, [teardownAudio]);

  /*
    One loop per play, started when the element reports it is actually making
    sound. The old code hung a fresh recursive rAF chain off every `timeupdate`,
    so four overlapping chains fought over the same handle and the bar jittered
    against what was audible.
  */
  const startProgressLoop = useCallback(
    (audio: HTMLAudioElement) => {
      cancelAnimationFrameLoop();

      const step = () => {
        animationFrameRef.current = null;
        if (audioRef.current !== audio) return;

        // Only draws. Stopping is the deadline timer's job now — the loop
        // ending the play at the rung would cut the fade-out tail off with it.
        const elapsed = audio.currentTime - playheadOriginRef.current;
        setPosition(Math.min(Math.max(elapsed, 0), snippetLength));
        animationFrameRef.current = window.requestAnimationFrame(step);
      };

      animationFrameRef.current = window.requestAnimationFrame(step);
    },
    [cancelAnimationFrameLoop, snippetLength]
  );

  const playFromOffset = useCallback(
    (offset: number) => {
      stopPlayback();

      // Audition must never fight the main player, and it never resumes it.
      if (!pausedMainPlayerRef.current) {
        if (store.state.player.isCurrentSongPlaying) toggleSongPlayback();
        pausedMainPlayerRef.current = true;
      }

      const envelope = buildSnippetEnvelope(offset, snippetLength);
      const audio = new Audio();
      audio.preload = 'auto';

      /*
        The graph is built, and CORS asked for, BEFORE the source is set:
        Chromium mutes a Web Audio graph fed by cross-origin media, and
        `nora://` is a different origin from the renderer. Asking for CORS
        turns a refusal into a load error — handled below by dropping the fade
        and replaying — rather than a snippet that plays dead silent.
      */
      const chain = canDeclick() ? connectDeclickChain(audio) : undefined;
      declickChainRef.current = chain;
      if (chain) audio.crossOrigin = 'anonymous';

      audio.src = round.answer.path;
      const { volume } = store.state.player;
      audio.volume = volume.isMuted ? 0 : getPerceptualGain(volume.value);

      audioRef.current = audio;
      playheadOriginRef.current = offset;
      setPosition(0);
      setIsPlaying(false);
      setIsPreparing(true);
      setHasPlayed(true);

      const abandon = () => {
        if (audioRef.current !== audio) return;
        teardownAudio();
        setPosition(0);
        setIsPlaying(false);
        setIsPreparing(false);
      };

      const onFailedToLoad = () => {
        if (audioRef.current !== audio) return;
        // Only a CORS refusal is worth a second try: drop the fade for the rest
        // of the session and play the snippet the plain way.
        if (!chain) return abandon();
        disableDeclick();
        teardownAudio();
        playFromOffsetRef.current?.(offset);
        return undefined;
      };

      const start = () => {
        if (audioRef.current !== audio) return;
        // The landing point of a seek is not exactly what was asked for, and
        // both the bar and the envelope are measured from real audio time.
        playheadOriginRef.current = audio.currentTime + envelope.leadIn;
        audio.play().catch(abandon);
      };

      /*
        Seek BEFORE the first sample is heard. Calling play() straight away and
        correcting on `loadedmetadata` meant every snippet opened with a slice
        of the file's beginning — inaudible on a 12 s rung, the entire snippet
        on a 0.1 s one — while the bar, measured from the intended offset, sat
        at zero through all of it.
      */
      const seekThenStart = () => {
        if (audioRef.current !== audio) return;
        if (envelope.startAt > 0 && Math.abs(audio.currentTime - envelope.startAt) > 0.01) {
          audio.addEventListener('seeked', start, { once: true });
          audio.currentTime = envelope.startAt;
        } else start();
      };

      const onPlaying = () => {
        if (audioRef.current !== audio) return;
        setIsPreparing(false);
        setIsPlaying(true);
        startProgressLoop(audio);

        if (chain) applySnippetEnvelope(chain, envelope);

        /*
          A frame is 16 ms — 16% of the 0.1 s rung — so the cut gets its own
          timer rather than waiting for the draw loop to notice it overshot.
          With a fade it runs past the rung by the length of the tail, so the
          element is always paused into silence instead of mid-waveform.
        */
        clearDeadline();
        const stopAfter = chain
          ? envelope.duration + STOP_EPSILON_SECONDS
          : envelope.leadIn + snippetLength;
        deadlineTimeoutRef.current = setTimeout(finishPlayback, stopAfter * 1000);
      };

      audio.addEventListener('loadedmetadata', seekThenStart, { once: true });
      audio.addEventListener('playing', onPlaying, { once: true });
      audio.addEventListener('ended', finishPlayback, { once: true });
      audio.addEventListener('error', onFailedToLoad, { once: true });
    },
    [
      clearDeadline,
      finishPlayback,
      round.answer.path,
      snippetLength,
      startProgressLoop,
      stopPlayback,
      teardownAudio,
      toggleSongPlayback
    ]
  );

  useEffect(() => {
    playFromOffsetRef.current = playFromOffset;
  }, [playFromOffset]);

  /*
    Pressing play while the leading-silence analysis is still running used to
    audition from 0, and the next press — now holding the discovered offset —
    played a completely different part of the track. The press waits instead.
  */
  const requestPlay = useCallback(() => {
    if (isAnalyzingRef.current) {
      pendingPlayRef.current = true;
      setHasPlayed(true);
      setIsPreparing(true);
      return;
    }
    playFromOffset(startOffsetRef.current);
  }, [playFromOffset]);

  useEffect(() => {
    if (isAnalyzing || !pendingPlayRef.current) return;
    pendingPlayRef.current = false;
    playFromOffset(startOffset);
  }, [isAnalyzing, playFromOffset, startOffset]);

  // A new track resets everything, including the main-player courtesy pause.
  useEffect(() => {
    pausedMainPlayerRef.current = false;
    setHasPlayed(false);
    stopPlayback();
    return () => teardownAudio();
  }, [round.answer.songId, stopPlayback, teardownAudio]);

  useEffect(() => {
    stopPlayback();
  }, [snippetLength, stopSignal, stopPlayback]);

  // The element reads the level once, when the snippet starts. Dragging the
  // slider mid-snippet has to be audible right then, not on the next replay.
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = isMuted ? 0 : getPerceptualGain(volume);
  }, [isMuted, volume]);

  useEffect(() => {
    if (playSignal === handledPlaySignalRef.current) return;
    handledPlaySignalRef.current = playSignal;
    requestPlay();
  }, [playSignal, requestPlay]);

  const playedPercentage = snippetLength > 0 ? Math.min(100, (position / snippetLength) * 100) : 0;
  const nextRung = useMemo(
    () => ladder.find((rung) => rung > snippetLength),
    [ladder, snippetLength]
  );

  const buttonLabel = isPreparing
    ? t('songGuessr.preparing')
    : isPlaying
      ? t('songGuessr.playing')
      : hasPlayed
        ? t('songGuessr.replaySnippet')
        : t('songGuessr.playSnippet');

  return (
    <section className="flex flex-col items-center">
      {/* The disc stands in for the artwork we are not allowed to show yet. */}
      <div className="relative flex h-28 w-28 items-center justify-center">
        <div
          className={`absolute inset-0 rounded-full bg-font-color-highlight/10 blur-2xl transition-opacity duration-500 dark:bg-dark-font-color-highlight/10 ${
            isPlaying ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden="true"
        />
        <div
          className={`absolute inset-0 rounded-full border border-background-color-3 bg-gradient-to-br from-background-color-2 to-background-color-3 shadow-lg dark:border-dark-background-color-3/20 dark:from-dark-background-color-2 dark:to-dark-background-color-1 ${
            isPlaying ? 'animate-spin motion-reduce:animate-none' : ''
          }`}
          style={{ animationDuration: '9s' }}
          aria-hidden="true"
        >
          {/* Grooves: a light hairline in dark mode, a darker one on white. */}
          <span className="dark:border-dark-background-color-3/12 absolute inset-4 rounded-full border border-background-color-3/70" />
          <span className="dark:border-dark-background-color-3/8 absolute inset-8 rounded-full border border-background-color-3/50" />
          <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background-color-1 dark:bg-dark-background-color-3/25" />
        </div>

        <div className="relative flex h-10 items-end gap-1" aria-hidden="true">
          {EQUALIZER_BARS.map((bar) => (
            <span
              key={bar}
              className="w-1.5 rounded-full bg-font-color-highlight transition-[height] duration-100 ease-out dark:bg-dark-font-color-highlight"
              style={{ height: `${getBarScale(bar, position, isPlaying) * 100}%` }}
            />
          ))}
        </div>
      </div>

      <div className="mt-6 w-full">
        {/* One pip per rung: how far up the ladder this round has climbed. */}
        <div className="mb-2 flex items-center gap-1" aria-hidden="true">
          {ladder.map((rung) => (
            <span
              key={rung}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none ${
                rung <= snippetLength
                  ? 'bg-font-color-highlight dark:bg-dark-font-color-highlight'
                  : 'bg-seekbar-track-background-color dark:bg-dark-seekbar-track-background-color'
              }`}
            />
          ))}
        </div>

        {/*
          Scaled to the CURRENT rung, not to the 12 s maximum: against the full
          ladder a 0.1 s snippet fills under one percent of the bar and reads as
          broken. Here the playhead always crosses the whole width.
        */}
        <div
          className="relative h-2.5 w-full overflow-hidden rounded-full bg-seekbar-track-background-color dark:bg-dark-seekbar-track-background-color"
          role="progressbar"
          aria-label={t('songGuessr.snippetProgress')}
          aria-valuemin={0}
          aria-valuemax={snippetLength}
          aria-valuenow={Number(position.toFixed(1))}
          aria-valuetext={t('songGuessr.seconds', { seconds: position.toFixed(1) })}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-font-color-highlight dark:bg-dark-font-color-highlight"
            style={{ width: `${playedPercentage}%` }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="font-semibold tabular-nums text-font-color-highlight dark:text-dark-font-color-highlight">
            {position.toFixed(1)}s / {snippetLength}s
          </span>
          {isAnalyzing ? (
            <span className="opacity-45">{t('songGuessr.analyzing')}</span>
          ) : nextRung ? (
            <span className="opacity-45">{t('songGuessr.nextUnlock', { seconds: nextRung })}</span>
          ) : (
            <span className="opacity-45">{t('songGuessr.lastRung')}</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={requestPlay}
        aria-label={buttonLabel}
        title={buttonLabel}
        className="group mt-5 flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-font-color-highlight/60 bg-background-color-2/25 text-font-color-highlight transition-[border-color,background-color,transform] duration-200 ease-in-out hover:scale-105 hover:border-font-color-highlight hover:bg-background-color-2/50 focus-visible:!border-font-color-highlight-2 active:scale-95 motion-reduce:transition-none dark:border-dark-font-color-highlight/60 dark:bg-dark-background-color-2/25 dark:text-dark-font-color-highlight dark:hover:border-dark-font-color-highlight dark:hover:bg-dark-background-color-2/50 dark:focus-visible:!border-dark-font-color-highlight-2"
      >
        {/* Spinning while it loads, seeks or waits out the silence analysis:
            the button has to say "not yet", or the bar sitting at 0.0s while
            nothing is audible reads as a broken snippet. */}
        <span
          className={`material-icons-round text-3xl !leading-none ${
            isPreparing ? 'animate-spin motion-reduce:animate-none' : ''
          }`}
        >
          {isPreparing
            ? 'progress_activity'
            : isPlaying
              ? 'graphic_eq'
              : hasPlayed
                ? 'replay'
                : 'play_arrow'}
        </span>
      </button>

      {/* A fixed-height row like everything else in the dialog, and a tight one:
          every pixel here comes out of the attempt log below. The readout is
          tabular in a reserved box, so 7% and 100% cannot nudge the slider
          around while the user drags it. */}
      <div className="mt-3 flex h-7 w-full max-w-xs items-center gap-2">
        <button
          type="button"
          onClick={() => toggleMutedState(!isMuted)}
          aria-label={t('songGuessr.muteUnmute')}
          title={t('songGuessr.muteUnmute')}
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-[background-color,opacity] duration-200 hover:bg-background-color-2 motion-reduce:transition-none dark:hover:bg-dark-background-color-3/15 ${
            isMuted
              ? 'text-font-color-highlight opacity-100 dark:text-dark-font-color-highlight'
              : 'opacity-55 hover:opacity-100'
          }`}
        >
          <span className="material-icons-round text-lg !leading-none">
            {isMuted ? 'volume_off' : volume > 50 ? 'volume_up' : 'volume_down_alt'}
          </span>
        </button>

        <div className={`flex min-w-0 flex-1 items-center ${isMuted ? 'opacity-40' : ''}`}>
          <VolumeSlider name="song-guessr-volume-slider" id="songGuessrVolumeSlider" />
        </div>

        <span className="w-8 flex-shrink-0 text-right text-xs tabular-nums opacity-45">
          {Math.round(volume)}
        </span>
      </div>
    </section>
  );
};

export default SongGuessrPlayer;
