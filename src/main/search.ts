import {
  getAlbumsData,
  getArtistsData,
  getGenresData,
  getSongsData,
  getPlaylistData,
  getUserData,
  setUserData,
  getBlacklistData,
  getListeningData
} from './filesystem';
import {
  getAlbumArtworkPath,
  getArtistArtworkPath,
  getPlaylistArtworkPath,
  getSongArtworkPath
} from './fs/resolveFilePaths';
import filterUniqueObjects from './utils/filterUniqueObjects';
import logger from './logger';
import { buildQueryVariants, buildTextKeys, type SearchVariant } from '../common/searchFolding';
import { dropLooseMatchesWhenCleanOnesExist, scoreSearchValue } from '../common/searchScoring';
import { hasRomanizableScript, romanizeForSearch } from './utils/romanizeForSearch';

/*
  ONE ranked pass over the library, for every kind of result.

  What this replaced: a predictive branch (whole-string edit distance over
  titles) that returned things like `wasted` for `aster`, an unescaped-regex
  branch that ran only when the first found nothing, and a folded branch that
  ran only when both found nothing. Three strategies, mutually exclusive, none
  of them ranked — so a good match could be hidden behind a bad one purely
  because a worse strategy answered first.

  Now every candidate gets a score from `searchScoring` (exact > prefix > word
  prefix > all words in any order > substring > typo > letters in order),
  measured across every spelling from `searchFolding` (plain, folded,
  transliterated, layout-swapped, digits spelled out). Lowest wins, guesses are
  dropped whenever anything matched cleanly, and listens break the remaining
  ties so the tracks actually played come first.
*/

/** Which field a match landed in. Ties only — far too small to cross a band. */
const TITLE_FIELD = 0;
const COMBINED_FIELD = 4;
const ARTIST_FIELD = 8;
const ALBUM_FIELD = 12;
/** The most a well-played track can climb within its own band. */
const MAX_POPULARITY_BONUS = 0.9;

type ScoredMatch<T> = { entry: T; score: number };

const buildKeys = (value: string) =>
  buildTextKeys(value, hasRomanizableScript(value) ? romanizeForSearch(value) : undefined);

/** Best score over every (query spelling × indexed spelling) pair. */
const scoreKeys = (queryVariants: SearchVariant[], keys: SearchVariant[], field: number) => {
  let best = Number.POSITIVE_INFINITY;

  for (const query of queryVariants) {
    if (query.text.length === 0) continue;
    for (const key of keys) {
      const score = scoreSearchValue(query.text, key.text) + query.penalty + key.penalty;
      if (score < best) best = score;
    }
  }

  return best === Number.POSITIVE_INFINITY ? best : best + field;
};

/*
  Key building is the expensive half — folding, transliterating and romanizing
  every title in the library. It is cached against the identity of the data
  array itself, which `filesystem` replaces whenever the library changes, so a
  keystroke re-scores but never re-builds.
*/
type SongSearchEntry = {
  song: SavableSongData;
  title: SearchVariant[];
  artists: SearchVariant[][];
  album: SearchVariant[];
  /** title and artists as one string — people type them as a single phrase */
  combined: SearchVariant[];
};

type NamedSearchEntry<T> = { entry: T; name: SearchVariant[] };

let songIndexSource: SavableSongData[] | undefined;
let songIndex: SongSearchEntry[] = [];

const getSongIndex = (songs: SavableSongData[]) => {
  if (songs !== songIndexSource) {
    songIndexSource = songs;
    songIndex = songs.map((song) => {
      const artistNames = song.artists?.map((artist) => artist.name) ?? [];

      return {
        song,
        title: buildKeys(song.title),
        artists: artistNames.map((name) => buildKeys(name)),
        album: song.album?.name ? buildKeys(song.album.name) : [],
        combined: buildKeys([song.title, ...artistNames].join(' '))
      };
    });
  }

  return songIndex;
};

const createNamedIndex = <T>(getName: (entry: T) => string) => {
  let source: T[] | undefined;
  let index: NamedSearchEntry<T>[] = [];

  return (entries: T[]) => {
    if (entries !== source) {
      source = entries;
      index = entries.map((entry) => ({ entry, name: buildKeys(getName(entry)) }));
    }
    return index;
  };
};

