import { useTranslation } from 'react-i18next';

import { getWinPercentage } from '../../utils/songGuessr/stats';

type SongGuessrStatsPanelProps = {
  stats: SongGuessrStats;
  /** Highlights the bucket the round that just ended landed in. */
  highlightAttempt?: number;
};

const SongGuessrStatsPanel = ({ stats, highlightAttempt }: SongGuessrStatsPanelProps) => {
  const { t } = useTranslation();

  const summary = [
    { label: t('songGuessr.gamesPlayed'), value: stats.gamesPlayed },
    { label: t('songGuessr.winPercentage'), value: `${getWinPercentage(stats)}%` },
    { label: t('songGuessr.currentStreak'), value: stats.currentStreak },
    { label: t('songGuessr.maxStreak'), value: stats.maxStreak }
  ];

  const peak = Math.max(1, ...stats.distribution);

  return (
    <section
      className="rounded-2xl bg-background-color-2/45 px-5 py-3 dark:bg-dark-background-color-2/45"
      aria-label={t('songGuessr.statsTitle')}
    >
      <div className="grid grid-cols-4 gap-2">
        {summary.map((item) => (
          <div key={item.label} className="flex flex-col items-center">
            <span className="text-lg font-semibold leading-none">{item.value}</span>
            <span className="mt-1 text-center text-[0.65rem] uppercase tracking-wide opacity-50">
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {stats.gamesPlayed > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[0.65rem] uppercase tracking-wide opacity-50">
            {t('songGuessr.distribution')}
          </p>
          <div className="space-y-0.5">
            {stats.distribution.map((count, index) => {
              const isHighlighted = highlightAttempt === index;
              return (
                <div
                  key={index}
                  className="flex items-center gap-2"
                  aria-label={t('songGuessr.distributionBar', { attempt: index + 1, count })}
                >
                  <span className="w-3 text-[0.65rem] opacity-45">{index + 1}</span>
                  <div className="flex h-3 min-w-0 flex-1 items-center">
                    {count > 0 ? (
                      <div
                        /* The seekbar tone, which is what Nora already fills a
                           progress shape with — the highlight colour as a slab
                           read as a stray tint against the rest of the app. */
                        className={`flex h-full min-w-[1.25rem] items-center justify-end rounded-[0.25rem] px-1.5 text-[0.6rem] font-semibold transition-all duration-500 ease-out motion-reduce:transition-none ${
                          isHighlighted
                            ? 'bg-seekbar-background-color text-background-color-1 dark:bg-dark-seekbar-background-color dark:text-dark-background-color-1'
                            : 'bg-seekbar-background-color/35 dark:bg-dark-seekbar-background-color/35'
                        }`}
                        style={{ width: `${(count / peak) * 100}%` }}
                      >
                        {count}
                      </div>
                    ) : (
                      // An empty bucket gets a hairline, not a bar — a filled
                      // pill next to a 0 reads as data that is not there.
                      <div className="h-px w-full bg-seekbar-track-background-color dark:bg-dark-seekbar-track-background-color" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export default SongGuessrStatsPanel;
