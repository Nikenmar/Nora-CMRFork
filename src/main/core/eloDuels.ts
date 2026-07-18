import {
  getCmrStatsData,
  getListeningData,
  getPlaylistData,
  getSongsData,
  setCmrStatsData
} from '../filesystem';
import { getSongArtworkPath, resolveSongFilePath } from '../fs/resolveFilePaths';
import { dataUpdateEvent } from '../main';
import { isSongBlacklisted } from '../utils/isBlacklisted';
import logger from '../logger';

const ELO_START_RATING = 1200;
const ELO_K_FACTOR = 32;
const ELO_HISTORY_CAP = 1000;
/** A song's opponents within the last N duels are excluded when picking its next rival. */
const RECENT_OPPONENT_MEMORY = 15;

const round1 = (value: number) => Math.round(value * 10) / 10;

const randomItem = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

/** Standard ELO expectation of A beating B. */
const expectedScore = (ratingA: number, ratingB: number) =>
  1 / (1 + 10 ** ((ratingB - ratingA) / 400));

const getRating = (elo: EloData, songId: string): EloSongRating =>
  elo.ratings[songId] ?? { rating: ELO_START_RATING, games: 0, wins: 0, losses: 0 };

/**
 * Stateless duel result: takes both song ids + the winner id, updates both
 * ratings, appends the history record (newest first, capped) and persists.
 */
export const submitDuelResult = (
  songAId: string,
  songBId: string,
  winnerSongId: string
): DuelResult => {
  if (songAId === songBId || (winnerSongId !== songAId && winnerSongId !== songBId))
    throw new Error('Invalid ELO duel result.');

  const cmrStats = getCmrStatsData();
  const { elo } = cmrStats;

  const ratingA = getRating(elo, songAId);
  const ratingB = getRating(elo, songBId);

  const aWins = winnerSongId === songAId;
  const expected = expectedScore(ratingA.rating, ratingB.rating);
  const deltaA = round1(ELO_K_FACTOR * ((aWins ? 1 : 0) - expected));
  const deltaB = round1(ELO_K_FACTOR * ((aWins ? 0 : 1) - (1 - expected)));

  const now = Date.now();
  const updatedA: EloSongRating = {
    rating: round1(ratingA.rating + deltaA),
    games: ratingA.games + 1,
    wins: ratingA.wins + (aWins ? 1 : 0),
    losses: ratingA.losses + (aWins ? 0 : 1),
    lastDuelAt: now
  };
  const updatedB: EloSongRating = {
    rating: round1(ratingB.rating + deltaB),
    games: ratingB.games + 1,
    wins: ratingB.wins + (aWins ? 0 : 1),
    losses: ratingB.losses + (aWins ? 1 : 0),
    lastDuelAt: now
  };

  const duelRecord: DuelRecord = {
    at: now,
    songAId,
    songBId,
    winner: aWins ? 'A' : 'B',
    deltaA,
    deltaB
  };

  setCmrStatsData({
    ...cmrStats,
    elo: {
      ratings: { ...elo.ratings, [songAId]: updatedA, [songBId]: updatedB },
      history: [duelRecord, ...elo.history].slice(0, ELO_HISTORY_CAP),
      totalDuels: elo.totalDuels + 1
    }
  });

  dataUpdateEvent('eloDuels');
  logger.debug('Duel result submitted.', { songAId, songBId, winnerSongId, deltaA, deltaB });

  return { deltaA, deltaB, ratingA: updatedA.rating, ratingB: updatedB.rating };
};

/**
 * Picks a duel pair from LISTENED songs only (a song you never heard can't be
 * judged). A leans recent (70% from the History playlist), B leans informative
 * (80% among the 15 nearest by rating) and skips A's last 15 opponents.
 */
export const getDuelPair = (): DuelPair | null => {
  const songs = getSongsData();
  const listeningData = getListeningData();
  const { elo } = getCmrStatsData();

  const listenedIds = new Set(
    listeningData
      .filter(
        (entry) =>
          (entry.fullListens ?? 0) > 0 ||
          entry.listens.some((year) => year.listens.some(([, count]) => count > 0))
      )
      .map((entry) => entry.songId)
  );

  const songById = new Map(songs.map((song) => [song.songId, song]));
  const pool = [...listenedIds].filter((songId) => {
    const song = songById.get(songId);
    return !!song && !isSongBlacklisted(song.songId, song.path);
  });

  if (pool.length < 2) return null;

  // ----- pick A: 70% recency (History top-50 ∩ pool), 30% under-dueled coverage -----
  const poolSet = new Set(pool);
  const historySongs = getPlaylistData(['History'])[0]?.songs ?? [];
  const recentPool = historySongs.filter((songId) => poolSet.has(songId));

  let songAId: string;
  if (recentPool.length > 0 && Math.random() < 0.7) {
    songAId = randomItem(recentPool);
  } else {
    const weights = pool.map((songId) => 1 / (1 + getRating(elo, songId).games));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = Math.random() * totalWeight;
    songAId = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) {
        songAId = pool[i];
        break;
      }
    }
  }

  // ----- pick B: skip A's last 15 opponents; 80% nearest by rating, 20% uniform -----
  const recentOpponents = new Set(
    elo.history
      .filter((record) => record.songAId === songAId || record.songBId === songAId)
      .slice(0, RECENT_OPPONENT_MEMORY)
      .flatMap((record) =>
        record.songAId === songAId
          ? [record.songBId]
          : record.songBId === songAId
            ? [record.songAId]
            : []
      )
  );
  let candidates = pool.filter((songId) => songId !== songAId && !recentOpponents.has(songId));
  if (candidates.length === 0) candidates = pool.filter((songId) => songId !== songAId);

  let songBId: string;
  if (Math.random() < 0.8) {
    const ratingA = getRating(elo, songAId).rating;
    const nearest = [...candidates]
      .sort(
        (a, b) =>
          Math.abs(getRating(elo, a).rating - ratingA) -
          Math.abs(getRating(elo, b).rating - ratingA)
      )
      .slice(0, 15);
    songBId = randomItem(nearest);
  } else {
    songBId = randomItem(candidates);
  }

  const toEntry = (songId: string): DuelSongEntry | undefined => {
    const song = songById.get(songId);
    if (!song) return undefined;
    const rating = getRating(elo, songId);
    return {
      songId,
      title: song.title,
      artists: song.artists?.map((artist) => artist.name) ?? [],
      duration: song.duration,
      path: resolveSongFilePath(song.path, false),
      artworkPaths: getSongArtworkPath(song.songId, song.isArtworkAvailable),
      rating: rating.rating,
      games: rating.games
    };
  };

  const songA = toEntry(songAId);
  const songB = toEntry(songBId);
  if (!songA || !songB) return null;
  return { songA, songB };
};
