import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { getTrackStartOffset } from '../../utils/songGuessr/audioAnalysis';
import {
  SONG_GUESSR_MAX_ATTEMPTS,
  SONG_GUESSR_PANEL_ATTRIBUTE,
  SONG_GUESSR_SNIPPETS
} from '../../utils/songGuessr/constants';
import { isCorrectGuess, formatCandidateLabel } from '../../utils/songGuessr/matching';
import {
  loadSongGuessrState,
  pushRecentSongId,
  saveSongGuessrState
} from '../../utils/songGuessr/persistence';
import { buildShareText } from '../../utils/songGuessr/share';
import { applyRoundResult, createEmptyStats } from '../../utils/songGuessr/stats';
import Dropdown from '../Dropdown';
import SongGuessrAttemptList from './SongGuessrAttemptList';
import SongGuessrGuessInput from './SongGuessrGuessInput';
import SongGuessrPlayer from './SongGuessrPlayer';
import SongGuessrResult from './SongGuessrResult';
import SongGuessrStatsPanel from './SongGuessrStatsPanel';

type SongGuessrPromptProps = {
  onClose?: () => void;
  onMinimize?: () => void;
};

type SongGuessrPhase = 'loading' | 'playing' | 'won' | 'lost' | 'empty';

const COPIED_RESET_MS = 1800;

