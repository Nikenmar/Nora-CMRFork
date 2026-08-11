// SongGuessr — "guess the track from your own library" game.
// Shared contract between main (round/candidate providers), the pure game
// logic in the renderer, and the game UI. Ambient on purpose: this file has no
// imports, so every declaration here is global like the ones in app.d.ts.

/** A playable library track the game can use as an answer. */
interface SongGuessrEntry {
  songId: string;
  title: string;
  artists: string[];
  album?: string;
  /** seconds */
  duration: number;
  /** complete `nora://` URL, ready to hand to an <audio> element */
  path: string;
  artworkPaths: ArtworkPaths;
}

/** Where the answers are drawn from. */
type SongGuessrPoolType = 'library' | 'playlist' | 'genre';

interface SongGuessrPoolOption {
  type: SongGuessrPoolType;
  /** undefined for the whole library */
  id?: string;
  name: string;
  /** eligible songs in this pool */
  count: number;
}

interface SongGuessrRoundOptions {
  poolType: SongGuessrPoolType;
  poolId?: string;
  /** recently played answers, avoided while the pool is large enough */
  excludedSongIds?: string[];
}

interface SongGuessrRound {
  answer: SongGuessrEntry;
  /** eligible songs the answer was drawn from */
  poolSize: number;
}

/** One autocomplete suggestion in the guess box. */
interface SongGuessrCandidate {
  songId: string;
  title: string;
  artists: string[];
  artworkPath?: string;
}

/** One page of the ranked matches for a guess-box query. */
interface SongGuessrSearchResult {
  candidates: SongGuessrCandidate[];
  /** matches for the whole query, not just this page */
  total: number;
}

type SongGuessrAttemptKind = 'skip' | 'wrong' | 'correct';

interface SongGuessrAttempt {
  kind: SongGuessrAttemptKind;
  /** set for 'wrong' and 'correct' */
  guessSongId?: string;
  /** what the user picked, as shown in the attempt list */
  guessLabel?: string;
}

/** One finished round, kept for the Stats page history. */
interface SongGuessrRoundRecord {
  /** epoch ms */
  at: number;
  won: boolean;
  /** attempts spent, 1..SONG_GUESSR_MAX_ATTEMPTS */
  attempts: number;
  songId: string;
  title: string;
  artists: string[];
}

interface SongGuessrStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  currentStreak: number;
  maxStreak: number;
  /** index i = games won on attempt i + 1; length === SONG_GUESSR_MAX_ATTEMPTS */
  distribution: number[];
  /** epoch ms, 0 when never played */
  lastPlayedAt: number;
  /*
   * Added in v3.4.2 — additive on an unchanged `version: 1`, exactly like the
   * optional StatsTransfer blocks: an older build ignores what it does not
   * know, and a save written before this carries defaults on load. Only facts
   * that cannot be derived live here — total attempts is not one of them
   * (wins come from `distribution`, a loss always spends the full ladder).
   */
  /** skips used across all rounds, 0 on saves written before v3.4.2 */
  skips: number;
  /** epoch ms of the first round ever, 0 when unknown */
  firstPlayedAt: number;
  /** newest first, capped — the window the Stats page history reads */
  recentRounds: SongGuessrRoundRecord[];
}

/** Everything SongGuessr persists, in its own isolated localStorage key. */
interface SongGuessrPersistedState {
  version: 1;
  stats: SongGuessrStats;
  poolType: SongGuessrPoolType;
  poolId?: string;
  /** answers already used, newest first — keeps rounds from repeating */
  recentSongIds: string[];
}
