import storage from './localStorage';

export const MAX_PENDING_DUELS = 100;

/** Reads the persisted duel backlog, dropping malformed entries. */
export const getDuelQueue = (): [string, string][] => {
  const raw = storage.duels.getDuelsData('pendingDuelPairs');
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is [string, string] =>
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === 'string' &&
      typeof entry[1] === 'string' &&
      entry[0] !== entry[1]
  );
};

/** Persists the backlog and keeps the badge counter in sync with its length. */
export const setDuelQueue = (queue: [string, string][]) => {
  storage.duels.setDuelsData('pendingDuelPairs', queue);
  storage.duels.setDuelsData('pendingDuels', queue.length);
};

/**
 * PEEKS the first backlog pair that still resolves to a playable duel,
 * dropping stale entries (deleted/blacklisted songs) along the way.
 * The alive pair is NOT shifted — consumption happens on vote/skip, so a
 * minimized or closed prompt keeps its pair queued. Null = nothing usable.
 */
export const peekFirstAliveDuelPair = async (): Promise<DuelPair | null> => {
  let queue = getDuelQueue();
  while (queue.length > 0) {
    const [songAId, songBId] = queue[0];
    try {
      const pair = await window.api.eloDuels.getDuelPairByIds(songAId, songBId);
      if (pair) {
        setDuelQueue(queue);
        return pair;
      }
    } catch (error) {
      console.error(error);
    }
    queue = queue.slice(1);
  }
  setDuelQueue(queue);
  return null;
};
