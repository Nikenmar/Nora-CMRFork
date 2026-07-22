import {
  REDISCOVER_PLAYLIST_TEMPLATE,
  getCmrStatsData,
  getListeningData,
  getPlaylistData,
  getSongsData,
  getTierlistData,
  setPlaylistData
} from '../filesystem';
import { dataUpdateEvent } from '../main';
import { isSongBlacklisted } from '../utils/isBlacklisted';
import { tierValue } from './megaShuffle';
import logger from '../logger';

/** Max tracks kept in the Rediscover playlist after each refresh. */
const REDISCOVER_CAP = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

export const REDISCOVER_PLAYLIST_ID = 'Rediscover';

/**
 * Rebuilds the Rediscover system playlist: tracks you clearly love (tierlist
 * placement, ELO duels, full listens) but have not heard in `thresholdDays`
 * (or never heard in-app). The playlist is app-managed: every refresh fully
 * regenerates it, so manual edits inside it are intentionally disposable.
 */
const refreshRediscoverPlaylist = (thresholdDays = 30): { count: number } => {
  const threshold = Number.isFinite(thresholdDays) && thresholdDays > 0 ? thresholdDays : 30;
  const cutoff = Date.now() - threshold * DAY_MS;

  try {
    const songs = getSongsData();
    if (!Array.isArray(songs) || songs.length === 0) return { count: 0 };

    // ----- "loved" signal 1: best tier placement across ALL tierlists -----
    const tierScore: Record<string, number> = {};
    for (const tierlist of getTierlistData()) {
      const total = tierlist.tiers.length;
      tierlist.tiers.forEach((tier, index) => {
        const value = tierValue(index, total);
        for (const songId of tier.items) {
          if (!(songId in tierScore) || value > tierScore[songId]) tierScore[songId] = value;
        }
      });
    }

    // ----- "loved" signal 2: ELO (meaningful only after enough duels) -----
    const elo = getCmrStatsData().elo;
    const hasEloData = elo.totalDuels >= 10;
    let eloMin = 0;
    let eloMax = 0;
    if (hasEloData) {
      const rated = Object.values(elo.ratings)
        .filter((rating) => rating.games >= 1)
        .map((rating) => rating.rating);
      if (rated.length > 0) {
        eloMin = Math.min(...rated);
        eloMax = Math.max(...rated);
      }
    }
    const eloScore = (songId: string) => {
      const rating = elo.ratings[songId];
      if (!rating || rating.games < 1 || eloMax <= eloMin) return 0;
      return (rating.rating - eloMin) / (eloMax - eloMin);
    };

    // ----- listening: last-heard timestamps + full-listen nudge -----
    let maxFullListens = 1;
    const lastListenedAt: Record<string, number> = {};
    const fullListensMap: Record<string, number> = {};
    for (const entry of getListeningData()) {
      let last = 0;
      for (const year of entry.listens)
        for (const [dateMs, count] of year.listens) if (count > 0 && dateMs > last) last = dateMs;
      lastListenedAt[entry.songId] = last;
      const full = entry.fullListens ?? 0;
      fullListensMap[entry.songId] = full;
      if (full > maxFullListens) maxFullListens = full;
    }

    // ----- candidates: loved (score > 0) AND forgotten (older than cutoff) -----
    const scored: { songId: string; score: number }[] = [];
    for (const song of songs) {
      if (isSongBlacklisted(song.songId, song.path)) continue;
      const score =
        0.55 * (tierScore[song.songId] ?? 0) +
        0.35 * (hasEloData ? eloScore(song.songId) : 0) +
        0.1 * ((fullListensMap[song.songId] ?? 0) / maxFullListens);
      if (score <= 0) continue;
      if ((lastListenedAt[song.songId] ?? 0) >= cutoff) continue; // heard recently
      scored.push({ songId: song.songId, score });
    }

    scored.sort((a, b) => b.score - a.score || a.songId.localeCompare(b.songId));
    const picked = scored.slice(0, REDISCOVER_CAP).map((entry) => entry.songId);

    // ----- upsert the system playlist (lazy-create, History pattern) -----
    const playlists = getPlaylistData();
    if (!Array.isArray(playlists)) return { count: 0 };
    const existing = playlists.find((playlist) => playlist.playlistId === REDISCOVER_PLAYLIST_ID);
    if (existing) existing.songs = picked;
    else
      playlists.push({
        ...REDISCOVER_PLAYLIST_TEMPLATE,
        createdDate: new Date(),
        songs: picked
      });
    setPlaylistData(playlists);
    dataUpdateEvent('playlists/rediscover');

    logger.info('Rediscover playlist refreshed.', {
      thresholdDays: threshold,
      count: picked.length
    });
    return { count: picked.length };
  } catch (error) {
    logger.error('Failed to refresh the Rediscover playlist.', { error });
    return { count: 0 };
  }
};

export default refreshRediscoverPlaylist;