const getArtistIndex = createNamedIndex<SavableArtist>((artist) => artist.name);
const getAlbumIndex = createNamedIndex<SavableAlbum>((album) => album.title);
const getPlaylistIndex = createNamedIndex<SavablePlaylist>((playlist) => playlist.name);
const getGenreIndex = createNamedIndex<SavableGenre>((genre) => genre.name);

/** Listens as a tie-break: among equally good matches, the played one first. */
const getPopularity = () => {
  try {
    const popularity = new Map<string, number>();
    for (const data of getListeningData()) {
      const yearlyListens =
        data.listens?.reduce((total, year) => total + (year.listens?.length ?? 0), 0) ?? 0;
      popularity.set(data.songId, yearlyListens + (data.fullListens ?? 0));
    }
    return popularity;
  } catch (error) {
    logger.debug('Failed to read listening data for search ranking.', { error });
    return new Map<string, number>();
  }
};

const applyPopularity = (score: number, listens: number) =>
  score - Math.min(Math.log10(1 + Math.max(listens, 0)) * 0.3, MAX_POPULARITY_BONUS);

const finish = <T>(matches: ScoredMatch<T>[]) =>
  dropLooseMatchesWhenCleanOnesExist(matches)
    .sort((left, right) => left.score - right.score)
    .map((match) => match.entry);

const getSongSearchResults = (
  songs: SavableSongData[],
  keyword: string,
  filter: SearchFilters
): SongData[] => {
  if (!Array.isArray(songs) || songs.length === 0 || (filter !== 'Songs' && filter !== 'All'))
    return [];

  const queryVariants = buildQueryVariants(keyword);
  if (queryVariants.length === 0) return [];

  const { songBlacklist } = getBlacklistData();
  const popularity = getPopularity();
  const matches: ScoredMatch<SavableSongData>[] = [];

  for (const entry of getSongIndex(songs)) {
    let score = scoreKeys(queryVariants, entry.title, TITLE_FIELD);

    for (const artist of entry.artists) {
      const artistScore = scoreKeys(queryVariants, artist, ARTIST_FIELD);
      if (artistScore < score) score = artistScore;
    }

    const albumScore = scoreKeys(queryVariants, entry.album, ALBUM_FIELD);
    if (albumScore < score) score = albumScore;

    const combinedScore = scoreKeys(queryVariants, entry.combined, COMBINED_FIELD);
    if (combinedScore < score) score = combinedScore;

    if (Number.isFinite(score))
      matches.push({
        entry: entry.song,
        score: applyPopularity(score, popularity.get(entry.song.songId) ?? 0)
      });
  }

  return finish(matches).map((song) => ({
    ...song,
    artworkPaths: getSongArtworkPath(song.songId, song.isArtworkAvailable),
    isBlacklisted: songBlacklist?.includes(song.songId)
  }));
};

const searchNamedEntries = <T>(index: NamedSearchEntry<T>[], keyword: string) => {
  const queryVariants = buildQueryVariants(keyword);
  if (queryVariants.length === 0) return [];

  const matches: ScoredMatch<T>[] = [];
  for (const indexed of index) {
    const score = scoreKeys(queryVariants, indexed.name, TITLE_FIELD);
    if (Number.isFinite(score)) matches.push({ entry: indexed.entry, score });
  }

  return finish(matches);
};

const getArtistSearchResults = (
  artists: SavableArtist[],
  keyword: string,
  filter: SearchFilters
): Artist[] => {
  if (!Array.isArray(artists) || artists.length === 0 || (filter !== 'Artists' && filter !== 'All'))
    return [];

  return searchNamedEntries(getArtistIndex(artists), keyword).map((artist) => ({
    ...artist,
    artworkPaths: getArtistArtworkPath(artist.artworkName)
  }));
};

const getAlbumSearchResults = (
  albums: SavableAlbum[],
  keyword: string,
  filter: SearchFilters
): Album[] => {
  if (!Array.isArray(albums) || albums.length === 0 || (filter !== 'Albums' && filter !== 'All'))
    return [];

  return searchNamedEntries(getAlbumIndex(albums), keyword).map((album) => ({
    ...album,
    artworkPaths: getAlbumArtworkPath(album.artworkName)
  }));
};

