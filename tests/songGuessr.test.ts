import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import {
  SONG_GUESSR_MAX_ATTEMPTS,
  SONG_GUESSR_RECENT_ROUNDS_CAP,
  SONG_GUESSR_SNIPPETS,
  SONG_GUESSR_STORAGE_KEY
} from '../src/renderer/src/utils/songGuessr/constants';
import {
  buildSnippetEnvelope,
  FADE_IN_SECONDS,
  FADE_OUT_SECONDS
} from '../src/renderer/src/utils/songGuessr/declick';
import {
  formatCandidateLabel,
  isCorrectGuess,
  normalizeGuessText
} from '../src/renderer/src/utils/songGuessr/matching';
import {
  loadSongGuessrState,
  pushRecentSongId,
  saveSongGuessrState
} from '../src/renderer/src/utils/songGuessr/persistence';
import { buildShareText } from '../src/renderer/src/utils/songGuessr/share';
import {
  applyRoundResult,
  createEmptyStats,
  getAverageWinAttempts,
  getMostMissedRounds,
  getWinPercentage
} from '../src/renderer/src/utils/songGuessr/stats';

type StorageShim = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const installStorage = (overrides: Partial<StorageShim> = {}): StorageShim => {
  const values = new Map<string, string>();
  const storage: StorageShim = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    ...overrides
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage }
  });
  return storage;
};

const makeEntry = (overrides: Partial<SongGuessrEntry> = {}): SongGuessrEntry => ({
  songId: 'answer-file.flac',
  title: 'Beyoncé - Halo',
  artists: ['Beyoncé'],
  duration: 30,
  path: 'nora://answer-file.flac',
  artworkPaths: {
    isDefaultArtwork: true,
    artworkPath: '',
    optimizedArtworkPath: ''
  },
  ...overrides
});

const makeCandidate = (overrides: Partial<SongGuessrCandidate> = {}): SongGuessrCandidate => ({
  songId: 'guess-file.flac',
  title: 'Beyonce Halo',
  artists: ['Beyonce'],
  ...overrides
});

describe('SongGuessr constants and matching', () => {
  test('defines the six fixed snippet lengths and isolated storage key', () => {
    expect(SONG_GUESSR_SNIPPETS).toEqual([0.1, 0.5, 1, 3, 6, 12]);
    expect(SONG_GUESSR_MAX_ATTEMPTS).toBe(6);
    expect(SONG_GUESSR_STORAGE_KEY).toBe('nora_song_guessr');
  });

  test('normalizes case, diacritics, punctuation, and whitespace', () => {
    expect(normalizeGuessText('  Héllo, WORLD!  ')).toBe('hello world');
  });

  test('drops parenthesized and square-bracketed suffixes', () => {
    expect(normalizeGuessText('Beyoncé - Halo (Live Version) [2024 Remaster]')).toBe(
      'beyonce halo'
    );
  });

  test('matches the same song id even when metadata differs', () => {
    expect(
      isCorrectGuess(
        makeEntry({ songId: 'same-id', title: 'Original Title' }),
        makeCandidate({
          songId: 'same-id',
          title: 'Different Title',
          artists: ['Different Artist']
        })
      )
    ).toBe(true);
  });

  test('matches duplicate files by normalized title and shared artist', () => {
    expect(
      isCorrectGuess(
        makeEntry({ songId: 'first-file', title: 'Beyoncé - Halo (Live)' }),
        makeCandidate({ songId: 'duplicate-file', title: 'Beyonce Halo [Remastered]' })
      )
    ).toBe(true);
  });

  test('rejects a metadata match when artists do not overlap', () => {
    expect(
      isCorrectGuess(
        makeEntry({ title: 'Shared Title', artists: ['Answer Artist'] }),
        makeCandidate({ title: 'Shared Title', artists: ['Other Artist'] })
      )
    ).toBe(false);
  });

  test('formats candidate labels with artists and without artists', () => {
    expect(formatCandidateLabel(makeCandidate({ title: 'Track', artists: ['A', 'B'] }))).toBe(
      'Track — A, B'
    );
    expect(formatCandidateLabel(makeCandidate({ title: 'Instrumental', artists: [] }))).toBe(
      'Instrumental'
    );
  });
});

