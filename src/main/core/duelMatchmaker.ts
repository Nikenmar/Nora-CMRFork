export const ELO_START_RATING = 1200;
export const ELO_CONFIDENCE_GAMES = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const SKIP_COOLDOWNS: Record<DuelSkipReason, number> = {
  tooClose: 90 * DAY_MS,
  tooDifferent: 180 * DAY_MS,
  cantDecide: 14 * DAY_MS
};
const RECENT_REMATCH_MEMORY = 25;
const EXPOSURE_HISTORY_SIZE = 24;
const TOP_CANDIDATES = 8;

type Random = () => number;

export interface MatchmakerSong {
  songId: string;
  artistIds: string[];
  genreIds: string[];
  albumId?: string;
  playlistIds: string[];
  tierlistIds: string[];
}

interface OpponentScore {
  songId: string;
  score: number;
  jitter: number;
}

type MatchLane = 'calibration' | 'refinement' | 'coverage' | 'bridge';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const round1 = (value: number) => Math.round(value * 10) / 10;

export const getEloRating = (elo: EloData, songId: string): EloSongRating =>
  elo.ratings[songId] ?? {
    rating: ELO_START_RATING,
    games: 0,
    wins: 0,
    losses: 0
  };

export const getEloConfidence = (rating: EloSongRating) =>
  clamp01(rating.games / ELO_CONFIDENCE_GAMES);

export const getEffectiveEloRating = (rating: EloSongRating) =>
  ELO_START_RATING + getEloConfidence(rating) * (rating.rating - ELO_START_RATING);

/** Neutral 1200 = 0.5; a confirmed +/-200 rating span reaches the 0..1 edges. */
export const getNormalizedEloScore = (rating: EloSongRating) =>
  clamp01(0.5 + (getEffectiveEloRating(rating) - ELO_START_RATING) / 400);

/** Rediscover should reward only evidence above neutral, never duel participation itself. */
export const getPositiveEloScore = (rating: EloSongRating) =>
  clamp01((getEffectiveEloRating(rating) - ELO_START_RATING) / 200);

export const calculateEloDeltas = (ratingA: number, ratingB: number, scoreA: 0 | 0.5 | 1) => {
  const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  return {
    deltaA: round1(32 * (scoreA - expectedA)),
    deltaB: round1(32 * (1 - scoreA - (1 - expectedA)))
  };
};

const pairKey = (songAId: string, songBId: string) =>
  songAId < songBId ? `${songAId}\u0000${songBId}` : `${songBId}\u0000${songAId}`;

const intersects = (left: string[], right: string[]) => {
  if (left.length === 0 || right.length === 0) return false;
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
};

const getContextSimilarity = (anchor: MatchmakerSong, candidate: MatchmakerSong) =>
  clamp01(
    (intersects(anchor.genreIds, candidate.genreIds) ? 0.4 : 0) +
      (intersects(anchor.tierlistIds, candidate.tierlistIds) ? 0.25 : 0) +
      (intersects(anchor.playlistIds, candidate.playlistIds) ? 0.2 : 0) +
      (intersects(anchor.artistIds, candidate.artistIds) ? 0.1 : 0) +
      (anchor.albumId && anchor.albumId === candidate.albumId ? 0.05 : 0)
  );

const weightedPick = (candidates: OpponentScore[], random: Random) => {
  const top = [...candidates]
    .sort((left, right) => right.score + right.jitter - (left.score + left.jitter))
    .slice(0, TOP_CANDIDATES);
  if (top.length === 0) return undefined;

  const minimum = Math.min(...top.map(({ score }) => score));
  const weights = top.map(({ score }) => Math.max(0.05, score - minimum + 0.05) ** 2);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;

  for (let index = 0; index < top.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return top[index].songId;
  }
  return top[top.length - 1].songId;
};

export const selectDuelAnchor = (
  candidates: DuelAnchorCandidate[],
  eligibleSongIds: Set<string>,
  excludedSongIds: Set<string>,
  elo: EloData,
  now = Date.now(),
  random: Random = Math.random
): string | undefined => {
  const latestBySong = new Map<string, DuelAnchorCandidate>();
  for (const candidate of candidates) {
    if (
      typeof candidate.songId !== 'string' ||
      !Number.isFinite(candidate.listenedAt) ||
      !eligibleSongIds.has(candidate.songId) ||
      excludedSongIds.has(candidate.songId)
    )
      continue;
    const current = latestBySong.get(candidate.songId);
    if (!current || candidate.listenedAt > current.listenedAt)
      latestBySong.set(candidate.songId, candidate);
  }

  const usable = [...latestBySong.values()];
  if (usable.length === 0) return undefined;
  const oldest = Math.min(...usable.map(({ listenedAt }) => listenedAt));
  const newest = Math.max(...usable.map(({ listenedAt }) => listenedAt));
  const recencyRange = Math.max(1, newest - oldest);

  return usable
    .map(({ songId, listenedAt }) => {
      const rating = getEloRating(elo, songId);
      const confidenceNeed = 1 - getEloConfidence(rating);
      const stale =
        rating.lastDuelAt === undefined ? 1 : clamp01((now - rating.lastDuelAt) / (30 * DAY_MS));
      const recency = clamp01((listenedAt - oldest) / recencyRange);
      return {
        songId,
        score: 0.6 * confidenceNeed + 0.3 * stale + 0.1 * recency + random() * 0.04
      };
    })
    .sort((left, right) => right.score - left.score)[0]?.songId;
};

