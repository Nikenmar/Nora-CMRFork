import { MAX_PENDING_DUELS, normalizeDuelTickets } from '../src/renderer/src/utils/duelTickets';

describe('duel ticket migration', () => {
  test('preserves existing tickets and converts legacy pair anchors once', () => {
    expect(
      normalizeDuelTickets(
        [{ anchorSongId: 'current', earnedAt: 10 }],
        [
          ['legacy', 'old-opponent'],
          ['current', 'duplicate-opponent']
        ]
      )
    ).toEqual([
      { anchorSongId: 'current', earnedAt: 10 },
      { anchorSongId: 'legacy', earnedAt: 0 }
    ]);
  });

  test('drops malformed, duplicate, and excess tickets', () => {
    const raw = Array.from({ length: MAX_PENDING_DUELS + 5 }, (_, index) => ({
      anchorSongId: `song-${index}`,
      earnedAt: index
    }));
    raw.push({ anchorSongId: 'song-0', earnedAt: 999 });

    const normalized = normalizeDuelTickets(raw, [['only-one-side']]);
    expect(normalized).toHaveLength(MAX_PENDING_DUELS);
    expect(new Set(normalized.map(({ anchorSongId }) => anchorSongId)).size).toBe(
      MAX_PENDING_DUELS
    );
  });
});
