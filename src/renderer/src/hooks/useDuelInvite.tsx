import { useEffect } from 'react';

import { store } from '@renderer/store';
import storage from '../utils/localStorage';
import { getDuelQueue, MAX_PENDING_DUELS, setDuelQueue } from '../utils/duelQueue';

const DUEL_INVITE_THRESHOLDS: Record<
  Exclude<DuelInviteFrequency, 'off'>,
  { minListens: number; minMinutes: number }
> = {
  rare: { minListens: 10, minMinutes: 180 },
  normal: { minListens: 5, minMinutes: 60 },
  frequent: { minListens: 2, minMinutes: 15 }
};

/**
 * Earns a persistent ELO duel after enough finished listens. The earned pair is
 * generated IMMEDIATELY, pins the just-finished track as side A and is pushed
 * onto a persisted FIFO backlog (the dock consumes it pair by pair). The
 * dedicated ELO dock surfaces the backlog without competing with transient
 * notifications.
 */
const useDuelInvite = () => {
  useEffect(() => {
    // One-time reconciliation: the legacy counter predates the pair queue, so
    // old installs may show a backlog count with no pairs behind it.
    const startupQueue = getDuelQueue();
    if ((storage.duels.getDuelsData('pendingDuels') ?? 0) !== startupQueue.length)
      storage.duels.setDuelsData('pendingDuels', startupQueue.length);

    const manageListenEvents = (e: Event) => {
      if (!('detail' in e)) return;
      const dataEvents = (e as DetailAvailableEvent<DataUpdateEvent[]>).detail;
      const listenEvent = dataEvents.find(
        (event) => event.dataType === 'songs/listeningData/listens'
      );
      if (!listenEvent) return;
      // The event carries the songId of the listen that triggered it.
      const listenedSongId = listenEvent.eventData[0]?.data?.[0];

      const state = store.state;
      const duels = state.localStorage.duels;
      if (!duels || duels.frequency === 'off') return;

      const thresholds =
        DUEL_INVITE_THRESHOLDS[duels.frequency as Exclude<DuelInviteFrequency, 'off'>] ??
        DUEL_INVITE_THRESHOLDS.normal;
      const listensSinceInvite = (duels.listensSinceInvite ?? 0) + 1;
      const now = Date.now();
      const minutesSinceInvite = (now - (duels.lastInviteAt ?? 0)) / 60000;

      const shouldInvite =
        listensSinceInvite >= thresholds.minListens && minutesSinceInvite >= thresholds.minMinutes;

      if (!shouldInvite) {
        storage.duels.setDuelsData('listensSinceInvite', listensSinceInvite);
        return;
      }

      if (getDuelQueue().length >= MAX_PENDING_DUELS) {
        storage.duels.setDuelsData('lastInviteAt', now);
        storage.duels.setDuelsData('listensSinceInvite', 0);
        return;
      }

      // Guards: invites only in the normal player layout, never over an open
      // prompt or an active multi-selection.
      if (state.playerType !== 'normal') return;
      if (state.promptMenuData.isVisible) return;
      if (state.multipleSelectionsData.isEnabled) return;

      window.api.eloDuels
        .getDuelPair(listenedSongId)
        .then((pair) => {
          if (!pair) return undefined;
          const queue = getDuelQueue();
          if (queue.length >= MAX_PENDING_DUELS) return undefined;
          setDuelQueue([...queue, [pair.songA.songId, pair.songB.songId]]);
          storage.duels.setDuelsData('lastInviteAt', now);
          storage.duels.setDuelsData('listensSinceInvite', 0);
          return undefined;
        })
        .catch((err) => console.error(err));
    };

    document.addEventListener('app/dataUpdates', manageListenEvents);
    return () => document.removeEventListener('app/dataUpdates', manageListenEvents);
  }, []);
};

export default useDuelInvite;
