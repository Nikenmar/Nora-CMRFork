import {
  getCmrStatsData,
  getGenresData,
  getListeningData,
  getPlaylistData,
  getSongsData
} from '../filesystem';
import { getSongArtworkPath } from '../fs/resolveFilePaths';
import { isSongBlacklisted } from '../utils/isBlacklisted';
import logger from '../logger';
import { getEffectiveEloRating, getEloConfidence } from './duelMatchmaker';

const DAY_MS = 24 * 60 * 60 * 1000;

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

const getRangeStart = (timeRange: StatsTimeRange, now: number) => {
  if (timeRange === 'last30Days') return now - 30 * DAY_MS;
  if (timeRange === 'last12Months') return now - 365 * DAY_MS;
  return 0;
};

/** Sums day-counts across all yearly buckets, keeping only days inside the range. */
const countListensInRange = (data: SongListeningData, rangeStart: number) => {
  let count = 0;
  for (const year of data.listens)
    for (const [dateMs, dayCount] of year.listens) if (dateMs >= rangeStart) count += dayCount;
  return count;
};

const toISODate = (ms: number) => {
  const date = new Date(ms);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * Activity buckets. Monthly ranges produce 12 buckets ending at the current
 * month; last30Days produces 30 daily buckets ending today. Labels are ISO
 * dates of the bucket start — the renderer localizes them.
 */
const buildActivity = (
  listeningData: SongListeningData[],
  timeRange: StatsTimeRange,
  nowMs: number
) => {
  const now = new Date(nowMs);

  if (timeRange === 'last30Days') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const buckets = new Array<number>(30).fill(0);

    for (const entry of listeningData)
      for (const year of entry.listens)
        for (const [dateMs, count] of year.listens) {
          const date = new Date(dateMs);
          const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
          const daysAgo = Math.round((startOfToday - dayStart) / DAY_MS);
          if (daysAgo >= 0 && daysAgo < 30) buckets[29 - daysAgo] += count;
        }

    return buckets.map((listens, i) => ({
      label: toISODate(startOfToday - (29 - i) * DAY_MS),
      listens
    }));
  }

  const nowMonthIndex = now.getFullYear() * 12 + now.getMonth();
  const buckets = new Array<number>(12).fill(0);

  for (const entry of listeningData)
    for (const year of entry.listens)
      for (const [dateMs, count] of year.listens) {
        const date = new Date(dateMs);
        const monthsAgo = nowMonthIndex - (date.getFullYear() * 12 + date.getMonth());
        if (monthsAgo >= 0 && monthsAgo < 12) buckets[11 - monthsAgo] += count;
      }

  return buckets.map((listens, i) => {
    const monthIndex = nowMonthIndex - (11 - i);
    const year = Math.floor(monthIndex / 12);
    const month = ((monthIndex % 12) + 12) % 12;
    return { label: toISODate(new Date(year, month, 1).getTime()), listens };
  });
};

/**
 * Range-independent GitHub-style activity calendar: always the trailing 53
 * weeks (371 days) ending today, plus streak stats. Consumed by the renderer
 * as 7 weekday rows x N week columns.
 */
const buildCalendar = (listeningData: SongListeningData[], nowMs: number) => {
  const dayCount = 371;
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = new Array<number>(dayCount).fill(0);

  for (const entry of listeningData)
    for (const year of entry.listens)
      for (const [dateMs, count] of year.listens) {
        const date = new Date(dateMs);
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        const daysAgo = Math.round((startOfToday - dayStart) / DAY_MS);
        if (daysAgo >= 0 && daysAgo < dayCount) days[dayCount - 1 - daysAgo] += count;
      }

  // Current streak counts back from today; a silent (so far) today does not kill it.
  let currentStreak = 0;
  let cursor = dayCount - 1;
  if (days[cursor] === 0) cursor -= 1;
  while (cursor >= 0 && days[cursor] > 0) {
    currentStreak += 1;
    cursor -= 1;
  }

  let longestStreak = 0;
  let run = 0;
  let mostActiveDay: { date: string; listens: number } | null = null;
  for (let i = 0; i < dayCount; i += 1) {
    run = days[i] > 0 ? run + 1 : 0;
    if (run > longestStreak) longestStreak = run;
    if (days[i] > 0 && (!mostActiveDay || days[i] > mostActiveDay.listens))
      mostActiveDay = {
        date: toISODate(startOfToday - (dayCount - 1 - i) * DAY_MS),
        listens: days[i]
      };
  }

  return {
    days: days.map((listens, i) => ({
      date: toISODate(startOfToday - (dayCount - 1 - i) * DAY_MS),
      listens
    })),
    currentStreak,
    longestStreak,
    mostActiveDay
  };
};

