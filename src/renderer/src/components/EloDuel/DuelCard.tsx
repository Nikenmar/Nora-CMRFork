import { type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import Img from '../Img';

type Props = {
  entry: DuelSongEntry;
  onVote: () => void;
  onPreviewToggle: () => void;
  isPreviewing: boolean;
  isDisabled: boolean;
  showResult: boolean;
  isWinner?: boolean;
  delta?: number;
};

const DuelCard = (props: Props) => {
  const { entry, onVote, onPreviewToggle, isPreviewing, isDisabled, showResult, isWinner, delta } =
    props;
  const { t } = useTranslation();

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onVote();
    }
  };

  return (
    <div
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled}
      className={`duel-card group relative flex w-56 cursor-pointer flex-col items-center rounded-xl border-2 bg-background-color-2/75 p-4 transition-colors hover:border-font-color-highlight/60 dark:bg-dark-background-color-2/75 dark:hover:border-dark-font-color-highlight/60 ${
        isDisabled ? 'cursor-default' : ''
      } ${
        showResult && isWinner
          ? 'border-font-color-highlight dark:border-dark-font-color-highlight'
          : 'border-transparent'
      } ${showResult && !isWinner ? 'opacity-70' : ''}`}
      onClick={() => {
        if (!isDisabled) onVote();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="relative">
        <Img
          src={entry.artworkPaths.artworkPath}
          alt=""
          enableImgFadeIns={false}
          className="h-40 w-40 rounded-lg object-cover shadow-md"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={isDisabled}
          className="preview-btn absolute bottom-2 right-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-background-color-1/80 text-font-color-black opacity-0 backdrop-blur-md transition-opacity hover:bg-background-color-1 group-hover:opacity-100 dark:bg-dark-background-color-1/80 dark:text-font-color-white dark:hover:bg-dark-background-color-1"
          title={t('eloDuels.preview')}
          onClick={(e) => {
            e.stopPropagation();
            if (!isDisabled) onPreviewToggle();
          }}
        >
          <span className="material-icons-round text-xl">
            {isPreviewing ? 'pause' : 'play_arrow'}
          </span>
        </button>
      </div>

      <span className="mt-3 w-full truncate text-center font-medium" title={entry.title}>
        {entry.title}
      </span>
      <span
        className="w-full truncate text-center text-sm opacity-60"
        title={entry.artists.join(', ')}
      >
        {entry.artists.join(', ')}
      </span>
      <span className="mt-1 text-xs opacity-60">
        {t('eloDuels.ratingWithGames', { rating: Math.round(entry.rating), count: entry.games })}
      </span>

      <div className="mt-2 flex h-7 items-center">
        {showResult && delta !== undefined && (
          <span
            className={`text-lg font-semibold ${
              delta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {delta >= 0 ? `+${Math.round(delta)}` : Math.round(delta)}
          </span>
        )}
      </div>
    </div>
  );
};

export default DuelCard;