const chooseLane = (anchorRating: EloSongRating, random: Random): MatchLane => {
  if (anchorRating.games < 3) return 'calibration';
  const roll = random();
  if (roll < 0.6) return 'refinement';
  if (roll < 0.82) return 'coverage';
  return 'bridge';
};

const laneScore = (
  lane: MatchLane,
  closeness: number,
  context: number,
  confidence: number,
  freshness: number
) => {
  if (lane === 'calibration')
    return 0.45 * closeness + 0.3 * confidence + 0.1 * context + 0.15 * freshness;
  if (lane === 'coverage')
    return 0.35 * closeness + 0.4 * (1 - confidence) + 0.1 * context + 0.15 * freshness;
  if (lane === 'bridge')
    return 0.45 * closeness + 0.25 * (1 - context) + 0.15 * (1 - confidence) + 0.15 * freshness;
  return 0.4 * closeness + 0.3 * context + 0.15 * (1 - confidence) + 0.15 * freshness;
};

export const selectAdaptiveOpponent = (
  anchorSongId: string,
  songs: MatchmakerSong[],
  elo: EloData,
  skippedPairs: DuelSkipRecord[] = [],
  now = Date.now(),
  random: Random = Math.random
): string | undefined => {
  const anchor = songs.find(({ songId }) => songId === anchorSongId);
  if (!anchor) return undefined;

  const anchorRating = getEloRating(elo, anchorSongId);
  const anchorEffectiveRating = getEffectiveEloRating(anchorRating);
  const lane = chooseLane(anchorRating, random);
  const recentPairKeys = new Set(
    elo.history
      .slice(0, RECENT_REMATCH_MEMORY)
      .map(({ songAId, songBId }) => pairKey(songAId, songBId))
  );
  const skippedPairKeys = new Set(
    skippedPairs
      .filter(({ at, reason = 'cantDecide' }) => now - at <= SKIP_COOLDOWNS[reason])
      .map(({ songAId, songBId }) => pairKey(songAId, songBId))
  );
  const exposure = new Map<string, number>();
  for (const record of elo.history.slice(0, EXPOSURE_HISTORY_SIZE)) {
    exposure.set(record.songAId, (exposure.get(record.songAId) ?? 0) + 1);
    exposure.set(record.songBId, (exposure.get(record.songBId) ?? 0) + 1);
  }

  const scoreCandidates = (excludeRecent: boolean, excludeSkipped: boolean) =>
    songs
      .filter(({ songId }) => {
        if (songId === anchorSongId) return false;
        const key = pairKey(anchorSongId, songId);
        if (excludeRecent && recentPairKeys.has(key)) return false;
        if (excludeSkipped && skippedPairKeys.has(key)) return false;
        return true;
      })
      .map((candidate): OpponentScore => {
        const rating = getEloRating(elo, candidate.songId);
        const effectiveRating = getEffectiveEloRating(rating);
        const closeness = Math.exp(-Math.abs(anchorEffectiveRating - effectiveRating) / 180);
        const context = getContextSimilarity(anchor, candidate);
        const confidence = getEloConfidence(rating);
        const freshness =
          rating.lastDuelAt === undefined ? 1 : clamp01((now - rating.lastDuelAt) / (30 * DAY_MS));
        const exposurePenalty = 0.35 * clamp01((exposure.get(candidate.songId) ?? 0) / 4);
        const olderRepeatPenalty = elo.history
          .slice(RECENT_REMATCH_MEMORY, 50)
          .some(
            ({ songAId, songBId }) =>
              pairKey(songAId, songBId) === pairKey(anchorSongId, candidate.songId)
          )
          ? 0.12
          : 0;
        return {
          songId: candidate.songId,
          score:
            laneScore(lane, closeness, context, confidence, freshness) -
            exposurePenalty -
            olderRepeatPenalty,
          jitter: random() * 0.035
        };
      });

  const strict = scoreCandidates(true, true);
  if (strict.length > 0) return weightedPick(strict, random);
  const allowRecent = scoreCandidates(false, true);
  if (allowRecent.length > 0) return weightedPick(allowRecent, random);
  return weightedPick(scoreCandidates(false, false), random);
};

export const orderDuelSongIds = (
  anchorSongId: string,
  opponentSongId: string,
  random: Random = Math.random
): [string, string] =>
  random() < 0.5 ? [anchorSongId, opponentSongId] : [opponentSongId, anchorSongId];
