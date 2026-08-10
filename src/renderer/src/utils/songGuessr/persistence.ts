import { SONG_GUESSR_MAX_ATTEMPTS, SONG_GUESSR_STORAGE_KEY } from './constants';
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
      stats: {
        ...parsed.stats,
        distribution: [...parsed.stats.distribution]
      },
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
