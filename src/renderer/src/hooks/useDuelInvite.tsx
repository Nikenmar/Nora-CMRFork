import { useEffect } from 'react';

import { store } from '@renderer/store';
import storage from '../utils/localStorage';

const MAX_PENDING_DUELS = 100;

const DUEL_INVITE_THRESHOLDS: Record<
  Exclude<DuelInviteFrequency, 'off'>,
  { minListens: number; minMinutes: number }
> = {
  rare: { minListens: 10, minMinutes: 180 },
  normal: { minListens: 5, minMinutes: 60 },
  frequent: { minListens: 2, minMinutes: 15 }
};

/**
 * Earns a persistent ELO duel after enough finished listens. The dedicated
 * ELO dock surfaces the backlog without competing with transient notifications.
 */
const useDuelInvite = () => {
  useEffect(() => {
    const manageListenEvents = (e: Event) => {
      if (!('detail' in e)) return;
      const dataEvents = (e as DetailAvailableEvent<DataUpdateEvent[]>).detail;
      const hasNewListen = dataEvents.some(
        (event) => event.dataType === 'songs/listeningData/listens'
      );
      if (!hasNewListen) return;

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

      const pendingDuels = Math.max(0, duels.pendingDuels ?? 0);
      if (pendingDuels >= MAX_PENDING_DUELS) {
        storage.duels.setDuelsData('lastInviteAt', now);
        storage.duels.setDuelsData('listensSinceInvite', 0);
        if (pendingDuels > MAX_PENDING_DUELS)
          storage.duels.setDuelsData('pendingDuels', MAX_PENDING_DUELS);
        return;
      }

      // Guards: invites only in the normal player layout, never over an open
      // prompt or an active multi-selection.
      if (state.playerType !== 'normal') return;
      if (state.promptMenuData.isVisible) return;
      if (state.multipleSelectionsData.isEnabled) return;

      window.api.eloDuels
        .getDuelPair()
        .then((pair) => {
          if (!pair) return undefined;
          const currentPendingDuels = Math.max(0, store.state.localStorage.duels.pendingDuels ?? 0);
          storage.duels.setDuelsData('lastInviteAt', now);
          storage.duels.setDuelsData('listensSinceInvite', 0);
          storage.duels.setDuelsData(
            'pendingDuels',
            Math.min(MAX_PENDING_DUELS, currentPendingDuels + 1)
          );
          return undefined;
        })
        .catch((err) => console.error(err));
    };

    document.addEventListener('app/dataUpdates', manageListenEvents);
    return () => document.removeEventListener('app/dataUpdates', manageListenEvents);
  }, []);
};

export default useDuelInvite;