describe('SongGuessr share text', () => {
  test('renders a winning result in attempt order and pads to six squares', () => {
    const attempts: SongGuessrAttempt[] = [
      { kind: 'wrong' },
      { kind: 'skip' },
      { kind: 'correct' }
    ];

    expect(buildShareText(attempts, true, 'Daily')).toBe('SongGuessr — Daily\n🟥⬜🟩⬛⬛⬛\n3/6');
  });

  test('renders a loss with skip and wrong squares and X/6', () => {
    const attempts: SongGuessrAttempt[] = [
      { kind: 'skip' },
      { kind: 'wrong' },
      { kind: 'skip' },
      { kind: 'wrong' },
      { kind: 'wrong' },
      { kind: 'wrong' }
    ];

    expect(buildShareText(attempts, false, 'Library')).toBe(
      'SongGuessr — Library\n⬜🟥⬜🟥🟥🟥\nX/6'
    );
  });
});

describe('SongGuessr stats', () => {
  test('creates zeroed stats with one distribution slot per attempt', () => {
    expect(createEmptyStats()).toEqual({
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      currentStreak: 0,
      maxStreak: 0,
      distribution: [0, 0, 0, 0, 0, 0],
      lastPlayedAt: 0,
      skips: 0,
      firstPlayedAt: 0,
      recentRounds: []
    });
  });

  test('counts a win in its attempt bucket and advances the streak', () => {
    const stats = createEmptyStats();
    const updated = applyRoundResult(stats, { won: true, attemptIndex: 2, at: 100 });

    expect(updated).toEqual({
      gamesPlayed: 1,
      wins: 1,
      losses: 0,
      currentStreak: 1,
      maxStreak: 1,
      distribution: [0, 0, 1, 0, 0, 0],
      lastPlayedAt: 100,
      skips: 0,
      firstPlayedAt: 100,
      recentRounds: []
    });
    expect(stats).toEqual(createEmptyStats());
  });

  test('records the round, its skips and the first-played stamp', () => {
    const answer = { songId: 'song-1', title: 'Ghosts', artists: ['Rory'] };
    const first = applyRoundResult(createEmptyStats(), {
      won: true,
      attemptIndex: 1,
      at: 100,
      skips: 1,
      answer
    });
    const second = applyRoundResult(first, {
      won: false,
      attemptIndex: 5,
      at: 200,
      skips: 2,
      answer
    });

    expect(second.skips).toBe(3);
    expect(second.firstPlayedAt).toBe(100);
    expect(second.lastPlayedAt).toBe(200);
    // Newest first, and a loss is recorded as the whole ladder spent.
    expect(second.recentRounds).toEqual([
      { at: 200, won: false, attempts: 6, songId: 'song-1', title: 'Ghosts', artists: ['Rory'] },
      { at: 100, won: true, attempts: 2, songId: 'song-1', title: 'Ghosts', artists: ['Rory'] }
    ]);
  });

  test('caps the kept round history', () => {
    const answer = { songId: 'song-1', title: 'Ghosts', artists: [] };
    let stats = createEmptyStats();
    for (let round = 0; round < SONG_GUESSR_RECENT_ROUNDS_CAP + 5; round += 1)
      stats = applyRoundResult(stats, { won: true, attemptIndex: 0, at: round + 1, answer });

    expect(stats.recentRounds).toHaveLength(SONG_GUESSR_RECENT_ROUNDS_CAP);
    expect(stats.recentRounds[0].at).toBe(SONG_GUESSR_RECENT_ROUNDS_CAP + 5);
  });

  test('averages win attempts off the distribution and ranks missed answers', () => {
    const stats: SongGuessrStats = {
      ...createEmptyStats(),
      wins: 3,
      gamesPlayed: 4,
      losses: 1,
      distribution: [1, 1, 0, 1, 0, 0],
      recentRounds: [
        { at: 3, won: false, attempts: 6, songId: 'a', title: 'A', artists: [] },
        { at: 2, won: false, attempts: 6, songId: 'a', title: 'A', artists: [] },
        { at: 1, won: true, attempts: 1, songId: 'b', title: 'B', artists: [] },
        { at: 0, won: false, attempts: 6, songId: 'c', title: 'C', artists: [] }
      ]
    };

    // (1 + 2 + 4) / 3 wins
    expect(getAverageWinAttempts(stats)).toBe(2.3);
    expect(getAverageWinAttempts(createEmptyStats())).toBe(0);
    expect(getMostMissedRounds(stats, 2)).toEqual([
      { songId: 'a', title: 'A', artists: [], misses: 2 },
      { songId: 'c', title: 'C', artists: [], misses: 1 }
    ]);
  });

  test('resets the current streak on a loss while preserving max streak', () => {
    const won = applyRoundResult(createEmptyStats(), { won: true, attemptIndex: 0, at: 100 });
    const lost = applyRoundResult(won, { won: false, attemptIndex: 5, at: 200 });

    expect(lost.currentStreak).toBe(0);
    expect(lost.maxStreak).toBe(1);
    expect(lost.gamesPlayed).toBe(2);
    expect(lost.losses).toBe(1);
    expect(lost.distribution).toEqual([1, 0, 0, 0, 0, 0]);
  });

  test('returns rounded win percentage and zero for an unplayed state', () => {
    const stats = createEmptyStats();
    expect(getWinPercentage(stats)).toBe(0);
    expect(getWinPercentage({ ...stats, gamesPlayed: 3, wins: 2, losses: 1 })).toBe(67);
  });
});

