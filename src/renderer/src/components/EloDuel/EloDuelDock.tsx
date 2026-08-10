import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@tanstack/react-store';
import { createPortal } from 'react-dom';

import { store } from '@renderer/store';
import { peekFirstAliveDuelPair } from '../../utils/duelQueue';
import EloDuelPrompt from './EloDuelPrompt';

const EloDuelDock = () => {
  const { t } = useTranslation();
  const pendingDuels = useStore(store, (state) => state.localStorage.duels?.pendingDuels ?? 0);

  const [activePair, setActivePair] = useState<DuelPair>();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isExpanded && activePair && !dialog.open) dialog.showModal();
    else if (!isExpanded && dialog.open) dialog.close();
  }, [activePair, isExpanded]);

  const maximizeDuel = useCallback(() => {
    if (activePair) {
      setIsExpanded(true);
      return;
    }
    if (loadingRef.current) return;

    loadingRef.current = true;
    setIsLoading(true);
    // Earned (queued) duels first; a fresh random pair only when the backlog is empty.
    return peekFirstAliveDuelPair()
      .then((queuedPair) => queuedPair ?? window.api.eloDuels.getDuelPair())
      .then((pair) => {
        if (pair) {
          setActivePair(pair);
          setIsExpanded(true);
        }
        return undefined;
      })
      .catch((err) => console.error(err))
      .finally(() => {
        loadingRef.current = false;
        setIsLoading(false);
      });
  }, [activePair]);

  const minimizeDuel = useCallback(() => setIsExpanded(false), []);

  const closeDuel = useCallback(() => {
    setIsExpanded(false);
    setActivePair(undefined);
  }, []);

  const showDock = !isExpanded;
  const visibleCount = pendingDuels > 99 ? '99+' : pendingDuels;
  const dockLabel = activePair
    ? t('eloDuels.resumeDuel')
    : pendingDuels > 0
      ? t('eloDuels.maximize', { count: pendingDuels })
      : t('eloDuels.startDuel');

  return (
    <>
      {/* The bottom-pinning `mt-auto` now sits on the SongGuessr dock above;
          two auto margins would split the free space and separate the pair. */}
      <li className="flex min-h-0 w-full flex-shrink-0 items-center pl-2">
        {showDock && (
          <button
            type="button"
            className="group flex h-9 items-center gap-2 rounded-full bg-background-color-2 px-3 text-sm font-medium text-font-color-black shadow-md transition-[background-color,transform,opacity] duration-200 ease-out hover:-translate-y-0.5 hover:bg-background-color-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-font-color-highlight-2 active:translate-y-0 motion-reduce:transition-none dark:bg-dark-background-color-2 dark:text-font-color-white dark:hover:bg-dark-background-color-3 dark:focus-visible:outline-dark-font-color-highlight-2"
            onClick={maximizeDuel}
            aria-label={dockLabel}
            aria-expanded="false"
            title={dockLabel}
          >
            <span
              className={`material-icons-round text-lg !leading-none text-font-color-highlight dark:text-dark-font-color-highlight ${
                isLoading ? 'animate-spin' : ''
              }`}
              aria-hidden="true"
            >
              {isLoading ? 'progress_activity' : 'swords'}
            </span>
            <span className="leading-none">{t('eloDuels.dockName')}</span>
            {pendingDuels > 0 && (
              <span
                className="flex min-w-5 items-center justify-center rounded-full bg-font-color-highlight px-1.5 py-0.5 text-[0.7rem] font-semibold leading-none text-background-color-1 dark:bg-dark-font-color-highlight dark:text-dark-background-color-1"
                aria-live="polite"
              >
                {visibleCount}
              </span>
            )}
          </button>
        )}
      </li>

      {activePair &&
        createPortal(
          <dialog
            ref={dialogRef}
            className="fixed left-1/2 top-1/2 m-0 max-h-[calc(100vh-4rem)] w-[min(62rem,92vw)] min-w-0 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-background-color-1 p-0 text-font-color-black shadow-xl backdrop:bg-[hsla(228deg,7%,14%,0.75)] dark:bg-dark-background-color-1 dark:text-font-color-white"
            aria-label={t('eloDuels.promptTitle')}
            onCancel={(event) => {
              event.preventDefault();
              minimizeDuel();
            }}
          >
            <div className="px-8 pb-8 pt-6">
              <EloDuelPrompt
                initialPair={activePair}
                queuedDuels={pendingDuels}
                onClose={closeDuel}
                onMinimize={minimizeDuel}
              />
            </div>
          </dialog>,
          document.body
        )}
    </>
  );
};

export default EloDuelDock;