const SongGuessrPrompt = ({ onClose, onMinimize }: SongGuessrPromptProps) => {
  const { changePromptMenuData, playSong } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const [persistedState, setPersistedState] = useState<SongGuessrPersistedState>(() => {
    try {
      return loadSongGuessrState();
    } catch {
      return { version: 1, stats: createEmptyStats(), poolType: 'library', recentSongIds: [] };
    }
  });
  const [pools, setPools] = useState<SongGuessrPoolOption[]>([]);
  const [round, setRound] = useState<SongGuessrRound>();
  const [phase, setPhase] = useState<SongGuessrPhase>('loading');
  const [attempts, setAttempts] = useState<SongGuessrAttempt[]>([]);
  const [startOffset, setStartOffset] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isActionLocked, setIsActionLocked] = useState(false);
  const [stopSignal, setStopSignal] = useState(0);
  const [playSignal, setPlaySignal] = useState(0);
  const [guessInputKey, setGuessInputKey] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const persistedStateRef = useRef(persistedState);
  /** Read inside the native key handler, which is bound once. */
  const phaseRef = useRef(phase);
  const requestIdRef = useRef(0);
  const committedRoundRef = useRef(false);
  const actionLockedRef = useRef(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const updatePersistedState = useCallback((nextState: SongGuessrPersistedState) => {
    persistedStateRef.current = nextState;
    setPersistedState(nextState);
  }, []);

  const startRound = useCallback(async (state: SongGuessrPersistedState) => {
    const requestId = ++requestIdRef.current;
    actionLockedRef.current = true;
    setIsActionLocked(true);
    setPhase('loading');
    setRound(undefined);
    setAttempts([]);
    setCopied(false);
    setStartOffset(0);
    setGuessInputKey((key) => key + 1);

    try {
      const nextRound = await window.api.songGuessr.getRound({
        poolType: state.poolType,
        poolId: state.poolId,
        excludedSongIds: state.recentSongIds
      });

      if (requestId !== requestIdRef.current) return;
      if (!nextRound) {
        setPhase('empty');
        return;
      }

      committedRoundRef.current = false;
      setRound(nextRound);
      setPhase('playing');

      // Plenty of tracks open on room tone, a fade-in or a run of digital
      // silence, which would waste the whole 0.1 s rung. Finding the real start
      // needs a decode, so it runs alongside the round instead of delaying it.
      setIsAnalyzing(true);
      void getTrackStartOffset(nextRound.answer.songId, nextRound.answer.path)
        .then((offset) => {
          if (requestId !== requestIdRef.current) return;
          setStartOffset(offset);
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setIsAnalyzing(false);
        });
    } catch {
      if (requestId === requestIdRef.current) setPhase('empty');
    } finally {
      if (requestId === requestIdRef.current) {
        actionLockedRef.current = false;
        setIsActionLocked(false);
      }
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    window.api.songGuessr
      .getPools()
      .then((availablePools) => {
        if (isActive) setPools(availablePools);
      })
      .catch(() => {
        if (isActive) setPools([]);
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    void startRound(persistedStateRef.current);

    return () => {
      requestIdRef.current += 1;
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, [startRound]);

  const commitRoundResult = useCallback(
    (won: boolean, attemptIndex: number, roundAttempts: SongGuessrAttempt[]) => {
      if (!round || committedRoundRef.current) return;
      committedRoundRef.current = true;

      const currentState = persistedStateRef.current;
      const nextStats = applyRoundResult(currentState.stats, {
        won,
        attemptIndex,
        at: Date.now(),
        skips: roundAttempts.filter((attempt) => attempt.kind === 'skip').length,
        answer: {
          songId: round.answer.songId,
          title: round.answer.title,
          artists: round.answer.artists
        }
      });
      const nextState = pushRecentSongId(
        { ...currentState, stats: nextStats },
        round.answer.songId
      );
      updatePersistedState(nextState);
      saveSongGuessrState(nextState);
    },
    [round, updatePersistedState]
  );

  const recordAttempt = useCallback(
    (attempt: SongGuessrAttempt, won: boolean) => {
      if (!round || phase !== 'playing' || actionLockedRef.current) return;
      actionLockedRef.current = true;
      setIsActionLocked(true);

      const nextAttempts = [...attempts, attempt];
      setAttempts(nextAttempts);

      if (won || nextAttempts.length >= SONG_GUESSR_MAX_ATTEMPTS) {
        commitRoundResult(won, nextAttempts.length - 1, nextAttempts);
        setStopSignal((signal) => signal + 1);
        setPhase(won ? 'won' : 'lost');
        return;
      }

      setGuessInputKey((key) => key + 1);
      actionLockedRef.current = false;
      setIsActionLocked(false);
    },
    [attempts, commitRoundResult, phase, round]
  );

  const submitGuess = useCallback(
    (candidate: SongGuessrCandidate) => {
      if (!round) return;
      const correct = isCorrectGuess(round.answer, candidate);
      recordAttempt(
        {
          kind: correct ? 'correct' : 'wrong',
          guessSongId: candidate.songId,
          guessLabel: formatCandidateLabel(candidate)
        },
        correct
      );
    },
    [recordAttempt, round]
  );

  const skipGuess = useCallback(() => recordAttempt({ kind: 'skip' }, false), [recordAttempt]);

  const changePool = useCallback(
    (value: string) => {
      const nextPool = pools.find((pool) => `${pool.type}:${pool.id ?? ''}` === value);
      if (!nextPool) return;

      const nextState: SongGuessrPersistedState = {
        ...persistedStateRef.current,
        poolType: nextPool.type,
        ...(nextPool.id ? { poolId: nextPool.id } : { poolId: undefined })
      };
      updatePersistedState(nextState);
      saveSongGuessrState(nextState);
      void startRound(nextState);
    },
    [pools, startRound, updatePersistedState]
  );

  const closePrompt = useCallback(() => {
    setStopSignal((signal) => signal + 1);
    if (onClose) onClose();
    else changePromptMenuData(false);
  }, [changePromptMenuData, onClose]);

  const minimizePrompt = useCallback(() => {
    setStopSignal((signal) => signal + 1);
    onMinimize?.();
  }, [onMinimize]);

  const copyResult = useCallback(async () => {
    if (!round || (phase !== 'won' && phase !== 'lost')) return;

    const shareText = buildShareText(attempts, phase === 'won', t('songGuessr.roundLabel'));
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => {
        copiedTimeoutRef.current = null;
        setCopied(false);
      }, COPIED_RESET_MS);
    } catch {
      setCopied(false);
    }
  }, [attempts, phase, round, t]);

  const nextRound = useCallback(() => {
    if (phase !== 'won' && phase !== 'lost') return;
    void startRound(persistedStateRef.current);
  }, [phase, startRound]);

  const playAnswerInNora = useCallback(() => {
    if (round) playSong(round.answer.songId);
  }, [playSong, round]);

  /*
   * App.tsx binds the global shortcuts (Space = play/pause, Escape = clear
   * selection) on `window` with no guard for text fields, so typing a space in
   * the guess box was un-pausing the main player. Its listener is registered
   * first, so stopImmediatePropagation from another window listener cannot beat
   * it — the event has to die before it reaches window. This is a native
   * listener rather than a React one because the dialog is portalled outside
   * the React root, where synthetic delegation cannot be relied on.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();

      if (phaseRef.current !== 'playing') return;
      if (event.code !== 'Space' || event.ctrlKey || event.altKey || event.metaKey) return;

      const tagName = (event.target as HTMLElement | null)?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'BUTTON') return;

      event.preventDefault();
      setPlaySignal((signal) => signal + 1);
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, []);

  const poolOptions = useMemo(
    () =>
      pools.map((pool) => ({
        value: `${pool.type}:${pool.id ?? ''}`,
        label: pool.type === 'library' ? t('songGuessr.libraryPool') : pool.name
      })),
    [pools, t]
  );

  const selectedPoolValue = `${persistedState.poolType}:${
    persistedState.poolType === 'library' ? '' : (persistedState.poolId ?? '')
  }`;
  const unlockedSnippet =
    SONG_GUESSR_SNIPPETS[Math.min(attempts.length, SONG_GUESSR_SNIPPETS.length - 1)];
  const showResult = phase === 'won' || phase === 'lost';
  const stats = persistedState.stats;

  return (
    <div
      ref={containerRef}
      /* Focusable only from script, and with no ring of its own: the dock parks
         focus here when the panel opens before the guess box exists. */
      tabIndex={-1}
      {...{ [SONG_GUESSR_PANEL_ATTRIBUTE]: '' }}
      className="flex h-full min-h-0 w-full flex-col text-font-color-black outline-none dark:text-font-color-white"
    >
      {/*
        Fixed height, and the streak sits inline as a chip rather than on a
        second line: anything that changes the header's height would shift the
        whole game below it mid-round.
      */}
      <header className="flex h-[4.25rem] flex-shrink-0 items-center gap-3 border-b border-background-color-2 px-6 dark:border-dark-background-color-3">
        {/*
          The icon class sets `display: inline-block`, so the flex centering has
          to live on a wrapper — putting both on one element knocks the glyph
          out of its badge.
        */}
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-font-color-highlight/15 dark:bg-dark-font-color-highlight/15"
          aria-hidden="true"
        >
          <span className="material-icons-round text-xl text-font-color-highlight dark:text-dark-font-color-highlight">
            graphic_eq
          </span>
        </span>

        {/*
          Title only. The streak lives down by the attempt dots instead: the
          header has a hard width budget (icon + title + pool + two buttons),
          and a chip squeezed in here was getting clipped in half.
        */}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold leading-tight tracking-tight">
          {t('songGuessr.promptTitle')}
        </h1>

        {poolOptions.length > 0 && (
          <Dropdown
            name="song-guessr-pool"
            value={selectedPoolValue}
            options={poolOptions}
            onChange={(event) => changePool(event.target.value)}
            className="!ml-0 h-9 w-32 flex-shrink-0 !rounded-xl border-2 px-2 text-xs sm:w-40"
            isDisabled={phase === 'loading'}
          />
        )}

        {onMinimize && (
          <button
            type="button"
            onClick={minimizePrompt}
            aria-label={t('songGuessr.minimize')}
            title={t('songGuessr.minimize')}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl opacity-55 transition-[background-color,opacity] duration-200 hover:bg-background-color-2 hover:opacity-100 motion-reduce:transition-none dark:hover:bg-dark-background-color-3/15"
          >
            <span className="material-icons-round text-xl !leading-none">minimize</span>
          </button>
        )}

        <button
          type="button"
          onClick={closePrompt}
          aria-label={t('songGuessr.close')}
          title={t('songGuessr.close')}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl opacity-55 transition-[background-color,opacity] duration-200 hover:bg-background-color-2 hover:opacity-100 motion-reduce:transition-none dark:hover:bg-dark-background-color-3/15"
        >
          <span className="material-icons-round text-xl !leading-none">close</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
        {phase === 'loading' && (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
            <span
              className="material-icons-round mb-3 animate-spin text-3xl text-font-color-highlight motion-reduce:animate-none dark:text-dark-font-color-highlight"
              aria-hidden="true"
            >
              progress_activity
            </span>
            <p className="text-sm opacity-60">{t('songGuessr.loading')}</p>
          </div>
        )}

        {phase === 'empty' && (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
            <span
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-background-color-2/60 dark:bg-dark-background-color-2/60"
              aria-hidden="true"
            >
              <span className="material-icons-round text-3xl opacity-50">library_music</span>
            </span>
            <h2 className="text-lg font-semibold">{t('songGuessr.noRound')}</h2>
            <p className="mt-2 max-w-sm text-sm opacity-60">{t('songGuessr.noRoundHint')}</p>
            <button
              type="button"
              onClick={() => void startRound(persistedStateRef.current)}
              className="mt-5 flex h-10 items-center gap-1.5 rounded-xl bg-background-color-2/80 px-4 text-sm font-medium transition-colors duration-200 hover:bg-background-color-3 motion-reduce:transition-none dark:bg-dark-background-color-2/80 dark:hover:bg-dark-background-color-3/15"
            >
              <span className="material-icons-round text-base !leading-none" aria-hidden="true">
                refresh
              </span>
              {t('songGuessr.tryAgain')}
            </button>
          </div>
        )}

        {round && phase === 'playing' && (
          <div className="flex min-h-0 flex-1 flex-col gap-5">
            <div className="flex-shrink-0">
              <SongGuessrPlayer
                round={round}
                snippetLength={unlockedSnippet}
                ladder={SONG_GUESSR_SNIPPETS}
                startOffset={startOffset}
                stopSignal={stopSignal}
                playSignal={playSignal}
                isAnalyzing={isAnalyzing}
              />
            </div>

            {/* Equal side columns keep the dots optically centred no matter
                whether the streak chip is showing. */}
            <div className="flex flex-shrink-0 items-center">
              <div className="flex-1" />
              <SongGuessrAttemptList
                attempts={attempts}
                maxAttempts={SONG_GUESSR_MAX_ATTEMPTS}
                variant="dots"
              />
              <div className="flex flex-1 justify-end">
                {stats.currentStreak > 0 && (
                  <span
                    className="flex items-center gap-0.5 rounded-full bg-font-color-highlight/15 py-0.5 pl-1 pr-2 text-xs font-semibold text-font-color-highlight dark:bg-dark-font-color-highlight/15 dark:text-dark-font-color-highlight"
                    title={t('songGuessr.streakChip', { count: stats.currentStreak })}
                  >
                    <span className="material-icons-round text-sm !leading-none" aria-hidden="true">
                      local_fire_department
                    </span>
                    {stats.currentStreak}
                  </span>
                )}
              </div>
            </div>

            {/* The log is handed to the input so it can share one fixed area
                with the suggestion overlay and keep the buttons still. */}
            <SongGuessrGuessInput
              key={guessInputKey}
              disabled={isActionLocked}
              onSubmit={submitGuess}
              onSkip={skipGuess}
              attemptsLeft={SONG_GUESSR_MAX_ATTEMPTS - attempts.length}
            >
              <SongGuessrAttemptList
                attempts={attempts}
                maxAttempts={SONG_GUESSR_MAX_ATTEMPTS}
                variant="log"
              />
            </SongGuessrGuessInput>
          </div>
        )}

        {round && showResult && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <SongGuessrResult
              round={round}
              attempts={attempts}
              won={phase === 'won'}
              copied={copied}
              onCopy={() => void copyResult()}
              onNextRound={nextRound}
              onPlayInNora={playAnswerInNora}
            />
            <SongGuessrStatsPanel
              stats={stats}
              highlightAttempt={phase === 'won' ? attempts.length - 1 : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default SongGuessrPrompt;
