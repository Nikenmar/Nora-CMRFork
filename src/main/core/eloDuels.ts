import {
  getCmrStatsData,
  getListeningData,
  getPlaylistData,
  getSongsData,
  getTierlistData,
  setCmrStatsData
} from '../filesystem';
import { getSongArtworkPath, resolveSongFilePath } from '../fs/resolveFilePaths';
import { dataUpdateEvent } from '../main';
import { isSongBlacklisted } from '../utils/isBlacklisted';
import logger from '../logger';
import {
  calculateEloDeltas,
  getEloRating,
  orderDuelSongIds,
  selectAdaptiveOpponent,
  selectDuelAnchor
} from './duelMatchmaker';
import type { MatchmakerSong } from './duelMatchmaker';

const ELO_HISTORY_CAP = 1000;
const SKIP_HISTORY_CAP = 250;

const round1 = (value: number) => Math.round(value * 10) / 10;

const applyDuelOutcome = (
  cmrStats: CmrStatsData,
  songAId: string,
  songBId: string,
  winner: DuelRecord['winner']
) => {
  const { elo } = cmrStats;
  const ratingA = getEloRating(elo, songAId);
  const ratingB = getEloRating(elo, songBId);
  const scoreA = winner === 'draw' ? 0.5 : winner === 'A' ? 1 : 0;
  const { deltaA, deltaB } = calculateEloDeltas(ratingA.rating, ratingB.rating, scoreA);
  const now = Date.now();
  const updatedA: EloSongRating = {
    rating: round1(ratingA.rating + deltaA),
    games: ratingA.games + 1,
    wins: ratingA.wins + (winner === 'A' ? 1 : 0),
    losses: ratingA.losses + (winner === 'B' ? 1 : 0),
    draws: (ratingA.draws ?? 0) + (winner === 'draw' ? 1 : 0),
    lastDuelAt: now
  };
  const updatedB: EloSongRating = {
    rating: round1(ratingB.rating + deltaB),
    games: ratingB.games + 1,
    wins: ratingB.wins + (winner === 'B' ? 1 : 0),
    losses: ratingB.losses + (winner === 'A' ? 1 : 0),
    draws: (ratingB.draws ?? 0) + (winner === 'draw' ? 1 : 0),
    lastDuelAt: now
  };
  const duelRecord: DuelRecord = {
    at: now,
    songAId,
    songBId,
    winner,
    deltaA,
    deltaB
  };

  return {
    data: {
      ...cmrStats,
      elo: {
        ratings: { ...elo.ratings, [songAId]: updatedA, [songBId]: updatedB },
        history: [duelRecord, ...elo.history].slice(0, ELO_HISTORY_CAP),
        totalDuels: elo.totalDuels + 1
      }
    },
    result: {
      deltaA,
      deltaB,
      ratingA: updatedA.rating,
      ratingB: updatedB.rating
    }
  };
};

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
  const winner = winnerSongId === songAId ? 'A' : 'B';
  const { data, result } = applyDuelOutcome(getCmrStatsData(), songAId, songBId, winner);
  setCmrStatsData(data);
  dataUpdateEvent('eloDuels');
  logger.debug('Duel result submitted.', { songAId, songBId, winnerSongId, ...result });
  return result;
};

