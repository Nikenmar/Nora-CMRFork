import { useTranslation } from 'react-i18next';

type SongGuessrAttemptListProps = {
  attempts: SongGuessrAttempt[];
  maxAttempts: number;
  /**
   * `dots` is the progress row that sits above the guess box; `log` is the
   * running list of what was already tried. They are drawn on opposite sides of
   * the input, so a single component would have to render one of them twice.
   */
  variant: 'dots' | 'log';
};

const getDotClassName = (attempt: SongGuessrAttempt | undefined) => {
  // The "empty" tone comes from the seekbar track tokens: unlike
  // `background-color-3`, they are genuinely dark in the dark theme, so a
  // pending dot cannot be mistaken for a filled one.
  if (!attempt)
    return 'bg-seekbar-track-background-color dark:bg-dark-seekbar-track-background-color';
  if (attempt.kind === 'correct')
    return 'bg-font-color-highlight dark:bg-dark-font-color-highlight';
  if (attempt.kind === 'wrong') return 'bg-font-color-crimson';
  return 'border-2 border-seekbar-track-background-color bg-transparent dark:border-dark-seekbar-track-background-color';
};

const getAttemptIcon = (attempt: SongGuessrAttempt) => {
  if (attempt.kind === 'correct') return 'check_circle';
  if (attempt.kind === 'wrong') return 'close';
  return 'skip_next';
};

const SongGuessrAttemptList = (props: SongGuessrAttemptListProps) => {
  const { attempts, maxAttempts, variant } = props;
  const { t } = useTranslation();

  const dots = Array.from({ length: maxAttempts }, (_, index) => attempts[index]);

  if (variant === 'log') {
    if (attempts.length === 0) return null;

    // Kept tight on purpose: all six attempts should fit the log area, so it
    // has nothing to scroll in the first place.
    return (
      <ul className="space-y-1" aria-label={t('songGuessr.attemptsLabel')}>
        {attempts.map((attempt, index) => {
          const isCorrect = attempt.kind === 'correct';
          const label =
            attempt.kind === 'skip'
              ? t('songGuessr.skipped')
              : (attempt.guessLabel ??
                (isCorrect ? t('songGuessr.correctGuess') : t('songGuessr.wrongGuess')));

          return (
            <li
              key={index}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-1 text-xs ${
                isCorrect
                  ? 'bg-font-color-highlight/10 dark:bg-dark-font-color-highlight/10'
                  : 'bg-background-color-2/50 dark:bg-dark-background-color-2/50'
              }`}
            >
              <span
                className={`material-icons-round text-base !leading-none ${
                  isCorrect
                    ? 'text-font-color-highlight dark:text-dark-font-color-highlight'
                    : attempt.kind === 'wrong'
                      ? 'text-font-color-crimson'
                      : 'opacity-40'
                }`}
                aria-hidden="true"
              >
                {getAttemptIcon(attempt)}
              </span>
              <span
                className={`min-w-0 truncate ${
                  attempt.kind === 'wrong' ? 'line-through opacity-60' : ''
                } ${attempt.kind === 'skip' ? 'opacity-50' : ''}`}
                title={label}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section aria-label={t('songGuessr.attemptsLabel')}>
      <div className="flex items-center justify-center gap-2">
        {dots.map((attempt, index) => (
          <span
            key={index}
            className={`h-2.5 w-2.5 rounded-full transition-colors duration-200 motion-reduce:transition-none ${getDotClassName(
              attempt
            )}`}
            title={t('songGuessr.attemptRow', {
              number: index + 1,
              label: attempt
                ? attempt.kind === 'skip'
                  ? t('songGuessr.skipped')
                  : (attempt.guessLabel ??
                    (attempt.kind === 'correct'
                      ? t('songGuessr.correctGuess')
                      : t('songGuessr.wrongGuess')))
                : t('songGuessr.emptyAttempt')
            })}
          />
        ))}
      </div>
    </section>
  );
};

export default SongGuessrAttemptList;
