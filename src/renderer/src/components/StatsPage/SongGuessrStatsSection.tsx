import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import i18n from '../../i18n';
import { SONG_GUESSR_RECENT_ROUNDS_CAP } from '../../utils/songGuessr/constants';
import {
  getAverageWinAttempts,
  getMostMissedRounds,
  getWinPercentage
} from '../../utils/songGuessr/stats';
import SongGuessrStatsPanel from '../SongGuessr/SongGuessrStatsPanel';
import StatTile from './StatTile';

type SongGuessrStatsSectionProps = {
  stats: SongGuessrStats;
  onTitleClick: (songId: string) => void;
};

const RECENT_ROUNDS_SHOWN = 10;
const MOST_MISSED_SHOWN = 5;

const SongGuessrStatsSection = ({ stats, onTitleClick }: SongGuessrStatsSectionProps) => {
  const { t } = useTranslation();

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }),
    []
  );
  const dateTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    []
  );

  const recentRounds = stats.recentRounds.slice(0, RECENT_ROUNDS_SHOWN);
  const mostMissed = useMemo(() => getMostMissedRounds(stats, MOST_MISSED_SHOWN), [stats]);
  const averageAttempts = getAverageWinAttempts(stats);

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
        {t('songGuessr.sectionTitle')}
      </h2>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6 sm:grid-cols-3">
        <StatTile label={t('songGuessr.gamesPlayed')} value={stats.gamesPlayed} />
        <StatTile label={t('songGuessr.winPercentage')} value={`${getWinPercentage(stats)}%`} />
        <StatTile label={t('songGuessr.currentStreak')} value={stats.currentStreak} />
        <StatTile label={t('songGuessr.maxStreak')} value={stats.maxStreak} />
        {/* Read off the win distribution, so it is filled in even for saves
            written before the counters existed. */}
        <StatTile
          label={t('songGuessr.averageAttempts')}
          value={averageAttempts > 0 ? averageAttempts : '-'}
        />
        <StatTile
          label={t('songGuessr.skipsUsed')}
          value={stats.skips}
          title={
            stats.firstPlayedAt > 0
              ? t('songGuessr.playingSince', {
                  date: dateFormatter.format(new Date(stats.firstPlayedAt))
                })
              : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-md bg-background-color-2/70 p-4 backdrop-blur-md dark:bg-dark-background-color-2/70">
          <h3 className="mb-2 font-medium">{t('songGuessr.distribution')}</h3>
          <SongGuessrStatsPanel stats={stats} />
        </div>

        <div className="rounded-md bg-background-color-2/70 p-4 backdrop-blur-md dark:bg-dark-background-color-2/70">
          <h3 className="mb-1 font-medium">{t('songGuessr.recentRounds')}</h3>
          <ul>
            {recentRounds.map((round) => (
              <li
                key={`${round.at}-${round.songId}`}
                className="flex items-center justify-between gap-2 py-1"
                title={dateTimeFormatter.format(new Date(round.at))}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`material-icons-round text-base !leading-none ${
                      round.won
                        ? 'text-font-color-highlight dark:text-dark-font-color-highlight'
                        : 'text-font-color-crimson'
                    }`}
                    aria-hidden="true"
                  >
                    {round.won ? 'check_circle' : 'close'}
                  </span>
                  <button
                    type="button"
                    className="min-w-0 truncate text-left hover:underline"
                    onClick={() => onTitleClick(round.songId)}
                  >
                    {round.title}
                    {round.artists.length > 0 && (
                      <span className="opacity-60"> — {round.artists.join(', ')}</span>
                    )}
                  </button>
                </span>
                <span className="shrink-0 text-sm opacity-60">
                  {round.won ? t('songGuessr.attemptsWithCount', { count: round.attempts }) : '-'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-md bg-background-color-2/70 p-4 backdrop-blur-md dark:bg-dark-background-color-2/70">
          <h3 className="mb-1 font-medium">{t('songGuessr.mostMissed')}</h3>
          {/* Says what it is counting: the history window is capped, so this is
              not an all-time tally and must not read like one. */}
          <p className="mb-1 text-xs opacity-50">
            {t('songGuessr.mostMissedHint', { count: SONG_GUESSR_RECENT_ROUNDS_CAP })}
          </p>
          <ul>
            {mostMissed.map((entry, index) => (
              <li key={entry.songId} className="flex items-center justify-between gap-2 py-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-4 shrink-0 text-sm opacity-45">{index + 1}</span>
                  <button
                    type="button"
                    className="min-w-0 truncate text-left hover:underline"
                    onClick={() => onTitleClick(entry.songId)}
                  >
                    {entry.title}
                    {entry.artists.length > 0 && (
                      <span className="opacity-60"> — {entry.artists.join(', ')}</span>
                    )}
                  </button>
                </span>
                <span className="shrink-0 text-sm opacity-60">
                  {t('songGuessr.missesWithCount', { count: entry.misses })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

export default SongGuessrStatsSection;
