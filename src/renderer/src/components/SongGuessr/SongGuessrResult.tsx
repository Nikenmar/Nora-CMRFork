import { useTranslation } from 'react-i18next';

import Img from '../Img';

type SongGuessrResultProps = {
  round: SongGuessrRound;
  attempts: SongGuessrAttempt[];
  won: boolean;
  copied: boolean;
  onCopy: () => void;
  onNextRound: () => void;
  onPlayInNora: () => void;
};

const getSquareClassName = (attempt: SongGuessrAttempt) => {
  if (attempt.kind === 'correct')
    return 'bg-font-color-highlight dark:bg-dark-font-color-highlight';
  if (attempt.kind === 'wrong') return 'bg-font-color-crimson';
  // Skips use the track tone, which stays dark in the dark theme — otherwise a
  // skipped square reads as brightly as a solved one.
  return 'bg-seekbar-track-background-color dark:bg-dark-seekbar-track-background-color';
};

const SongGuessrResult = (props: SongGuessrResultProps) => {
  const { round, attempts, won, copied, onCopy, onNextRound, onPlayInNora } = props;
  const { t } = useTranslation();
  const { answer } = round;

  return (
    <section className="relative overflow-hidden rounded-2xl">
      {/*
        The artwork was the one thing the round had to hide — let it arrive
        loudly. It stays a faint glow behind an almost opaque surface, though:
        a translucent panel over a blurred image washes the text out.
      */}
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        <Img
          src={answer.artworkPaths.artworkPath}
          alt=""
          enableImgFadeIns={false}
          className="h-full w-full scale-150 object-cover opacity-20 blur-3xl"
        />
      </div>

      {/*
        Artwork beside the text rather than above it. Stacked, the reveal plus
        the stats panel ran past the bottom of a fixed-height dialog; side by
        side the whole result fits with nothing to scroll.
      */}
      <div className="flex flex-col bg-background-color-1/95 px-5 py-5 dark:bg-dark-background-color-1/95">
        <div className="flex items-center gap-4">
          <Img
            src={answer.artworkPaths.artworkPath}
            alt={t('songGuessr.answerArtworkAlt', { title: answer.title })}
            className="h-24 w-24 flex-shrink-0 rounded-xl object-cover shadow-lg"
          />

          <div className="flex min-w-0 flex-col">
            <span
              className={`mb-1.5 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                won
                  ? 'bg-font-color-highlight/15 text-font-color-highlight dark:bg-dark-font-color-highlight/15 dark:text-dark-font-color-highlight'
                  : 'bg-font-color-crimson/15 text-font-color-crimson'
              }`}
            >
              <span className="material-icons-round text-xs !leading-none" aria-hidden="true">
                {won ? 'celebration' : 'sentiment_dissatisfied'}
              </span>
              {won
                ? t('songGuessr.resultWinIn', { count: attempts.length })
                : t('songGuessr.resultLoss')}
            </span>

            <h2 className="truncate text-lg font-semibold leading-tight" title={answer.title}>
              {answer.title}
            </h2>
            {answer.artists.length > 0 && (
              <p className="mt-0.5 truncate text-sm opacity-70" title={answer.artists.join(', ')}>
                {answer.artists.join(', ')}
              </p>
            )}
            {answer.album && (
              <p className="mt-0.5 truncate text-xs opacity-45" title={answer.album}>
                {answer.album}
              </p>
            )}

            <div className="mt-2 flex items-center gap-1" aria-hidden="true">
              {attempts.map((attempt, index) => (
                <span
                  key={index}
                  className={`h-2.5 w-2.5 rounded-sm ${getSquareClassName(attempt)}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {/* Nora never fills a control with the highlight colour — it borders
              the surface and lets the accent live in the icon. The primary
              action is set apart by a highlight border, not a slab of it. */}
          <button
            type="button"
            onClick={onNextRound}
            className="flex h-10 items-center gap-1.5 rounded-xl border-[3px] border-font-color-highlight/60 bg-background-color-2/25 px-5 text-sm font-medium transition-[border-color,background-color] duration-200 ease-in-out hover:border-font-color-highlight hover:bg-background-color-2/50 focus-visible:!border-font-color-highlight-2 motion-reduce:transition-none dark:border-dark-font-color-highlight/60 dark:bg-dark-background-color-2/25 dark:hover:border-dark-font-color-highlight dark:hover:bg-dark-background-color-2/50 dark:focus-visible:!border-dark-font-color-highlight-2"
          >
            <span
              className="material-icons-round text-base !leading-none text-font-color-highlight dark:text-dark-font-color-highlight"
              aria-hidden="true"
            >
              refresh
            </span>
            {t('songGuessr.nextRound')}
          </button>

          <button
            type="button"
            onClick={onPlayInNora}
            className="flex h-10 items-center gap-1.5 rounded-xl border-[3px] border-background-color-2 bg-background-color-2/25 px-4 text-sm font-medium transition-[border-color,background-color] duration-200 ease-in-out hover:border-background-color-3 hover:bg-background-color-2/50 focus-visible:!border-font-color-highlight-2 motion-reduce:transition-none dark:border-dark-background-color-2 dark:bg-dark-background-color-2/25 dark:hover:border-dark-background-color-3 dark:hover:bg-dark-background-color-2/50 dark:focus-visible:!border-dark-font-color-highlight-2"
          >
            <span className="material-icons-round text-base !leading-none" aria-hidden="true">
              play_arrow
            </span>
            {t('songGuessr.playInNora')}
          </button>

          <button
            type="button"
            onClick={onCopy}
            className="flex h-10 items-center gap-1.5 rounded-xl border-[3px] border-background-color-2 bg-background-color-2/25 px-4 text-sm font-medium transition-[border-color,background-color] duration-200 ease-in-out hover:border-background-color-3 hover:bg-background-color-2/50 focus-visible:!border-font-color-highlight-2 motion-reduce:transition-none dark:border-dark-background-color-2 dark:bg-dark-background-color-2/25 dark:hover:border-dark-background-color-3 dark:hover:bg-dark-background-color-2/50 dark:focus-visible:!border-dark-font-color-highlight-2"
          >
            <span
              className={`material-icons-round text-base !leading-none ${
                copied ? 'text-font-color-highlight dark:text-dark-font-color-highlight' : ''
              }`}
              aria-hidden="true"
            >
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied ? t('songGuessr.copied') : t('songGuessr.copyResult')}
          </button>
        </div>
      </div>
    </section>
  );
};

export default SongGuessrResult;