describe('SongGuessr persistence', () => {
  beforeEach(() => {
    installStorage();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  test('returns fresh defaults when storage is absent', () => {
    expect(loadSongGuessrState()).toEqual({
      version: 1,
      stats: createEmptyStats(),
      poolType: 'library',
      recentSongIds: []
    });
  });

  test('falls back to fresh defaults for corrupt JSON', () => {
    const storage = installStorage();
    storage.setItem(SONG_GUESSR_STORAGE_KEY, '{not-json');

    expect(loadSongGuessrState()).toEqual({
      version: 1,
      stats: createEmptyStats(),
      poolType: 'library',
      recentSongIds: []
    });
  });

  test('falls back when parsed JSON has an invalid stats shape', () => {
    const storage = installStorage();
    storage.setItem(
      SONG_GUESSR_STORAGE_KEY,
      JSON.stringify({ version: 1, stats: { gamesPlayed: 'many' } })
    );

    expect(loadSongGuessrState().stats).toEqual(createEmptyStats());
  });

  test('keeps a pre-v3.4.2 save whole and fills only the missing counters', () => {
    const storage = installStorage();
    // Exactly what an older build wrote: no skips, firstPlayedAt or history.
    storage.setItem(
      SONG_GUESSR_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        stats: {
          gamesPlayed: 9,
          wins: 7,
          losses: 2,
          currentStreak: 3,
          maxStreak: 5,
          distribution: [2, 3, 1, 1, 0, 0],
          lastPlayedAt: 1700000000000
        },
        poolType: 'genre',
        poolId: 'genre-1',
        recentSongIds: ['song-1']
      })
    );

    const loaded = loadSongGuessrState();

    expect(loaded.stats.gamesPlayed).toBe(9);
    expect(loaded.stats.wins).toBe(7);
    expect(loaded.stats.maxStreak).toBe(5);
    expect(loaded.stats.distribution).toEqual([2, 3, 1, 1, 0, 0]);
    expect(loaded.stats.lastPlayedAt).toBe(1700000000000);
    expect(loaded.stats.skips).toBe(0);
    expect(loaded.stats.firstPlayedAt).toBe(0);
    expect(loaded.stats.recentRounds).toEqual([]);
    expect(loaded.poolId).toBe('genre-1');
  });

  test('drops malformed history entries instead of the whole save', () => {
    const storage = installStorage();
    storage.setItem(
      SONG_GUESSR_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        stats: {
          ...createEmptyStats(),
          gamesPlayed: 2,
          wins: 1,
          losses: 1,
          recentRounds: [
            { at: 2, won: true, attempts: 1, songId: 'a', title: 'A', artists: [] },
            { at: 'yesterday', won: true, attempts: 1, songId: 'b', title: 'B', artists: [] },
            { at: 1, won: false, attempts: 6, songId: 'c', title: 'C', artists: [42] }
          ]
        },
        poolType: 'library',
        recentSongIds: []
      })
    );

    expect(loadSongGuessrState().stats.recentRounds).toEqual([
      { at: 2, won: true, attempts: 1, songId: 'a', title: 'A', artists: [] }
    ]);
    expect(loadSongGuessrState().stats.gamesPlayed).toBe(2);
  });

  test('round-trips a valid state and preserves the selected pool', () => {
    const state: SongGuessrPersistedState = {
      version: 1,
      stats: applyRoundResult(createEmptyStats(), { won: true, attemptIndex: 1, at: 123 }),
      poolType: 'playlist',
      poolId: 'favorites',
      recentSongIds: ['first', 'second']
    };

    saveSongGuessrState(state);
    expect(loadSongGuessrState()).toEqual(state);
  });

  test('never throws when localStorage getItem is unavailable', () => {
    installStorage({
      getItem: () => {
        throw new Error('storage unavailable');
      }
    });

    expect(loadSongGuessrState()).toEqual({
      version: 1,
      stats: createEmptyStats(),
      poolType: 'library',
      recentSongIds: []
    });
  });

  test('never throws when localStorage setItem is unavailable', () => {
    installStorage({
      setItem: () => {
        throw new Error('storage unavailable');
      }
    });

    expect(() => saveSongGuessrState(loadSongGuessrState())).not.toThrow();
  });

  test('pushes recent ids newest-first, deduplicates, caps, and stays pure', () => {
    const state: SongGuessrPersistedState = {
      version: 1,
      stats: createEmptyStats(),
      poolType: 'library',
      recentSongIds: ['oldest', 'middle', 'newest']
    };

    const updated = pushRecentSongId(state, 'middle', 3);
    expect(updated.recentSongIds).toEqual(['middle', 'oldest', 'newest']);
    expect(state.recentSongIds).toEqual(['oldest', 'middle', 'newest']);
  });
});

