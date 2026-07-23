import storage from './localStorage';
import { MAX_PENDING_DUELS, normalizeDuelTickets } from './duelTickets';

export { MAX_PENDING_DUELS };

/** Reads tickets and migrates any legacy fixed pairs by preserving their A side. */
export const getDuelTickets = (): DuelTicket[] => {
  const rawTickets = storage.duels.getDuelsData('pendingDuelTickets');
  const legacyPairs = storage.duels.getDuelsData('pendingDuelPairs');
  const tickets = normalizeDuelTickets(rawTickets, legacyPairs);
  if (Array.isArray(legacyPairs) && legacyPairs.length > 0) {
    storage.duels.setDuelsData('pendingDuelTickets', tickets);
    storage.duels.setDuelsData('pendingDuelPairs', []);
  }
  return tickets;
};

/** Persists a unique, bounded ticket queue and synchronizes the badge. */
export const setDuelTickets = (tickets: DuelTicket[]) => {
  const normalized = normalizeDuelTickets(tickets, []);
  storage.duels.setDuelsData('pendingDuelTickets', normalized);
  storage.duels.setDuelsData('pendingDuelPairs', []);
  storage.duels.setDuelsData('pendingDuels', normalized.length);
};

/**
 * Peeks the first ticket that can still produce a playable duel. The opponent
 * is generated just in time; stale anchors are dropped, but transient IPC
 * failures leave the queue untouched.
 */
export const peekFirstAliveDuelPair = async (): Promise<DuelPair | null> => {
  let tickets = getDuelTickets();
  while (tickets.length > 0) {
    try {
      const pair = await window.api.eloDuels.getDuelPair(tickets[0].anchorSongId);
      if (pair) {
        setDuelTickets(tickets);
        return pair;
      }
    } catch (error) {
      console.error(error);
      setDuelTickets(tickets);
      return null;
    }
    tickets = tickets.slice(1);
  }
  setDuelTickets(tickets);
  return null;
};