const buildSongEntry = (
  songById: Map<string, SavableSongData>,
  elo: EloData,
  songId: string
): DuelSongEntry | undefined => {
  const song = songById.get(songId);
  if (!song) return undefined;
  const rating = getEloRating(elo, songId);
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

const getMatchmakerSongs = (
  songs: SavableSongData[],
  listeningData: SongListeningData[],
  elo: EloData
): MatchmakerSong[] => {
  const listenedIds = new Set(
    listeningData
      .filter(
        (entry) =>
          (entry.fullListens ?? 0) > 0 ||
          entry.listens.some((year) => year.listens.some(([, count]) => count > 0))
      )
      .map(({ songId }) => songId)
  );
  const playlistIdsBySong = new Map<string, string[]>();
  for (const playlist of getPlaylistData().filter(
    ({ playlistId }) => !['Favorites', 'History', 'Rediscover'].includes(playlistId)
  )) {
    for (const songId of playlist.songs) {
      const memberships = playlistIdsBySong.get(songId) ?? [];
      memberships.push(playlist.playlistId);
      playlistIdsBySong.set(songId, memberships);
    }
  }
  const tierlistIdsBySong = new Map<string, string[]>();
  for (const tierlist of getTierlistData()) {
    for (const tier of tierlist.tiers) {
      for (const songId of tier.items) {
        const memberships = tierlistIdsBySong.get(songId) ?? [];
        memberships.push(tierlist.tierlistId);
        tierlistIdsBySong.set(songId, memberships);
      }
    }
  }

  return songs
    .filter(
      (song) =>
        !isSongBlacklisted(song.songId, song.path) &&
        (listenedIds.has(song.songId) ||
          song.isAFavorite ||
          (elo.ratings[song.songId]?.games ?? 0) > 0 ||
          playlistIdsBySong.has(song.songId) ||
          tierlistIdsBySong.has(song.songId))
    )
    .map((song) => ({
      songId: song.songId,
      artistIds: song.artists?.map(({ artistId }) => artistId) ?? [],
      genreIds: song.genres?.map(({ genreId }) => genreId) ?? [],
      albumId: song.album?.albumId,
      playlistIds: playlistIdsBySong.get(song.songId) ?? [],
      tierlistIds: tierlistIdsBySong.get(song.songId) ?? []
    }));
};

export const selectDuelAnchorFromCandidates = (
  candidates: DuelAnchorCandidate[],
  excludedSongIds: string[] = []
): string | null => {
  const songs = getSongsData();
  const listeningData = getListeningData();
  const { elo } = getCmrStatsData();
  const matchmakerSongs = getMatchmakerSongs(songs, listeningData, elo);
  return (
    selectDuelAnchor(
      candidates,
      new Set(matchmakerSongs.map(({ songId }) => songId)),
      new Set(excludedSongIds),
      elo
    ) ?? null
  );
};

/**
 * Generates an adaptive pair at the moment it is shown. A pinned anchor is
 * required to still be eligible; manual duels choose a recent or under-calibrated
 * anchor. Card order is randomized independently of ticket identity.
 */
export const getDuelPair = (pinnedSongId?: string): DuelPair | null => {
  const songs = getSongsData();
  const listeningData = getListeningData();
  const cmrStats = getCmrStatsData();
  const { elo } = cmrStats;
  const songById = new Map(songs.map((song) => [song.songId, song]));
  const matchmakerSongs = getMatchmakerSongs(songs, listeningData, elo);
  if (matchmakerSongs.length < 2) return null;
  const eligibleIds = new Set(matchmakerSongs.map(({ songId }) => songId));

  let anchorSongId = pinnedSongId;
  if (anchorSongId && !eligibleIds.has(anchorSongId)) return null;
  if (!anchorSongId) {
    const historySongs = (getPlaylistData(['History'])[0]?.songs ?? [])
      .filter((songId) => eligibleIds.has(songId))
      .slice(0, 50);
    const useRecent = historySongs.length > 0 && Math.random() < 0.7;
    const anchorPool = useRecent ? historySongs : [...eligibleIds];
    const now = Date.now();
    anchorSongId = selectDuelAnchor(
      anchorPool.map((songId, index) => ({ songId, listenedAt: now - index })),
      eligibleIds,
      new Set(),
      elo,
      now
    );
  }
  if (!anchorSongId) return null;

  const opponentSongId = selectAdaptiveOpponent(
    anchorSongId,
    matchmakerSongs,
    elo,
    cmrStats.duelMatchmaking?.skippedPairs ?? []
  );
  if (!opponentSongId) return null;
  const [songAId, songBId] = orderDuelSongIds(anchorSongId, opponentSongId);
  const songA = buildSongEntry(songById, elo, songAId);
  const songB = buildSongEntry(songById, elo, songBId);
  if (!songA || !songB) return null;
  return {
    songA,
    songB,
    ...(pinnedSongId ? { ticketAnchorSongId: anchorSongId } : {})
  };
};

export const recordDuelSkip = (
  songAId: string,
  songBId: string,
  reason: DuelSkipReason = 'cantDecide'
) => {
  if (typeof songAId !== 'string' || typeof songBId !== 'string' || songAId === songBId) return;
  if (!['tooClose', 'tooDifferent', 'cantDecide'].includes(reason)) reason = 'cantDecide';
  let cmrStats = getCmrStatsData();
  if (reason === 'tooClose') cmrStats = applyDuelOutcome(cmrStats, songAId, songBId, 'draw').data;
  const skippedPairs = cmrStats.duelMatchmaking?.skippedPairs ?? [];
  setCmrStatsData({
    ...cmrStats,
    duelMatchmaking: {
      skippedPairs: [{ at: Date.now(), songAId, songBId, reason }, ...skippedPairs].slice(
        0,
        SKIP_HISTORY_CAP
      )
    }
  });
  dataUpdateEvent('eloDuels');
  logger.debug('Duel feedback recorded.', { songAId, songBId, reason });
};

/**
 * Rehydrates a legacy fixed pair. Kept for compatibility while old renderer
 * queues migrate to tickets.
 */
export const getDuelPairByIds = (songAId: string, songBId: string): DuelPair | null => {
  if (typeof songAId !== 'string' || typeof songBId !== 'string' || songAId === songBId)
    return null;
  const songs = getSongsData();
  const { elo } = getCmrStatsData();
  const songById = new Map(songs.map((song) => [song.songId, song]));
  const songAData = songById.get(songAId);
  const songBData = songById.get(songBId);
  if (!songAData || !songBData) return null;
  if (isSongBlacklisted(songAData.songId, songAData.path)) return null;
  if (isSongBlacklisted(songBData.songId, songBData.path)) return null;
  const songA = buildSongEntry(songById, elo, songAId);
  const songB = buildSongEntry(songById, elo, songBId);
  if (!songA || !songB) return null;
  return { songA, songB };
};
