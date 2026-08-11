import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useStore } from '@tanstack/react-store';

import { store } from '@renderer/store';
import {
  SONG_GUESSR_GUESS_INPUT_ID,
  SONG_GUESSR_PANEL_ATTRIBUTE
} from '../../utils/songGuessr/constants';
import SongGuessrPrompt from './SongGuessrPrompt';

const SongGuessrDock = () => {
  const { t } = useTranslation();
  const isDarkMode = useStore(store, (state) => state.isDarkMode);

  const [hasStarted, setHasStarted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (hasStarted && isExpanded && !dialog.open) {
      dialog.showModal();

      /*
        `showModal()` hands focus to the first focusable descendant on its own,
        and that is the pool dropdown — which is why coming back from a
        minimize lit it up with a focus ring. The guess box is what the player
        actually wants; while a round is still loading there is none, so the
        panel takes the focus instead and nothing lights up.
      */
      const guessInput = dialog.querySelector<HTMLInputElement>(`#${SONG_GUESSR_GUESS_INPUT_ID}`);
      if (guessInput) guessInput.focus();
      else dialog.querySelector<HTMLElement>(`[${SONG_GUESSR_PANEL_ATTRIBUTE}]`)?.focus();
    } else if ((!hasStarted || !isExpanded) && dialog.open) dialog.close();
  }, [hasStarted, isExpanded]);

  const maximizeSongGuessr = useCallback(() => {
    setHasStarted(true);
    setIsExpanded(true);
  }, []);

  const minimizeSongGuessr = useCallback(() => setIsExpanded(false), []);

  const closeSongGuessr = useCallback(() => {
    setIsExpanded(false);
    setHasStarted(false);
  }, []);

  const dockLabel = t('songGuessr.dockName');

  return (
    <>
      {/*
        `mt-auto` lives here, on the first of the two docks, so the pair is
        pushed to the bottom of the sidebar as one block. It used to sit on the
        duel dock, which sent only that button down and left this one stranded
        under Stats.
      */}
      <li className="mt-auto flex min-h-0 w-full flex-shrink-0 items-center pl-2">
        {!isExpanded && (
          <button
            type="button"
            className="group flex h-9 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-full bg-background-color-2 px-3 text-sm font-medium text-font-color-black shadow-md transition-[background-color,transform,opacity] duration-200 ease-out hover:-translate-y-0.5 hover:bg-background-color-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-font-color-highlight-2 active:translate-y-0 motion-reduce:transition-none dark:bg-dark-background-color-2 dark:text-font-color-white dark:hover:bg-dark-background-color-3 dark:focus-visible:outline-dark-font-color-highlight-2"
            onClick={maximizeSongGuessr}
            aria-label={dockLabel}
            aria-expanded={isExpanded}
            title={dockLabel}
          >
            <span
              className="material-icons-round flex-shrink-0 text-lg !leading-none text-font-color-highlight dark:text-dark-font-color-highlight"
              aria-hidden="true"
            >
              graphic_eq
            </span>
            <span className="min-w-0 truncate leading-none">{dockLabel}</span>
          </button>
        )}
      </li>

      {hasStarted &&
        createPortal(
          <dialog
            ref={dialogRef}
            /*
              Centred with `inset-0 m-auto`, NOT with a -50% translate: the
              panel height is odd more often than not, so a percentage
              transform lands it on a half pixel and rasterises the whole
              composited layer — text and artwork included — slightly soft.

              The height is fixed rather than content-driven. Letting it grow
              meant the window resized and the buttons moved on every guess,
              every skip and every time the suggestions opened; the panel now
              holds still and only its inner regions scroll. 48rem is the budget
              the attempt log needs to hold all six rows unscrolled once the
              volume row is in — below that it is the log that gives.

              `[&:not([open])]:hidden` is what makes Minimize work at all. The
              browser hides a closed dialog with `dialog:not([open]){display:
              none}` from its OWN stylesheet, and any author `display` beats a
              user-agent one regardless of specificity — so the `flex` here kept
              the panel on screen after `close()` and minimizing looked dead.
              This rule is an author rule too, and more specific than `.flex`.

              The `dark` class is here because the theme variables are declared
              on `.App.dark`, which a dialog portalled to document.body is not
              inside; without it the range slider and other var-driven styling
              fall back to the light palette. Tailwind's `dark:` variants are
              unaffected — that class sits on body.
            */
            className={`fixed inset-0 m-auto flex h-[min(48rem,calc(100vh-3rem))] w-[min(34rem,94vw)] min-w-0 flex-col overflow-hidden rounded-2xl bg-background-color-1 p-0 text-font-color-black shadow-2xl backdrop:bg-[hsla(228deg,7%,14%,0.75)] dark:bg-dark-background-color-1 dark:text-font-color-white [&:not([open])]:hidden ${
              isDarkMode ? 'dark' : ''
            }`}
            aria-label={t('songGuessr.promptTitle')}
            onCancel={(event) => {
              event.preventDefault();
              minimizeSongGuessr();
            }}
          >
            <SongGuessrPrompt onClose={closeSongGuessr} onMinimize={minimizeSongGuessr} />
          </dialog>,
          document.body
        )}
    </>
  );
};

export default SongGuessrDock;