const getStatsData = (timeRange: StatsTimeRange): StatsData => {
  const now = Date.now();
  const rangeStart = getRangeStart(timeRange, now);

  const songs = getSongsData();
  const listeningData = getListeningData();
  const elo = getCmrStatsData().elo;

  const songById = new Map(songs.map((song) => [song.songId, song]));

  // listens per song inside the selected range
  const listensBySongId = new Map<string, number>();
  let totalListens = 0;
  let fullListens = 0;
  let skips = 0;
  for (const entry of listeningData) {
    const inRange = countListensInRange(entry, rangeStart);
    listensBySongId.set(entry.songId, inRange);
    totalListens += inRange;
    fullListens += entry.fullListens ?? 0;
    skips += entry.skips ?? 0;
  }

  const favorites = getPlaylistData(['Favorites'])[0]?.songs.length ?? 0;

  let approxListeningTimeSec = 0;
  for (const [songId, count] of listensBySongId) {
    const song = songById.get(songId);
    if (song) approxListeningTimeSec += count * song.duration;
  }

  const isVisibleSong = (song: SavableSongData | undefined): song is SavableSongData =>
    !!song && !isSongBlacklisted(song.songId, song.path);

  const toSongEntry = (song: SavableSongData, listensInRange: number): StatsSongEntry => ({
    songId: song.songId,
    title: song.title,
    artists: song.artists?.map((artist) => artist.name) ?? [],
    artworkPath: getSongArtworkPath(song.songId, song.isArtworkAvailable).artworkPath,
    listensInRange
  });

  // ----- top songs -----
  const topSongs = songs
    .filter((song) => (listensBySongId.get(song.songId) ?? 0) > 0 && isVisibleSong(song))
    .map((song) => toSongEntry(song, listensBySongId.get(song.songId) ?? 0))
    .sort((a, b) => b.listensInRange - a.listensInRange || a.title.localeCompare(b.title))
    .slice(0, 25);

  // ----- top artists / albums / genres (song-side joins) -----
  const artistListens = new Map<string, StatsNameEntry>();
  const albumListens = new Map<string, StatsNameEntry>();
  const genreListens = new Map<string, StatsNameEntry>();

  for (const song of songs) {
    const listens = listensBySongId.get(song.songId) ?? 0;
    if (listens === 0 || !isVisibleSong(song)) continue;

    for (const artist of song.artists ?? []) {
      const key = artist.artistId || artist.name.trim().toLowerCase();
      const entry = artistListens.get(key) ?? {
        name: artist.name,
        artistId: artist.artistId,
        listens: 0
      };
      entry.listens += listens;
      artistListens.set(key, entry);
    }

    if (song.album) {
      const key = song.album.albumId || song.album.name.trim().toLowerCase();
      const entry = albumListens.get(key) ?? { name: song.album.name, listens: 0 };
      entry.listens += listens;
      albumListens.set(key, entry);
    }

    for (const genre of song.genres ?? []) {
      const key = genre.genreId || genre.name.trim().toLowerCase();
      const entry = genreListens.get(key) ?? { name: genre.name, listens: 0 };
      entry.listens += listens;
      genreListens.set(key, entry);
    }
  }

  // Fallback for libraries where songs carry no genre refs: aggregate via the genre store.
  if (genreListens.size === 0) {
    for (const genre of getGenresData()) {
      let listens = 0;
      for (const genreSong of genre.songs) {
        if (isVisibleSong(songById.get(genreSong.songId)))
          listens += listensBySongId.get(genreSong.songId) ?? 0;
      }
      if (listens > 0) genreListens.set(genre.genreId, { name: genre.name, listens });
    }
  }

  const byListensDesc = (a: StatsNameEntry, b: StatsNameEntry) =>
    b.listens - a.listens || a.name.localeCompare(b.name);

  const topArtists = [...artistListens.values()].sort(byListensDesc).slice(0, 10);
  const topAlbums = [...albumListens.values()].sort(byListensDesc).slice(0, 10);
  const topGenres = [...genreListens.values()].sort(byListensDesc).slice(0, 10);

  // ----- most skipped (all-time skips scalar) -----
  const mostSkipped = listeningData
    .filter((entry) => (entry.skips ?? 0) > 0)
    .map((entry) => {
      const song = songById.get(entry.songId);
      if (!isVisibleSong(song)) return undefined;
      return {
        ...toSongEntry(song, listensBySongId.get(entry.songId) ?? 0),
        skips: entry.skips ?? 0
      };
    })
    .filter(isDefined)
    .sort((a, b) => (b.skips ?? 0) - (a.skips ?? 0) || a.title.localeCompare(b.title))
    .slice(0, 10);

  // ----- ELO -----
  const topRated = Object.entries(elo.ratings)
    .filter(([, rating]) => rating.games > 0)
    .map(([songId, rating]) => {
      const song = songById.get(songId);
      if (!isVisibleSong(song)) return undefined;
      return {
        ...toSongEntry(song, listensBySongId.get(songId) ?? 0),
        rating: rating.rating,
        effectiveRating: getEffectiveEloRating(rating),
        isProvisional: getEloConfidence(rating) < 1,
        games: rating.games,
        wins: rating.wins,
        losses: rating.losses,
        draws: rating.draws ?? 0
      };
    })
    .filter(isDefined)
    .sort((a, b) => b.effectiveRating - a.effectiveRating || a.title.localeCompare(b.title))
    .slice(0, 10);

  const recentDuels = elo.history.slice(0, 10).map((duel) => ({
    at: duel.at,
    titleA: songById.get(duel.songAId)?.title ?? '?',
    titleB: songById.get(duel.songBId)?.title ?? '?',
    winner: duel.winner,
    deltaA: duel.deltaA,
    deltaB: duel.deltaB
  }));

  const distinctSongsPlayed = [...listensBySongId.values()].filter((count) => count > 0).length;

  logger.debug('Sending stats data.', { timeRange, distinctSongsPlayed, totalListens });

  return {
    timeRange,
    totals: {
      distinctSongsPlayed,
      totalListens,
      fullListens,
      skips,
      approxListeningTimeSec: Math.round(approxListeningTimeSec),
      favorites
    },
    activity: buildActivity(listeningData, timeRange, now),
    calendar: buildCalendar(listeningData, now),
    topSongs,
    topArtists,
    topAlbums,
    topGenres,
    mostSkipped,
    elo: {
      totalDuels: elo.totalDuels,
      topRated,
      recentDuels
    }
  };
};

export default getStatsData;
