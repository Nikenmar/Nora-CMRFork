import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { formatCandidateLabel } from '../../utils/songGuessr/matching';
import Img from '../Img';

type SongGuessrGuessInputProps = {
  disabled: boolean;
  onSubmit: (candidate: SongGuessrCandidate) => void;
  onSkip: () => void;
  attemptsLeft: number;
  /** Rendered under the suggestion overlay — the attempt log. */
  children?: ReactNode;
};

const SEARCH_DEBOUNCE_MS = 120;
const SEARCH_LIMIT = 8;

/**
 * These areas scroll without showing a bar, the way the Stats activity
 * calendar does. The content is short and self-anchoring, so the bar was pure
 * chrome — and the global rules would have coloured it from `.App.dark`, which
 * a dialog portalled to document.body never sees anyway.
 */
const HIDDEN_SCROLLBAR_CLASSNAME =
  '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

const SongGuessrGuessInput = (props: SongGuessrGuessInputProps) => {
  const { disabled, onSubmit, onSkip, attemptsLeft, children } = props;
  const { t } = useTranslation();

  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<SongGuessrCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<SongGuessrCandidate>();
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);

  const requestIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const listboxId = 'song-guessr-candidates';

  // With the bar hidden, the log has to anchor itself: the newest attempt is
  // the one worth reading, so it stays in view without anyone dragging it.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [attemptsLeft]);

  useEffect(() => {
    requestIdRef.current += 1;
    if (selectedCandidate) {
      setIsSearching(false);
      return undefined;
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setCandidates([]);
      setActiveIndex(-1);
      setIsSearching(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const requestId = ++requestIdRef.current;
      setIsSearching(true);
      window.api.songGuessr
        .searchCandidates(trimmedQuery, SEARCH_LIMIT)
        .then((results) => {
          if (requestId !== requestIdRef.current) return;
          setCandidates(results);
          setActiveIndex(results.length > 0 ? 0 : -1);
          setIsSearching(false);
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          setCandidates([]);
          setActiveIndex(-1);
          setIsSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      requestIdRef.current += 1;
    };
  }, [query, selectedCandidate]);

  // Keyboard navigation has to drag the highlighted row into view, since the
  // list scrolls inside its own fixed area.
  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const selectCandidate = (candidate: SongGuessrCandidate) => {
    setSelectedCandidate(candidate);
    setQuery(formatCandidateLabel(candidate));
    setCandidates([]);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const clearSelection = () => {
    setSelectedCandidate(undefined);
    setQuery('');
    setCandidates([]);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const submit = () => {
    if (selectedCandidate && !disabled) onSubmit(selectedCandidate);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && candidates.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % candidates.length);
      return;
    }
    if (event.key === 'ArrowUp' && candidates.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? candidates.length - 1 : index - 1));
      return;
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      requestIdRef.current += 1;
      setCandidates([]);
      setActiveIndex(-1);
      setIsSearching(false);
      return;
    }
    if (event.key === 'Enter') {
      if (activeIndex >= 0 && candidates[activeIndex]) {
        event.preventDefault();
        selectCandidate(candidates[activeIndex]);
      } else if (selectedCandidate) {
        event.preventDefault();
        submit();
      }
    }
  };

  const hasSuggestions = candidates.length > 0 && !selectedCandidate;
  const hasEmptyResult =
    !isSearching && !selectedCandidate && query.trim().length > 0 && candidates.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`flex flex-shrink-0 items-center gap-2 rounded-xl border-2 bg-background-color-2/60 px-3 transition-colors duration-200 focus-within:border-font-color-highlight motion-reduce:transition-none dark:bg-dark-background-color-2/60 dark:focus-within:border-dark-font-color-highlight ${
          selectedCandidate
            ? 'border-font-color-highlight/60 dark:border-dark-font-color-highlight/60'
            : 'border-transparent'
        }`}
      >
        <span
          className={`material-icons-round text-xl !leading-none ${
            selectedCandidate
              ? 'text-font-color-highlight dark:text-dark-font-color-highlight'
              : 'opacity-40'
          }`}
          aria-hidden="true"
        >
          {selectedCandidate ? 'task_alt' : 'search'}
        </span>

        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={hasSuggestions}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            hasSuggestions && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
          }
          aria-label={t('songGuessr.guessInputLabel')}
          placeholder={t('songGuessr.guessPlaceholder')}
          className="h-12 w-full min-w-0 bg-transparent text-sm outline-none placeholder:opacity-40 disabled:opacity-50"
          onChange={(event) => {
            setSelectedCandidate(undefined);
            setQuery(event.target.value);
          }}
          onKeyDown={handleKeyDown}
        />

        {isSearching && (
          <span
            className="material-icons-round animate-spin text-base !leading-none opacity-40 motion-reduce:animate-none"
            aria-hidden="true"
          >
            progress_activity
          </span>
        )}

        {query.length > 0 && !disabled && (
          <button
            type="button"
            onClick={clearSelection}
            aria-label={t('songGuessr.clearGuess')}
            title={t('songGuessr.clearGuess')}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full opacity-45 transition-opacity hover:bg-background-color-3 hover:opacity-100 motion-reduce:transition-none dark:hover:bg-dark-background-color-3/15"
          >
            <span className="material-icons-round text-base !leading-none">close</span>
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !selectedCandidate}
          className="h-10 flex-1 rounded-xl bg-font-color-highlight text-sm font-semibold text-background-color-1 transition-[transform,opacity] duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-font-color-highlight-2 hover:enabled:-translate-y-0.5 active:enabled:translate-y-0 disabled:opacity-35 motion-reduce:transition-none dark:bg-dark-font-color-highlight dark:text-dark-background-color-1"
        >
          {t('songGuessr.submitGuess')}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          title={t('songGuessr.skipHint', { count: attemptsLeft })}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-background-color-2/70 px-4 text-sm font-medium transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-font-color-highlight-2 hover:enabled:bg-background-color-3 disabled:opacity-35 motion-reduce:transition-none dark:bg-dark-background-color-2/70 dark:hover:enabled:bg-dark-background-color-3/15"
        >
          <span className="material-icons-round text-base !leading-none" aria-hidden="true">
            skip_next
          </span>
          {t('songGuessr.skip')}
        </button>
      </div>

      {/*
        One fixed area holding both the attempt log and the suggestion overlay.
        They share it instead of stacking, so opening the list cannot push the
        buttons around or resize the dialog — nothing above this line moves.
      */}
      <div className="relative mt-4 min-h-0 flex-1">
        <div
          ref={logRef}
          className={`absolute inset-0 overflow-y-auto ${HIDDEN_SCROLLBAR_CLASSNAME}`}
        >
          {children}
        </div>

        {hasEmptyResult && (
          <p className="absolute inset-x-0 top-0 rounded-xl bg-background-color-1 px-1 py-2 text-xs opacity-45 dark:bg-dark-background-color-1">
            {t('songGuessr.noCandidates')}
          </p>
        )}

        {hasSuggestions && (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className={`absolute inset-x-0 top-0 max-h-full overflow-y-auto rounded-xl border border-background-color-3 bg-background-color-1 py-1 shadow-lg dark:border-dark-background-color-3 dark:bg-dark-background-color-2 ${HIDDEN_SCROLLBAR_CLASSNAME}`}
          >
            {candidates.map((candidate, index) => (
              <li
                key={candidate.songId}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors duration-100 motion-reduce:transition-none ${
                  index === activeIndex
                    ? 'bg-font-color-highlight/12 dark:bg-dark-font-color-highlight/12'
                    : 'dark:hover:bg-dark-background-color-3/12 hover:bg-background-color-2/70'
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectCandidate(candidate);
                }}
              >
                {candidate.artworkPath ? (
                  <Img
                    src={candidate.artworkPath}
                    alt=""
                    enableImgFadeIns={false}
                    className="h-9 w-9 flex-shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-seekbar-track-background-color dark:bg-dark-seekbar-track-background-color">
                    <span className="material-icons-round text-base !leading-none opacity-45">
                      music_note
                    </span>
                  </span>
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{candidate.title}</span>
                  {candidate.artists.length > 0 && (
                    <span className="truncate text-xs opacity-55">
                      {candidate.artists.join(', ')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default SongGuessrGuessInput;
