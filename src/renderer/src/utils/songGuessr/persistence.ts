import {
  SONG_GUESSR_MAX_ATTEMPTS,
  SONG_GUESSR_RECENT_ROUNDS_CAP,
  SONG_GUESSR_STORAGE_KEY
} from './constants';
import { createEmptyStats } from './stats';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isPoolType = (value: unknown): value is SongGuessrPoolType =>
  value === 'library' || value === 'playlist' || value === 'genre';

const isValidStats = (value: unknown): value is SongGuessrStats => {
  if (!isRecord(value) || !Array.isArray(value.distribution)) return false;

  return (
    isNonNegativeInteger(value.gamesPlayed) &&
    isNonNegativeInteger(value.wins) &&
    isNonNegativeInteger(value.losses) &&
    isNonNegativeInteger(value.currentStreak) &&
    isNonNegativeInteger(value.maxStreak) &&
    typeof value.lastPlayedAt === 'number' &&
    Number.isFinite(value.lastPlayedAt) &&
    value.lastPlayedAt >= 0 &&
    value.distribution.length === SONG_GUESSR_MAX_ATTEMPTS &&
    value.distribution.every(isNonNegativeInteger)
  );
};

const isRoundRecord = (value: unknown): value is SongGuessrRoundRecord =>
  isRecord(value) &&
  typeof value.at === 'number' &&
  Number.isFinite(value.at) &&
  value.at >= 0 &&
  typeof value.won === 'boolean' &&
  isNonNegativeInteger(value.attempts) &&
  typeof value.songId === 'string' &&
  typeof value.title === 'string' &&
  Array.isArray(value.artists) &&
  value.artists.every((artist) => typeof artist === 'string');

/**
 * A save written before the v3.4.2 counters is still valid — it just does not
 * carry them. Filling defaults here (rather than rejecting the whole state)
 * is what keeps an existing player's games, streaks and distribution intact.
 */
const normalizeStats = (stats: SongGuessrStats): SongGuessrStats => ({
  ...stats,
  distribution: [...stats.distribution],
  skips: isNonNegativeInteger(stats.skips) ? stats.skips : 0,
  firstPlayedAt:
    typeof stats.firstPlayedAt === 'number' &&
    Number.isFinite(stats.firstPlayedAt) &&
    stats.firstPlayedAt >= 0
      ? stats.firstPlayedAt
      : 0,
  recentRounds: Array.isArray(stats.recentRounds)
    ? stats.recentRounds.filter(isRoundRecord).slice(0, SONG_GUESSR_RECENT_ROUNDS_CAP)
    : []
});

const createEmptyState = (): SongGuessrPersistedState => ({
  version: 1,
  stats: createEmptyStats(),
  poolType: 'library',
  recentSongIds: []
});

export const loadSongGuessrState = (): SongGuessrPersistedState => {
  try {
    if (typeof window === 'undefined') return createEmptyState();

    const serialized = window.localStorage.getItem(SONG_GUESSR_STORAGE_KEY);
    if (!serialized) return createEmptyState();

    const parsed: unknown = JSON.parse(serialized);
    if (!isRecord(parsed) || parsed.version !== 1 || !isValidStats(parsed.stats)) {
      return createEmptyState();
    }

    const recentSongIds = Array.isArray(parsed.recentSongIds)
      ? parsed.recentSongIds.filter(
          (songId): songId is string => typeof songId === 'string' && songId.length > 0
        )
      : [];
    const poolType = isPoolType(parsed.poolType) ? parsed.poolType : 'library';
    const state: SongGuessrPersistedState = {
      version: 1,
      stats: normalizeStats(parsed.stats),
      poolType,
      recentSongIds
    };

    if (typeof parsed.poolId === 'string' && parsed.poolId.length > 0) state.poolId = parsed.poolId;
    return state;
  } catch {
    return createEmptyState();
  }
};

export const saveSongGuessrState = (state: SongGuessrPersistedState): void => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SONG_GUESSR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Persistence is best effort; an unavailable or full store must not break the game.
  }
};

export const pushRecentSongId = (
  state: SongGuessrPersistedState,
  songId: string,
  cap = 50
): SongGuessrPersistedState => {
  const boundedCap = Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : 50;
  if (boundedCap === 0) return { ...state, recentSongIds: [] };

  const withoutSong = state.recentSongIds.filter((recentSongId) => recentSongId !== songId);
  return {
    ...state,
    recentSongIds: [songId, ...withoutSong].slice(0, boundedCap)
  };
};
