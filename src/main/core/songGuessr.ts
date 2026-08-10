import { existsSync } from 'node:fs';

import { getBlacklistData, getGenresData, getPlaylistData, getSongsData } from '../filesystem';
import { getSongArtworkPath, resolveSongFilePath } from '../fs/resolveFilePaths';
import logger from '../logger';
import { isSongBlacklisted } from '../utils/isBlacklisted';

const MINIMUM_SONG_DURATION = 15;
const MINIMUM_POOL_SIZE_FOR_EXCLUSIONS = 10;
const DEFAULT_SEARCH_LIMIT = 8;
const MAX_SEARCH_LIMIT = 25;
const APP_PLAYLIST_IDS = new Set(['Favorites', 'History', 'Rediscover']);

type SearchIndexEntry = {
  song: SavableSongData;
  title: string;
  artists: string[];
  index: number;
};

type RankedSearchEntry = {
  entry: SearchIndexEntry;
  score: number;
};

let searchIndexSource: SavableSongData[] | undefined;
let searchIndexBlacklistKey = '';
let searchIndex: SearchIndexEntry[] = [];

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const getBlacklistKey = (blacklist: Blacklist) =>
  `${blacklist.songBlacklist.join('\u0000')}\u0001${blacklist.folderBlacklist.join('\u0000')}`;

const isEligibleSong = (song: SavableSongData) => {
  if (
    !song ||
    typeof song.songId !== 'string' ||
    typeof song.path !== 'string' ||
    typeof song.duration !== 'number' ||
    !Number.isFinite(song.duration) ||
    song.duration < MINIMUM_SONG_DURATION
  ) {
    return false;
  }

  try {
    return !isSongBlacklisted(song.songId, song.path) && existsSync(song.path);
  } catch {
    return false;
  }
};

const getEligibleSongs = () => getSongsData().filter(isEligibleSong);

const buildSongEntry = (song: SavableSongData): SongGuessrEntry => ({
  songId: song.songId,
  title: song.title,
  artists: song.artists?.map((artist) => artist.name) ?? [],
  ...(song.album?.name ? { album: song.album.name } : {}),
  duration: song.duration,
  path: resolveSongFilePath(song.path, false),
  artworkPaths: getSongArtworkPath(song.songId, song.isArtworkAvailable)
});

const getSongIds = (songIds: unknown): Set<string> => {
  if (!Array.isArray(songIds)) return new Set();
  return new Set(songIds.filter((songId): songId is string => typeof songId === 'string'));
};

const getSongsForPool = (
  songs: SavableSongData[],
  poolType: SongGuessrPoolType,
  poolId?: string
) => {
  if (poolType === 'library') return songs;
  if (typeof poolId !== 'string' || poolId.length === 0) return [];

  if (poolType === 'playlist') {
    const playlist = getPlaylistData().find((entry) => entry.playlistId === poolId);
    if (!playlist) return [];
    const songIds = getSongIds(playlist.songs);
    return songs.filter((song) => songIds.has(song.songId));
  }

  const genre = getGenresData().find((entry) => entry.genreId === poolId);
  if (!genre) return [];
  const songIds = getSongIds(genre.songs?.map((song) => song.songId));
  return songs.filter((song) => songIds.has(song.songId));
};

const getSearchIndex = () => {
  const songs = getSongsData();
  const blacklistKey = getBlacklistKey(getBlacklistData());

  if (songs !== searchIndexSource || blacklistKey !== searchIndexBlacklistKey) {
    searchIndexSource = songs;
    searchIndexBlacklistKey = blacklistKey;
    searchIndex = songs.filter(isEligibleSong).map((song, index) => ({
      song,
      title: normalizeSearchText(song.title),
      artists: song.artists?.map((artist) => normalizeSearchText(artist.name)) ?? [],
      index
    }));
  }

  return searchIndex;
};

const fuzzyScore = (query: string, value: string) => {
  if (query.length < 2 || value.length === 0) return Number.POSITIVE_INFINITY;

  let queryIndex = 0;
  let valueIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;

  while (queryIndex < query.length && valueIndex < value.length) {
    if (query[queryIndex] === value[valueIndex]) {
      if (firstMatch === -1) firstMatch = valueIndex;
      lastMatch = valueIndex;
      queryIndex += 1;
    }
    valueIndex += 1;
  }

  if (queryIndex !== query.length) return Number.POSITIVE_INFINITY;

  const span = lastMatch - firstMatch + 1;
  const leadingGap = firstMatch;
  const internalGaps = span - query.length;
  return 1000 + leadingGap + internalGaps * 2 + (value.length - query.length) * 0.01;
};

const scoreSearchValue = (query: string, value: string) => {
  if (value === query) return 0;
  if (value.startsWith(query)) return 100 + value.length * 0.01;
  if (value.split(' ').some((word) => word.startsWith(query))) return 150 + value.length * 0.01;

  const substringIndex = value.indexOf(query);
  if (substringIndex >= 0) return 250 + substringIndex + value.length * 0.01;

  return fuzzyScore(query, value);
};

