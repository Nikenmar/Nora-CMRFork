import {
  calculateEloDeltas,
  getEffectiveEloRating,
  getNormalizedEloScore,
  getPositiveEloScore,
  orderDuelSongIds,
  selectAdaptiveOpponent,
  selectDuelAnchor
} from '../src/main/core/duelMatchmaker';
import type { MatchmakerSong } from '../src/main/core/duelMatchmaker';

const NOW = Date.UTC(2026, 6, 23);

const emptyElo = (): EloData => ({ ratings: {}, history: [], totalDuels: 0 });

const song = (songId: string, genreIds: string[] = []): MatchmakerSong => ({
  songId,
  artistIds: [],
  genreIds,
  playlistIds: [],
  tierlistIds: []
});

describe('adaptive duel matchmaker', () => {
  test('shrinks low-confidence ratings toward 1200 without changing raw ELO', () => {
    expect(getEffectiveEloRating({ rating: 1400, games: 1, wins: 1, losses: 0 })).toBe(1240);
    expect(getEffectiveEloRating({ rating: 1400, games: 5, wins: 5, losses: 0 })).toBe(1400);
    expect(getNormalizedEloScore({ rating: 1216, games: 1, wins: 1, losses: 0 })).toBeCloseTo(
      0.508
    );
    expect(getPositiveEloScore({ rating: 1184, games: 1, wins: 0, losses: 1 })).toBe(0);
  });

  test('treats Too close as a draw that pulls unequal ratings together', () => {
    const { deltaA, deltaB } = calculateEloDeltas(1300, 1100, 0.5);
    expect(deltaA).toBeLessThan(0);
    expect(deltaB).toBeGreaterThan(0);
    expect(deltaA + deltaB).toBe(0);
  });

  test('selects an under-calibrated anchor and respects queued exclusions', () => {
    const elo = emptyElo();
    elo.ratings.established = { rating: 1210, games: 5, wins: 3, losses: 2, lastDuelAt: NOW };
    const candidates: DuelAnchorCandidate[] = [
      { songId: 'established', listenedAt: NOW - 1 },
      { songId: 'new', listenedAt: NOW }
    ];

    expect(
      selectDuelAnchor(candidates, new Set(['established', 'new']), new Set(), elo, NOW, () => 0)
    ).toBe('new');
    expect(
      selectDuelAnchor(
        candidates,
        new Set(['established', 'new']),
        new Set(['new']),
        elo,
        NOW,
        () => 0
      )
    ).toBe('established');
  });

  test('calibrates a new anchor against an established, rating-compatible song', () => {
    const elo = emptyElo();
    elo.ratings.established = { rating: 1200, games: 5, wins: 3, losses: 2 };
    elo.ratings.unknown = { rating: 1200, games: 0, wins: 0, losses: 0 };

    expect(
      selectAdaptiveOpponent(
        'anchor',
        [song('anchor'), song('unknown'), song('established')],
        elo,
        [],
        NOW,
        () => 0
      )
    ).toBe('established');
  });

  test('refines an established anchor inside a meaningful music context', () => {
    const elo = emptyElo();
    elo.ratings.anchor = { rating: 1200, games: 5, wins: 3, losses: 2 };
    elo.ratings.related = { rating: 1200, games: 3, wins: 2, losses: 1 };
    elo.ratings.unrelated = { rating: 1200, games: 3, wins: 2, losses: 1 };

    expect(
      selectAdaptiveOpponent(
        'anchor',
        [song('anchor', ['genre']), song('unrelated'), song('related', ['genre'])],
        elo,
        [],
        NOW,
        () => 0
      )
    ).toBe('related');
  });

  test('cools down skipped and very recent exact pairs', () => {
    const skippedElo = emptyElo();
    expect(
      selectAdaptiveOpponent(
        'anchor',
        [song('anchor'), song('skipped'), song('available')],
        skippedElo,
        [{ at: NOW, songAId: 'skipped', songBId: 'anchor' }],
        NOW,
        () => 0
      )
    ).toBe('available');

    const recentElo = emptyElo();
    recentElo.history.push({
      at: NOW,
      songAId: 'recent',
      songBId: 'anchor',
      winner: 'A',
      deltaA: 16,
      deltaB: -16
    });
    expect(
      selectAdaptiveOpponent(
        'anchor',
        [song('anchor'), song('recent'), song('available')],
        recentElo,
        [],
        NOW,
        () => 0
      )
    ).toBe('available');
  });

  test('uses a shorter neutral cooldown than Too different feedback', () => {
    const twentyDaysAgo = NOW - 20 * 24 * 60 * 60 * 1000;
    expect(
      selectAdaptiveOpponent(
        'anchor',
        [song('anchor'), song('old-neutral'), song('different')],
        emptyElo(),
        [
          {
            at: twentyDaysAgo,
            songAId: 'anchor',
            songBId: 'old-neutral',
            reason: 'cantDecide'
          },
          {
            at: twentyDaysAgo,
            songAId: 'anchor',
            songBId: 'different',
            reason: 'tooDifferent'
          }
        ],
        NOW,
        () => 0
      )
    ).toBe('old-neutral');
  });

  test('randomizes presentation without losing anchor identity', () => {
    expect(orderDuelSongIds('anchor', 'opponent', () => 0)).toEqual(['anchor', 'opponent']);
    expect(orderDuelSongIds('anchor', 'opponent', () => 0.9)).toEqual(['opponent', 'anchor']);
  });
});
