import { SONG_GUESSR_MAX_ATTEMPTS, SONG_GUESSR_RECENT_ROUNDS_CAP } from './constants';

export const createEmptyStats = (): SongGuessrStats => ({
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  currentStreak: 0,
  maxStreak: 0,
  distribution: Array<number>(SONG_GUESSR_MAX_ATTEMPTS).fill(0),
  lastPlayedAt: 0,
  skips: 0,
  firstPlayedAt: 0,
  recentRounds: []
});

export const applyRoundResult = (
  stats: SongGuessrStats,
  result: {
    won: boolean;
    attemptIndex: number;
    at: number;
    /** skips used in this round */
    skips?: number;
    /** omitted only by callers that have no answer to record */
    answer?: { songId: string; title: string; artists: string[] };
  }
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

  const attemptsSpent = Math.min(
    Math.max(Number.isInteger(result.attemptIndex) ? result.attemptIndex + 1 : 1, 1),
    SONG_GUESSR_MAX_ATTEMPTS
  );
  const roundSkips =
    Number.isInteger(result.skips) && result.skips! >= 0
      ? Math.min(result.skips!, SONG_GUESSR_MAX_ATTEMPTS)
      : 0;
  const recentRounds = result.answer
    ? [
        {
          at: result.at,
          won: result.won,
          attempts: attemptsSpent,
          songId: result.answer.songId,
          title: result.answer.title,
          artists: result.answer.artists
        },
        ...stats.recentRounds
      ].slice(0, SONG_GUESSR_RECENT_ROUNDS_CAP)
    : stats.recentRounds;

  return {
    gamesPlayed: stats.gamesPlayed + 1,
    wins: stats.wins + (result.won ? 1 : 0),
    losses: stats.losses + (result.won ? 0 : 1),
    currentStreak,
    maxStreak: Math.max(stats.maxStreak, currentStreak),
    distribution,
    lastPlayedAt: result.at,
    skips: stats.skips + roundSkips,
    firstPlayedAt: stats.firstPlayedAt > 0 ? stats.firstPlayedAt : result.at,
    recentRounds
  };
};

export const getWinPercentage = (stats: SongGuessrStats): number => {
  if (stats.gamesPlayed <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((stats.wins / stats.gamesPlayed) * 100)));
};

/**
 * Attempts per WIN, read off the distribution rather than a stored counter —
 * that way saves written before the counters existed still report it.
 */
export const getAverageWinAttempts = (stats: SongGuessrStats): number => {
  if (stats.wins <= 0) return 0;
  const total = stats.distribution.reduce((sum, count, index) => sum + count * (index + 1), 0);
  return Math.round((total / stats.wins) * 10) / 10;
};

/** Answers that beat the player most often, over the kept round window. */
export const getMostMissedRounds = (
  stats: SongGuessrStats,
  limit = 5
): { songId: string; title: string; artists: string[]; misses: number }[] => {
  const misses = new Map<
    string,
    { songId: string; title: string; artists: string[]; misses: number }
  >();

  for (const round of stats.recentRounds) {
    if (round.won) continue;
    const entry = misses.get(round.songId);
    if (entry) entry.misses += 1;
    else
      misses.set(round.songId, {
        songId: round.songId,
        title: round.title,
        artists: round.artists,
        misses: 1
      });
  }

  return [...misses.values()].sort((left, right) => right.misses - left.misses).slice(0, limit);
};
