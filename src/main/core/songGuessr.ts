import { existsSync } from 'node:fs';

import {
  buildQueryVariants,
  buildTextKeys,
  normalizeSearchText,
  type SearchVariant
} from '../../common/searchFolding';
import { scoreSearchValue } from '../../common/searchScoring';
import { getBlacklistData, getGenresData, getPlaylistData, getSongsData } from '../filesystem';
import { getSongArtworkPath, resolveSongFilePath } from '../fs/resolveFilePaths';
import logger from '../logger';
import { isSongBlacklisted } from '../utils/isBlacklisted';
import { hasRomanizableScript, romanizeForSearch } from '../utils/romanizeForSearch';

const MINIMUM_SONG_DURATION = 15;
const MINIMUM_POOL_SIZE_FOR_EXCLUSIONS = 10;
const DEFAULT_SEARCH_LIMIT = 8;
/** Per request, not per query — the guess box pages through the full ranking. */
const MAX_SEARCH_PAGE_SIZE = 60;
const APP_PLAYLIST_IDS = new Set(['Favorites', 'History', 'Rediscover']);

type SearchIndexEntry = {
  song: SavableSongData;
  /** every spelling the title is searchable under, cheapest first */
  title: SearchVariant[];
  artists: SearchVariant[][];
  /** title and artists as one string — people type `artist title` as a phrase */
  combined: SearchVariant[];
  index: number;
};

type RankedSearchEntry = {
  entry: SearchIndexEntry;
  score: number;
};

let searchIndexSource: SavableSongData[] | undefined;
let searchIndexBlacklistKey = '';
let searchIndex: SearchIndexEntry[] = [];

/** Romanization is the one expensive key, so only pay for it where it applies. */
const buildSearchKeys = (value: string) =>
  buildTextKeys(value, hasRomanizableScript(value) ? romanizeForSearch(value) : undefined);

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
    searchIndex = songs.filter(isEligibleSong).map((song, index) => {
      const artistNames = song.artists?.map((artist) => artist.name) ?? [];

      return {
        song,
        title: buildSearchKeys(song.title),
        artists: artistNames.map((name) => buildSearchKeys(name)),
        combined: buildSearchKeys([song.title, ...artistNames].join(' ')),
        index
      };
    });
  }

  return searchIndex;
};

/**
 * Best score over every (query spelling × indexed spelling) pair, each paying
 * for the layers it needed. A plain hit therefore always outranks a folded or
 * transliterated one, which is what keeps the extra reach from becoming noise.
 */
const scoreSearchKeys = (queryVariants: SearchVariant[], keys: SearchVariant[]) => {
  let best = Number.POSITIVE_INFINITY;

  for (const query of queryVariants) {
    for (const key of keys) {
      const score = scoreSearchValue(query.text, key.text) + query.penalty + key.penalty;
      if (score < best) best = score;
    }
  }

  return best;
};

const scoreSearchEntry = (queryVariants: SearchVariant[], entry: SearchIndexEntry) => {
  let best = scoreSearchKeys(queryVariants, entry.title);

  for (const artist of entry.artists) {
    const score = scoreSearchKeys(queryVariants, artist) + 1;
    if (score < best) best = score;
  }

  // Two points behind the fields themselves: a track actually called `Halo`
  // should still come before one merely by an artist of that name.
  const combinedScore = scoreSearchKeys(queryVariants, entry.combined) + 2;
  if (combinedScore < best) best = combinedScore;

  return best;
};

const compareRankedEntries = (left: RankedSearchEntry, right: RankedSearchEntry) =>
  left.score - right.score || left.entry.index - right.entry.index;

/**
 * The complete ranking for the last query. Scoring is a full library sweep, so
 * paging through the results has to reuse it — recomputing per page would make
 * scrolling cost more the further down the user goes. Invalidated by identity:
 * a rebuilt search index is a different array.
 */
let rankedQuery = '';
let rankedSource: SearchIndexEntry[] | undefined;
let rankedMatches: SearchIndexEntry[] = [];

const getRankedMatches = (normalizedQuery: string, rawQuery: string) => {
  const index = getSearchIndex();
  if (normalizedQuery === rankedQuery && index === rankedSource) return rankedMatches;

  const queryVariants = buildQueryVariants(rawQuery);
  const matches: RankedSearchEntry[] = [];
  for (const entry of index) {
    const score = scoreSearchEntry(queryVariants, entry);
    if (Number.isFinite(score)) matches.push({ entry, score });
  }
  matches.sort(compareRankedEntries);

  rankedQuery = normalizedQuery;
  rankedSource = index;
  rankedMatches = matches.map((match) => match.entry);
  return rankedMatches;
};

const buildCandidate = (entry: SearchIndexEntry): SongGuessrCandidate => ({
  songId: entry.song.songId,
  title: entry.song.title,
  artists: entry.song.artists?.map((artist) => artist.name) ?? [],
  // Full artwork on purpose: the optimized copy is only 50x50, which a
  // 36 px thumb has to upscale on any display above 100% scaling.
  artworkPath: getSongArtworkPath(entry.song.songId, entry.song.isArtworkAvailable).artworkPath
});

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
  limit = DEFAULT_SEARCH_LIMIT,
  offset = 0
): SongGuessrSearchResult => {
  const emptyResult: SongGuessrSearchResult = { candidates: [], total: 0 };

  try {
    if (typeof query !== 'string' || query.trim().length === 0) return emptyResult;

    const normalizedQuery = normalizeSearchText(query);
    if (normalizedQuery.length === 0) return emptyResult;

    const requestedLimit =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.floor(limit)
        : DEFAULT_SEARCH_LIMIT;
    const pageSize = Math.min(Math.max(requestedLimit, 0), MAX_SEARCH_PAGE_SIZE);
    const start =
      typeof offset === 'number' && Number.isFinite(offset) ? Math.max(Math.floor(offset), 0) : 0;

    const matches = getRankedMatches(normalizedQuery, query);
    if (pageSize === 0) return { candidates: [], total: matches.length };

    return {
      candidates: matches.slice(start, start + pageSize).map(buildCandidate),
      total: matches.length
    };
  } catch (error) {
    logger.error('Failed to search SongGuessr candidates.', { error });
    return emptyResult;
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