describe('SongGuessr declick envelope', () => {
  test('keeps the whole rung at full gain by fading outside it', () => {
    const envelope = buildSnippetEnvelope(8, 0.1);

    // Playback opens a lead-in early and reaches full level exactly on the
    // snippet's first sample, so none of the 0.1 s is spent ramping.
    expect(envelope.startAt).toBeCloseTo(8 - FADE_IN_SECONDS, 6);
    expect(envelope.leadIn).toBeCloseTo(FADE_IN_SECONDS, 6);
    expect(envelope.rampIn).toBeCloseTo(FADE_IN_SECONDS, 6);
    // The fade-out starts on its last sample and runs into a tail beyond it.
    expect(envelope.fadeOutAt).toBeCloseTo(FADE_IN_SECONDS + 0.1, 6);
    expect(envelope.duration).toBeCloseTo(FADE_IN_SECONDS + 0.1 + FADE_OUT_SECONDS, 6);
    expect(envelope.fadeOutAt - envelope.leadIn).toBeCloseTo(0.1, 6);
  });

  test('ramps inside the snippet only when the track starts too early for a lead-in', () => {
    const envelope = buildSnippetEnvelope(0, 0.1);

    expect(envelope.startAt).toBe(0);
    expect(envelope.leadIn).toBe(0);
    expect(envelope.rampIn).toBeCloseTo(FADE_IN_SECONDS, 6);
    expect(envelope.duration).toBeCloseTo(0.1 + FADE_OUT_SECONDS, 6);
  });

  test('never seeks behind the file for a track with a sliver of lead-in', () => {
    const envelope = buildSnippetEnvelope(0.003, 0.5);

    expect(envelope.startAt).toBe(0);
    expect(envelope.leadIn).toBeCloseTo(0.003, 6);
    expect(envelope.fadeOutAt - envelope.leadIn).toBeCloseTo(0.5, 6);
  });

  test('treats a broken offset or rung as zero instead of seeking backwards', () => {
    const envelope = buildSnippetEnvelope(Number.NaN, Number.NaN);

    expect(envelope.startAt).toBe(0);
    expect(envelope.leadIn).toBe(0);
    expect(envelope.duration).toBeCloseTo(FADE_OUT_SECONDS, 6);
  });
});