const getPlaylistSearchResults = (
  playlists: SavablePlaylist[],
  keyword: string,
  filter: SearchFilters
): Playlist[] => {
  if (
    !Array.isArray(playlists) ||
    playlists.length === 0 ||
    (filter !== 'Playlists' && filter !== 'All')
  )
    return [];

  return searchNamedEntries(getPlaylistIndex(playlists), keyword).map((playlist) => ({
    ...playlist,
    artworkPaths: getPlaylistArtworkPath(playlist.playlistId, playlist.isArtworkAvailable)
  }));
};

const getGenreSearchResults = (
  genres: SavableGenre[],
  keyword: string,
  filter: SearchFilters
): Genre[] => {
  if (!Array.isArray(genres) || genres.length === 0 || (filter !== 'Genres' && filter !== 'All'))
    return [];

  return searchNamedEntries(getGenreIndex(genres), keyword).map((genre) => ({
    ...genre,
    artworkPaths: getAlbumArtworkPath(genre.artworkName)
  }));
};

let recentSearchesTimeoutId: NodeJS.Timeout;
const search = (filter: SearchFilters, value: string, updateSearchHistory = true): SearchResult => {
  const songsData = getSongsData();
  const artistsData = getArtistsData();
  const albumsData = getAlbumsData();
  const genresData = getGenresData();
  const playlistData = getPlaylistData();

  const keywords = value.split(';');

  let songs: SongData[] = [];
  let artists: Artist[] = [];
  let albums: Album[] = [];
  let playlists: Playlist[] = [];
  let genres: Genre[] = [];

  for (const keyword of keywords) {
    songs.push(...getSongSearchResults(songsData, keyword, filter));
    artists.push(...getArtistSearchResults(artistsData, keyword, filter));
    albums.push(...getAlbumSearchResults(albumsData, keyword, filter));
    playlists.push(...getPlaylistSearchResults(playlistData, keyword, filter));
    genres.push(...getGenreSearchResults(genresData, keyword, filter));
  }

  songs = filterUniqueObjects(songs, 'songId');
  artists = filterUniqueObjects(artists, 'artistId');
  albums = filterUniqueObjects(albums, 'albumId');
  playlists = filterUniqueObjects(playlists, 'playlistId');
  genres = filterUniqueObjects(genres, 'genreId');

  logger.debug(`Searching for results.`, {
    keyword: value,
    filter,
    totalResults: songs.length + artists.length + albums.length + playlists.length,
    songsResults: songs.length,
    artistsResults: artists.length,
    albumsResults: albums.length,
    playlistsResults: playlists.length,
    genresResults: genres.length
  });

  if (updateSearchHistory) {
    if (recentSearchesTimeoutId) clearTimeout(recentSearchesTimeoutId);
    recentSearchesTimeoutId = setTimeout(() => {
      const userData = getUserData();
      if (userData) {
        const { recentSearches } = userData;
        if (Array.isArray(userData.recentSearches)) {
          if (recentSearches.length > 10) recentSearches.pop();
          if (recentSearches.includes(value))
            recentSearches.splice(recentSearches.indexOf(value), 1);
          recentSearches.unshift(value);
        }
        setUserData('recentSearches', recentSearches);
      }
    }, 2000);
  }

  const availableResults: string[] = [];
  if (
    songs.length === 0 &&
    artists.length === 0 &&
    albums.length === 0 &&
    playlists.length === 0 &&
    genres.length === 0
  ) {
    let input = value;
    while (availableResults.length < 5 && input.length > 0) {
      input = input.substring(0, input.length - 1);
      const results = getSongSearchResults(songsData, input, filter);
      if (results.length > 0) {
        for (let i = 0; i < results.length; i += 1) {
          const element = results[i].title.split(' ').slice(0, 3).join(' ');
          if (!availableResults.includes(element)) {
            availableResults.push(element);
            break;
          }
        }
      }
    }
  }

  return {
    songs,
    artists,
    albums,
    playlists,
    genres,
    availableResults
  };
};

export default search;
