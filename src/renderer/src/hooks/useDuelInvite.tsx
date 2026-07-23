import { useEffect } from 'react';

import { store } from '@renderer/store';
import { getDuelTickets, MAX_PENDING_DUELS, setDuelTickets } from '../utils/duelQueue';
import storage from '../utils/localStorage';

/**
 * Full listens (90%+) needed to earn one duel ticket. Tickets accumulate even
 * when the player layout cannot currently show a prompt.
 */
const DUEL_INVITE_THRESHOLDS: Record<Exclude<DuelInviteFrequency, 'off'>, number> = {
  rare: 10,
  normal: 5,
  frequent: 2
};

const getAnchorCandidates = (): DuelAnchorCandidate[] => {
  const raw = storage.duels.getDuelsData('duelAnchorCandidates');
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (candidate): candidate is DuelAnchorCandidate =>
      !!candidate &&
      typeof candidate.songId === 'string' &&
      typeof candidate.listenedAt === 'number' &&
      Number.isFinite(candidate.listenedAt)
  );
};

const appendAnchorCandidate = (
  candidates: DuelAnchorCandidate[],
  songId: string
): DuelAnchorCandidate[] => [
  ...candidates.filter((candidate) => candidate.songId !== songId),
  { songId, listenedAt: Date.now() }
];

/**
 * Earns a ticket from a recent full-listen batch. Main selects the most useful
 * anchor; the opponent is intentionally left unresolved until the prompt opens.
 */
const useDuelInvite = () => {
  useEffect(() => {
    setDuelTickets(getDuelTickets());
    let selectionInFlight = false;

    const manageListenEvents = (event: Event) => {
      if (!('detail' in event)) return;
      const dataEvents = (event as DetailAvailableEvent<DataUpdateEvent[]>).detail;
      const listenEvent = dataEvents.find(
        ({ dataType }) => dataType === 'songs/listeningData/fullSongListens'
      );
      if (!listenEvent) return;
      const listenedSongId = listenEvent.eventData[0]?.data?.[0];
      if (typeof listenedSongId !== 'string' || listenedSongId.length === 0) return;

      const duels = store.state.localStorage.duels;
      if (!duels || duels.frequency === 'off') return;
      const threshold =
        DUEL_INVITE_THRESHOLDS[duels.frequency as Exclude<DuelInviteFrequency, 'off'>] ??
        DUEL_INVITE_THRESHOLDS.normal;
      const listensSinceInvite = (storage.duels.getDuelsData('listensSinceInvite') ?? 0) + 1;
      const anchorCandidates = appendAnchorCandidate(getAnchorCandidates(), listenedSongId);
      storage.duels.setDuelsData('listensSinceInvite', listensSinceInvite);
      storage.duels.setDuelsData('duelAnchorCandidates', anchorCandidates);

      if (listensSinceInvite < threshold || selectionInFlight) return;
      const tickets = getDuelTickets();
      if (tickets.length >= MAX_PENDING_DUELS) {
        storage.duels.setDuelsData('listensSinceInvite', 0);
        storage.duels.setDuelsData('duelAnchorCandidates', []);
        return;
      }

      selectionInFlight = true;
      window.api.eloDuels
        .selectDuelAnchor(
          anchorCandidates,
          tickets.map(({ anchorSongId }) => anchorSongId)
        )
        .then((anchorSongId) => {
          if (!anchorSongId) return;
          const latestTickets = getDuelTickets();
          if (
            latestTickets.length < MAX_PENDING_DUELS &&
            !latestTickets.some((ticket) => ticket.anchorSongId === anchorSongId)
          )
            setDuelTickets([...latestTickets, { anchorSongId, earnedAt: Date.now() }]);
        })
        .finally(() => {
          selectionInFlight = false;
          storage.duels.setDuelsData('listensSinceInvite', 0);
          storage.duels.setDuelsData('duelAnchorCandidates', []);
        })
        .catch((error) => console.error(error));
    };

    document.addEventListener('app/dataUpdates', manageListenEvents);
    return () => document.removeEventListener('app/dataUpdates', manageListenEvents);
  }, []);
};

export default useDuelInvite;
