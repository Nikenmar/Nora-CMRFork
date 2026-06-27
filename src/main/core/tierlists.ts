import { getTierlistData, setTierlistData } from '../filesystem';
import logger from '../logger';
import { dataUpdateEvent } from '../main';
import { generateRandomId } from '../utils/randomId';

/** Default tier rows for a fresh tierlist — classic tiermaker S A B C D E F. */
const DEFAULT_TIER_LABELS = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];

const createDefaultTiers = (): TierRow[] =>
  DEFAULT_TIER_LABELS.map((name) => ({ tierId: generateRandomId(), name, items: [] }));

const sortTierlists = (tierlists: SavableTierlist[], sortType?: TierlistSortTypes) => {
  if (!sortType) return tierlists;
  const sorted = [...tierlists];
  switch (sortType) {
    case 'aToZ':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'zToA':
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case 'dateAddedAscending':
      return sorted.sort(
        (a, b) => new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime()
      );
    case 'dateAddedDescending':
      return sorted.sort(
        (a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime()
      );
    default:
      return sorted;
  }
};

export const sendTierlistData = (
  tierlistIds = [] as string[],
  sortType?: TierlistSortTypes
): SavableTierlist[] => {
  const tierlists = getTierlistData(tierlistIds);
  return sortTierlists(tierlists, sortType);
};

export const addTierlist = (
  name: string,
  sourcePlaylistIds: string[] = [],
  labelMode: TierlistLabelMode = 'track'
): { success: boolean; message?: string; tierlist?: SavableTierlist } => {
  try {
    const trimmedName = name.trim();
    if (!trimmedName) return { success: false, message: 'Tierlist name cannot be empty.' };

    const tierlists = getTierlistData();
    if (tierlists.some((tierlist) => tierlist.name === trimmedName)) {
      logger.warn(`A tierlist named '${trimmedName}' already exists.`);
      return { success: false, message: `A tierlist named '${trimmedName}' already exists.` };
    }

    const newTierlist: SavableTierlist = {
      tierlistId: generateRandomId(),
      name: trimmedName,
      createdDate: new Date(),
      sourcePlaylistIds: Array.isArray(sourcePlaylistIds) ? sourcePlaylistIds : [],
      tiers: createDefaultTiers(),
      labelMode
    };

    tierlists.push(newTierlist);
    setTierlistData(tierlists);
    dataUpdateEvent('tierlists/newTierlist', [newTierlist.tierlistId]);
    logger.info(`Created a new tierlist '${trimmedName}'.`);

    return { success: true, tierlist: newTierlist };
  } catch (error) {
    logger.error('Failed to create a new tierlist.', { error });
    return { success: false, message: 'Failed to create a new tierlist.' };
  }
};

export const saveTierlist = (
  updatedTierlist: SavableTierlist
): { success: boolean; message?: string } => {
  try {
    if (!updatedTierlist?.tierlistId) return { success: false, message: 'Invalid tierlist.' };

    const tierlists = getTierlistData();
    const index = tierlists.findIndex((t) => t.tierlistId === updatedTierlist.tierlistId);
    if (index === -1) {
      logger.warn(`Cannot save tierlist '${updatedTierlist.tierlistId}' — not found.`);
      return { success: false, message: 'Tierlist not found.' };
    }

    tierlists[index] = { ...tierlists[index], ...updatedTierlist };
    setTierlistData(tierlists);
    dataUpdateEvent('tierlists/updatedTierlist', [updatedTierlist.tierlistId]);
    return { success: true };
  } catch (error) {
    logger.error('Failed to save tierlist.', { error });
    return { success: false, message: 'Failed to save tierlist.' };
  }
};

export const removeTierlists = (tierlistIds: string[]): { success: boolean; message?: string } => {
  try {
    if (!Array.isArray(tierlistIds) || tierlistIds.length === 0)
      return { success: false, message: 'No tierlists specified.' };

    const tierlists = getTierlistData();
    const remaining = tierlists.filter((t) => !tierlistIds.includes(t.tierlistId));
    setTierlistData(remaining);
    dataUpdateEvent('tierlists/deletedTierlist', tierlistIds);
    logger.info(`Removed ${tierlistIds.length} tierlist(s).`);
    return { success: true };
  } catch (error) {
    logger.error('Failed to remove tierlists.', { error });
    return { success: false, message: 'Failed to remove tierlists.' };
  }
};
