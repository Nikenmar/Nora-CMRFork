import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { store } from '@renderer/store';
import { getPerceptualGain } from '../../other/player';
import storage from '../../utils/localStorage';

import Button from '../Button';
import DuelCard from './DuelCard';

type DuelPhase = 'voting' | 'submitting' | 'result';

type EloDuelPromptProps = {
  initialPair: DuelPair;
  queuedDuels?: number;
  onClose?: () => void;
  onMinimize?: () => void;
};

const EloDuelPrompt = (props: EloDuelPromptProps) => {
  const { changePromptMenuData, toggleSongPlayback } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const { initialPair, queuedDuels, onClose, onMinimize } = props;

  const persistedQueuedDuels = Math.max(0, queuedDuels ?? 0);
  const [pair, setPair] = useState<DuelPair>(initialPair);
  const [phase, setPhase] = useState<DuelPhase>('voting');
  const [result, setResult] = useState<DuelResult>();
  const [winnerSongId, setWinnerSongId] = useState<string>();
  const [previewingSongId, setPreviewingSongId] = useState<string>();
  const [remainingQueuedDuels, setRemainingQueuedDuels] = useState(persistedQueuedDuels);
  const [showNextRetry, setShowNextRetry] = useState(false);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const remainingQueuedDuelsRef = useRef(persistedQueuedDuels);
  const actionLockedRef = useRef(false);
  const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.removeAttribute('src');
      previewAudioRef.current = null;
    }
    setPreviewingSongId(undefined);
  }, []);

  // Release the preview audio on unmount — it must never outlive the prompt.
  // Avoid calling setState from the cleanup path.
  useEffect(
    () => () => {
      if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current);
      previewAudioRef.current?.pause();
      previewAudioRef.current?.removeAttribute('src');
      previewAudioRef.current = null;
    },
    []
  );

  // The dock can already hold a minimized manual session when a new automatic
  // duel arrives. Keep that existing prompt attached to the persisted backlog
  // instead of freezing the queue size from the session's first render.
  useEffect(() => {
    remainingQueuedDuelsRef.current = persistedQueuedDuels;
    setRemainingQueuedDuels(persistedQueuedDuels);
  }, [persistedQueuedDuels]);

  const togglePreview = useCallback(
    (entry: DuelSongEntry) => {
      if (previewingSongId === entry.songId) {
        stopPreview();
        return;
      }
      stopPreview();
      // Pause the main player while auditioning; do NOT auto-resume.
      if (store.state.player.isCurrentSongPlaying) toggleSongPlayback();

      // Isolated preview element — the main player/queue is never touched.
      const audio = new Audio();
      // Main already supplies a complete nora:// URL, including its cache query.
      audio.src = entry.path;
      const { volume } = store.state.player;
      audio.volume = volume.isMuted ? 0 : getPerceptualGain(volume.value);
      audio.addEventListener('loadedmetadata', () => {
        // Start at ~33% — the recognizable part of the song.
        if (Number.isFinite(audio.duration) && audio.duration > 0)
          audio.currentTime = audio.duration * 0.33;
      });
      audio.addEventListener('ended', stopPreview);
      previewAudioRef.current = audio;
      setPreviewingSongId(entry.songId);
      audio.play().catch((err) => {
        console.error(err);
        stopPreview();
      });
    },
    [previewingSongId, stopPreview, toggleSongPlayback]
  );

  const closePrompt = useCallback(
    () => (onClose ? onClose() : changePromptMenuData(false)),
    [changePromptMenuData, onClose]
  );

  const minimizePrompt = useCallback(() => {
    stopPreview();
    onMinimize?.();
  }, [onMinimize, stopPreview]);

  const consumeQueuedDuel = useCallback(() => {
    if (remainingQueuedDuelsRef.current === 0) return;

    const remaining = Math.max(0, remainingQueuedDuelsRef.current - 1);
    remainingQueuedDuelsRef.current = remaining;
    setRemainingQueuedDuels(remaining);

    const persistedPendingDuels = storage.duels.getDuelsData('pendingDuels') ?? 0;
    storage.duels.setDuelsData('pendingDuels', Math.max(0, persistedPendingDuels - 1));
  }, []);

  const fetchNextPair = useCallback(
    (fallbackPhase: DuelPhase) => {
      stopPreview();
      setShowNextRetry(false);
      // Keep the completed result visible while loading the next pair. Hiding
      // it first changes the centered dialog's height and causes a visible flash.
      if (fallbackPhase !== 'result') setPhase('submitting');
      window.api.eloDuels
        .getDuelPair()
        .then((nextPair) => {
          if (nextPair) {
            setPair(nextPair);
            setPhase('voting');
            setResult(undefined);
            setWinnerSongId(undefined);
          } else closePrompt();
          actionLockedRef.current = false;
          return undefined;
        })
        .catch((err) => {
          console.error(err);
          actionLockedRef.current = false;
          setShowNextRetry(fallbackPhase === 'result');
          setPhase(fallbackPhase);
        });
    },
    [closePrompt, stopPreview]
  );

  const vote = useCallback(
    (selectedSongId: string) => {
      if (phase !== 'voting' || actionLockedRef.current) return;
      actionLockedRef.current = true;
      stopPreview();
      setPhase('submitting');
      window.api.eloDuels
        .submitDuelResult(pair.songA.songId, pair.songB.songId, selectedSongId)
        .then((duelResult) => {
          consumeQueuedDuel();
          setResult(duelResult);
          setWinnerSongId(selectedSongId);
          setPhase('result');
          actionLockedRef.current = false;
          completionTimeoutRef.current = setTimeout(() => {
            completionTimeoutRef.current = null;
            actionLockedRef.current = true;
            fetchNextPair('result');
          }, 1000);
          return undefined;
        })
        .catch((err) => {
          console.error(err);
          actionLockedRef.current = false;
          setPhase('voting');
        });
    },
    [consumeQueuedDuel, fetchNextPair, phase, pair, stopPreview]
  );

  const skipDuel = useCallback(() => {
    if (phase !== 'voting' || actionLockedRef.current) return;
    actionLockedRef.current = true;

    consumeQueuedDuel();
    fetchNextPair('voting');
  }, [consumeQueuedDuel, fetchNextPair, phase]);

  const advanceAfterResult = useCallback(() => {
    if (phase !== 'result' || actionLockedRef.current) return;
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
    actionLockedRef.current = true;
    fetchNextPair('result');
  }, [fetchNextPair, phase]);

  return (
    <>
      <div className="title-container relative mb-6 mt-1 flex items-center justify-center px-12 text-2xl font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
        {t('eloDuels.promptTitle')}
        {onMinimize && (
          <Button
            iconName="minimize"
            tooltipLabel={t('eloDuels.minimize')}
            className="absolute right-0 top-0 !m-0 h-8 w-8 !rounded-md !border-0 !bg-transparent !p-0 opacity-65 hover:!bg-background-color-2 hover:opacity-100 dark:hover:!bg-dark-background-color-2"
            clickHandler={minimizePrompt}
          />
        )}
      </div>
      {remainingQueuedDuels > 0 && (
        <div className="-mt-4 mb-5 text-center text-sm opacity-70">
          {t('eloDuels.queuedRemaining', { count: remainingQueuedDuels })}
        </div>
      )}

      <div className="duel-cards-container flex items-center justify-center gap-6">
        <DuelCard
          entry={pair.songA}
          onVote={() => vote(pair.songA.songId)}
          onPreviewToggle={() => togglePreview(pair.songA)}
          isPreviewing={previewingSongId === pair.songA.songId}
          isDisabled={phase !== 'voting'}
          showResult={phase === 'result'}
          isWinner={winnerSongId === pair.songA.songId}
          delta={result?.deltaA}
        />
        <span className="text-2xl font-semibold opacity-60">VS</span>
        <DuelCard
          entry={pair.songB}
          onVote={() => vote(pair.songB.songId)}
          onPreviewToggle={() => togglePreview(pair.songB)}
          isPreviewing={previewingSongId === pair.songB.songId}
          isDisabled={phase !== 'voting'}
          showResult={phase === 'result'}
          isWinner={winnerSongId === pair.songB.songId}
          delta={result?.deltaB}
        />
      </div>

      <div className="buttons-container mt-8 flex min-h-10 items-center justify-center gap-4">
        {phase === 'voting' && (
          <Button
            label={t('eloDuels.skipDuel')}
            className="skip-duel-btn !bg-background-color-3 px-6 !text-font-color-black hover:border-background-color-3 dark:!bg-dark-background-color-3 dark:!text-font-color-black dark:hover:border-background-color-3"
            clickHandler={skipDuel}
          />
        )}
        {phase === 'result' && showNextRetry && (
          <Button
            label={t('eloDuels.nextDuel')}
            iconName="bolt"
            className="next-duel-btn !bg-background-color-3 px-6 !text-font-color-black hover:border-background-color-3 dark:!bg-dark-background-color-3 dark:!text-font-color-black dark:hover:border-background-color-3"
            clickHandler={advanceAfterResult}
          />
        )}
        {!onMinimize && (
          <Button
            label={t('eloDuels.close')}
            className="close-duel-btn !bg-background-color-3 px-6 !text-font-color-black hover:border-background-color-3 dark:!bg-dark-background-color-3 dark:!text-font-color-black dark:hover:border-background-color-3"
            clickHandler={closePrompt}
          />
        )}
      </div>
    </>
  );
};

export default EloDuelPrompt;