const scoreSearchEntry = (query: string, entry: SearchIndexEntry) => {
  const scores = [scoreSearchValue(query, entry.title)];
  scores.push(...entry.artists.map((artist) => scoreSearchValue(query, artist) + 1));
  return Math.min(...scores);
};

const compareRankedEntries = (left: RankedSearchEntry, right: RankedSearchEntry) =>
  left.score - right.score || left.entry.index - right.entry.index;

const addRankedEntry = (
  rankedEntries: RankedSearchEntry[],
  candidate: RankedSearchEntry,
  limit: number
) => {
  if (rankedEntries.length === limit && compareRankedEntries(candidate, rankedEntries.at(-1)!) >= 0)
    return;

  let insertAt = 0;
  while (
    insertAt < rankedEntries.length &&
    compareRankedEntries(rankedEntries[insertAt]!, candidate) <= 0
  ) {
    insertAt += 1;
  }
  rankedEntries.splice(insertAt, 0, candidate);
  if (rankedEntries.length > limit) rankedEntries.pop();
};

export const getSongGuessrRound = (options: SongGuessrRoundOptions): SongGuessrRound | null => {
  try {
    if (
      !options ||
      (options.poolType !== 'library' &&
        options.poolType !== 'playlist' &&
        options.poolType !== 'genre')
    ) {
      return null;
    }

    const eligibleSongs = getEligibleSongs();
    const poolSongs = getSongsForPool(eligibleSongs, options.poolType, options.poolId);
    if (poolSongs.length === 0) return null;

    const excludedSongIds = getSongIds(options.excludedSongIds);
    const nonExcludedSongs = poolSongs.filter((song) => !excludedSongIds.has(song.songId));
    const songsToChooseFrom =
      nonExcludedSongs.length >= MINIMUM_POOL_SIZE_FOR_EXCLUSIONS ? nonExcludedSongs : poolSongs;
    const randomIndex = Math.min(
      songsToChooseFrom.length - 1,
      Math.floor(Math.random() * songsToChooseFrom.length)
    );
    const answer = songsToChooseFrom[randomIndex];
    if (!answer) return null;

    return {
      answer: buildSongEntry(answer),
      poolSize: poolSongs.length
    };
  } catch (error) {
    logger.error('Failed to build a SongGuessr round.', { error });
    return null;
  }
};

export const searchSongGuessrCandidates = (
  query: string,
  limit = DEFAULT_SEARCH_LIMIT
): SongGuessrCandidate[] => {
  try {
    if (typeof query !== 'string' || query.trim().length === 0) return [];

    const normalizedQuery = normalizeSearchText(query);
    if (normalizedQuery.length === 0) return [];

    const requestedLimit =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.floor(limit)
        : DEFAULT_SEARCH_LIMIT;
    const resultLimit = Math.min(Math.max(requestedLimit, 0), MAX_SEARCH_LIMIT);
    if (resultLimit === 0) return [];

    const rankedEntries: RankedSearchEntry[] = [];
    for (const entry of getSearchIndex()) {
      const score = scoreSearchEntry(normalizedQuery, entry);
      if (Number.isFinite(score)) addRankedEntry(rankedEntries, { entry, score }, resultLimit);
    }

    return rankedEntries.map(({ entry }) => ({
      songId: entry.song.songId,
      title: entry.song.title,
      artists: entry.song.artists?.map((artist) => artist.name) ?? [],
      // Full artwork on purpose: the optimized copy is only 50x50, which a
      // 36 px thumb has to upscale on any display above 100% scaling.
      artworkPath: getSongArtworkPath(entry.song.songId, entry.song.isArtworkAvailable).artworkPath
    }));
  } catch (error) {
    logger.error('Failed to search SongGuessr candidates.', { error });
    return [];
  }
};

export const getSongGuessrPools = (): SongGuessrPoolOption[] => {
  try {
    const eligibleSongs = getEligibleSongs();
    const eligibleSongIds = new Set(eligibleSongs.map((song) => song.songId));
    const countEligibleSongIds = (songIds: unknown) => {
      const ids = getSongIds(songIds);
      let count = 0;
      for (const songId of ids) {
        if (eligibleSongIds.has(songId)) count += 1;
      }
      return count;
    };

    const pools: SongGuessrPoolOption[] = [
      { type: 'library', name: 'library', count: eligibleSongs.length }
    ];

    for (const playlist of getPlaylistData()) {
      if (APP_PLAYLIST_IDS.has(playlist.playlistId)) continue;
      const count = countEligibleSongIds(playlist.songs);
      if (count >= MINIMUM_POOL_SIZE_FOR_EXCLUSIONS) {
        pools.push({ type: 'playlist', id: playlist.playlistId, name: playlist.name, count });
      }
    }

    for (const genre of getGenresData()) {
      const count = countEligibleSongIds(genre.songs?.map((song) => song.songId));
      if (count >= MINIMUM_POOL_SIZE_FOR_EXCLUSIONS) {
        pools.push({ type: 'genre', id: genre.genreId, name: genre.name, count });
      }
    }

    return pools;
  } catch (error) {
    logger.error('Failed to get SongGuessr pools.', { error });
    return [];
  }
};
