import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { store } from '@renderer/store';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { getPerceptualGain } from '../../other/player';

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
  const { toggleSongPlayback } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pausedMainPlayerRef = useRef(false);
  const handledPlaySignalRef = useRef(playSignal);

  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [position, setPosition] = useState(0);

  const cancelAnimationFrameLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const teardownAudio = useCallback(() => {
    cancelAnimationFrameLoop();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    audioRef.current = null;
  }, [cancelAnimationFrameLoop]);

  const finishPlayback = useCallback(() => {
    teardownAudio();
    setPosition(snippetLength);
    setIsPlaying(false);
  }, [snippetLength, teardownAudio]);

  const stopPlayback = useCallback(() => {
    teardownAudio();
    setPosition(0);
    setIsPlaying(false);
  }, [teardownAudio]);

  // The snippet end is enforced on every frame: a bare setTimeout drifts, and
  // `timeupdate` alone fires far too rarely for a 0.1 s rung.
  const trackPosition = useCallback(
    (audio: HTMLAudioElement) => {
      if (audioRef.current !== audio) return;

      const elapsed = audio.currentTime - startOffset;
      if (elapsed >= snippetLength) {
        finishPlayback();
        return;
      }

      setPosition(Math.min(Math.max(elapsed, 0), snippetLength));
      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null;
        trackPosition(audio);
      });
    },
    [finishPlayback, snippetLength, startOffset]
  );

  const playSnippet = useCallback(() => {
    stopPlayback();

    // Audition must never fight the main player, and it never resumes it.
    if (!pausedMainPlayerRef.current) {
      if (store.state.player.isCurrentSongPlaying) toggleSongPlayback();
      pausedMainPlayerRef.current = true;
    }

    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = round.answer.path;
    const { volume } = store.state.player;
    audio.volume = volume.isMuted ? 0 : getPerceptualGain(volume.value);

    const startAt = () => {
      if (audioRef.current !== audio) return;
      if (startOffset > 0 && Math.abs(audio.currentTime - startOffset) > 0.01)
        audio.currentTime = startOffset;
    };

    audioRef.current = audio;
    audio.addEventListener('loadedmetadata', startAt, { once: true });
    audio.addEventListener('timeupdate', () => trackPosition(audio));
    audio.addEventListener('ended', finishPlayback, { once: true });

    setPosition(0);
    setIsPlaying(true);
    setHasPlayed(true);

    audio
      .play()
      .then(startAt)
      .catch(() => {
        if (audioRef.current !== audio) return;
        teardownAudio();
        setPosition(0);
        setIsPlaying(false);
      });
  }, [
    finishPlayback,
    round.answer.path,
    startOffset,
    stopPlayback,
    teardownAudio,
    toggleSongPlayback,
    trackPosition
  ]);

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

  useEffect(() => {
    if (playSignal === handledPlaySignalRef.current) return;
    handledPlaySignalRef.current = playSignal;
    playSnippet();
  }, [playSignal, playSnippet]);

  const playedPercentage = snippetLength > 0 ? Math.min(100, (position / snippetLength) * 100) : 0;
  const nextRung = useMemo(
    () => ladder.find((rung) => rung > snippetLength),
    [ladder, snippetLength]
  );

  const buttonLabel = isPlaying
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
        onClick={playSnippet}
        aria-label={buttonLabel}
        title={buttonLabel}
        className="group mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-font-color-highlight text-background-color-1 shadow-lg transition-transform duration-200 ease-out hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-font-color-highlight-2 active:scale-95 motion-reduce:transition-none dark:bg-dark-font-color-highlight dark:text-dark-background-color-1"
      >
        <span className="material-icons-round text-3xl !leading-none">
          {isPlaying ? 'graphic_eq' : hasPlayed ? 'replay' : 'play_arrow'}
        </span>
      </button>
    </section>
  );
};

export default SongGuessrPlayer;
