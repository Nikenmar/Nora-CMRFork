export const MAX_PENDING_DUELS = 30;

export const normalizeDuelTickets = (rawTickets: unknown, legacyPairs: unknown): DuelTicket[] => {
  const candidates: DuelTicket[] = [];
  if (Array.isArray(rawTickets)) {
    for (const entry of rawTickets) {
      if (
        entry &&
        typeof entry === 'object' &&
        'anchorSongId' in entry &&
        'earnedAt' in entry &&
        typeof entry.anchorSongId === 'string' &&
        typeof entry.earnedAt === 'number' &&
        Number.isFinite(entry.earnedAt)
      )
        candidates.push({ anchorSongId: entry.anchorSongId, earnedAt: entry.earnedAt });
    }
  }
  if (Array.isArray(legacyPairs)) {
    for (const entry of legacyPairs) {
      if (Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string')
        candidates.push({ anchorSongId: entry[0], earnedAt: 0 });
    }
  }

  const seen = new Set<string>();
  return candidates
    .filter(({ anchorSongId }) => {
      if (!anchorSongId || seen.has(anchorSongId)) return false;
      seen.add(anchorSongId);
      return true;
    })
    .slice(0, MAX_PENDING_DUELS);
};
