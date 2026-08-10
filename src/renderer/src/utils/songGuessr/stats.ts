import { SONG_GUESSR_MAX_ATTEMPTS } from './constants';

export const createEmptyStats = (): SongGuessrStats => ({
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  currentStreak: 0,
  maxStreak: 0,
  distribution: Array<number>(SONG_GUESSR_MAX_ATTEMPTS).fill(0),
  lastPlayedAt: 0
});

export const applyRoundResult = (
  stats: SongGuessrStats,
  result: { won: boolean; attemptIndex: number; at: number }
): SongGuessrStats => {
  const currentStreak = result.won ? stats.currentStreak + 1 : 0;
  const distribution = Array.from(
    { length: SONG_GUESSR_MAX_ATTEMPTS },
    (_, index) => stats.distribution[index] ?? 0
  );

  if (
    result.won &&
    Number.isInteger(result.attemptIndex) &&
    result.attemptIndex >= 0 &&
    result.attemptIndex < SONG_GUESSR_MAX_ATTEMPTS
  ) {
    distribution[result.attemptIndex] += 1;
  }

  return {
    gamesPlayed: stats.gamesPlayed + 1,
    wins: stats.wins + (result.won ? 1 : 0),
    losses: stats.losses + (result.won ? 0 : 1),
    currentStreak,
    maxStreak: Math.max(stats.maxStreak, currentStreak),
    distribution,
    lastPlayedAt: result.at
  };
};

export const getWinPercentage = (stats: SongGuessrStats): number => {
  if (stats.gamesPlayed <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((stats.wins / stats.gamesPlayed) * 100)));
};
