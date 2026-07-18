import { getListeningData, getPlaylistData, getSongsData, getTierlistData } from '../filesystem';
import logger from '../logger';

// How hard the most-recently-played track is pushed back (its weight ×0.4),
// decaying linearly to ~no penalty for the oldest entry in the History list.
const FRESHNESS_PENALTY = 0.6;

/**
 * "Mega Smart Shuffle" / Tierlist Value Shuffle weights.
 *
 * Returns a per-song weight in [0.4 .. 1.0] for the requested songIds (normally
 * the CURRENT queue). The renderer then does a weighted shuffle of that queue so
 * the feature behaves like the normal shuffle — it just reorders what you're
 * already listening to (all songs, a playlist, ...) instead of replacing it.
 *
 * Signals (only tierlists flagged `influencesShuffle` participate):
 *  - tierScore  — how high a song sits across the influencing tierlists (S≫F).
 *  - artistAffinity — an artist gets stronger the HIGHER and the MORE of their
 *    tracks are ranked (sum of tier values), plus how much they're listened to.
 *    Computed across the WHOLE library, so a track that ISN'T in any tierlist
 *    still gets lifted purely because it's by one of your top artists.
 *  - listening — full-listens, a lighter nudge.
 *
 * weight = 0.4 + 0.6·score → the requested 60% smart / 40% pure-random.
 */

const tierValue = (index: number, total: number) => {
  if (total <= 0) return 0;
  const linear = (total - index) / total; // S => 1.0, last tier => 1/total
  return linear ** 1.4; // mild curve so the top tiers clearly stand out
};

const getMegaShuffleWeights = (songIds: string[] = [], intensity = 0.6): Record<string, number> => {
  const weights: Record<string, number> = {};
  try {
    const songs = getSongsData();
    if (!Array.isArray(songs) || songs.length === 0) return weights;
    const songById = new Map(songs.map((s) => [s.songId, s]));
    // Empty songIds => compute weights for the WHOLE library (used to warm the
    // renderer's cache so shuffling a freshly-built queue stays instant & smart).
    const targetIds =
      Array.isArray(songIds) && songIds.length > 0 ? songIds : songs.map((s) => s.songId);
    const blend = Math.min(1, Math.max(0, intensity)); // 0 = pure random, 1 = fully smart
    const influencing = getTierlistData().filter((t) => t.influencesShuffle);

    // ----- song tier scores (best placement across influencing tierlists) -----
    const songTier: Record<string, number> = {};
    for (const tl of influencing) {
      const total = tl.tiers.length;
      tl.tiers.forEach((tier, idx) => {
        const v = tierValue(idx, total);
        for (const songId of tier.items) {
          if (!(songId in songTier) || v > songTier[songId]) songTier[songId] = v;
        }
      });
    }

    // ----- listening map -----
    const listenMap: Record<string, number> = {};
    let maxSongListen = 0;
    for (const ld of getListeningData()) {
      const v = ld.fullListens || 0;
      listenMap[ld.songId] = v;
      if (v > maxSongListen) maxSongListen = v;
    }

    // ----- artist affinity (whole library: tier value of their tracks + listens) -----
    const artistTier: Record<string, number> = {};
    const artistListen: Record<string, number> = {};
    const artistKey = (a: { artistId?: string; name?: string }) => a.artistId || a.name || '';
    for (const song of songs) {
      const t = songTier[song.songId] || 0;
      const l = listenMap[song.songId] || 0;
      for (const a of song.artists || []) {
        const key = artistKey(a);
        if (!key) continue;
        artistTier[key] = (artistTier[key] || 0) + t;
        artistListen[key] = (artistListen[key] || 0) + l;
      }
    }
    // ----- freshness: recently played tracks get pushed back (anti-repeat) -----
    // History playlist is unshift-ordered (index 0 = most recent, capped at 50).
    const history = getPlaylistData(['History'])[0]?.songs || [];
    const historyLen = history.length;
    const recencyIndex: Record<string, number> = {};
    history.forEach((id, i) => {
      if (!(id in recencyIndex)) recencyIndex[id] = i;
    });
    const freshnessFactor = (songId: string) => {
      const i = recencyIndex[songId];
      if (i === undefined || historyLen === 0) return 1;
      // most recent (i=0) => 1 - FRESHNESS_PENALTY ; oldest => ~1
      return 1 - FRESHNESS_PENALTY * ((historyLen - i) / historyLen);
    };

    const maxArtistTier = Math.max(1, ...Object.values(artistTier));
    const maxArtistListen = Math.max(1, ...Object.values(artistListen));
    const artistAffinity: Record<string, number> = {};
    for (const key of new Set([...Object.keys(artistTier), ...Object.keys(artistListen)])) {
      const normTier = (artistTier[key] || 0) / maxArtistTier;
      const normListen = (artistListen[key] || 0) / maxArtistListen;
      artistAffinity[key] = 0.75 * normTier + 0.25 * normListen;
    }

    // ----- weight for each requested song -----
    for (const songId of targetIds) {
      const song = songById.get(songId);
      const tScore = songTier[songId] || 0;
      let aScore = 0;
      for (const a of song?.artists || []) {
        const aff = artistAffinity[artistKey(a)] || 0;
        if (aff > aScore) aScore = aff;
      }
      const lScore = maxSongListen > 0 ? (listenMap[songId] || 0) / maxSongListen : 0;

      // Tier value leads, artist affinity is strong (surfaces unranked tracks by
      // top artists), listening is a light touch.
      const score = 0.5 * tScore + 0.4 * aScore + 0.1 * lScore; // 0..1
      // weight = (1-blend) + blend·score, then a freshness penalty. blend (0..1)
      // is the user's intensity: 0.6 = 60/40, 1 = fully smart, 0 = pure random.
      // Floored so a 0-weight never breaks the renderer's random^(1/w) sampling.
      const w = Math.max(0.001, 1 - blend + blend * score);
      weights[songId] = w * freshnessFactor(songId);
    }

    logger.debug('Computed Mega Smart Shuffle weights.', {
      requested: songIds.length,
      influencingTierlists: influencing.length
    });
    return weights;
  } catch (error) {
    logger.error('Failed to compute Mega Smart Shuffle weights.', { error });
    return weights;
  }
};

export default getMegaShuffleWeights;
