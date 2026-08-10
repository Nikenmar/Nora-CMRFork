import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import {
  SONG_GUESSR_MAX_ATTEMPTS,
  SONG_GUESSR_SNIPPETS,
  SONG_GUESSR_STORAGE_KEY
} from '../src/renderer/src/utils/songGuessr/constants';
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
      lastPlayedAt: 0
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
      lastPlayedAt: 100
    });
    expect(stats).toEqual(createEmptyStats());
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
