import {
  getPlaylistData,
  getTierlistData,
  setPlaylistData,
  setTierlistData
} from '../../filesystem';
import { dataUpdateEvent } from '../../main';
import { generateRandomId } from '../../utils/randomId';
import logger from '../../logger';

// ---------------------------------------------------------------------------
// Validators for the OPTIONAL export blocks (playlists / tierlists / preferences).
// A malformed optional block is skipped with a note — it never aborts the import.
// ---------------------------------------------------------------------------

export const isValidExportedPlaylist = (playlist: ExportedPlaylist) =>
  !!playlist &&
  typeof playlist.playlistId === 'string' &&
  typeof playlist.name === 'string' &&
  playlist.name.trim().length > 0 &&
  Array.isArray(playlist.songs) &&
  playlist.songs.every((songId) => typeof songId === 'string');

export const isValidTierlistExport = (tierlist: SavableTierlist) =>
  !!tierlist &&
  typeof tierlist.tierlistId === 'string' &&
  typeof tierlist.name === 'string' &&
  tierlist.name.trim().length > 0 &&
  (tierlist.labelMode === 'track' || tierlist.labelMode === 'artistAndTrack') &&
  Array.isArray(tierlist.sourcePlaylistIds) &&
  tierlist.sourcePlaylistIds.every((id) => typeof id === 'string') &&
  (tierlist.sourceFolderPaths === undefined ||
    (Array.isArray(tierlist.sourceFolderPaths) &&
      tierlist.sourceFolderPaths.every((folderPath) => typeof folderPath === 'string'))) &&
  Array.isArray(tierlist.tiers) &&
  tierlist.tiers.every(
    (tier) =>
      !!tier &&
      typeof tier.tierId === 'string' &&
      typeof tier.name === 'string' &&
      Array.isArray(tier.items) &&
      tier.items.every((item) => typeof item === 'string')
  );

export const isValidExportPreferences = (preferences: StatsExportPreferences) =>
  !!preferences &&
  typeof preferences === 'object' &&
  (preferences.tierShuffleIntensity === undefined ||
    (typeof preferences.tierShuffleIntensity === 'number' &&
      Number.isFinite(preferences.tierShuffleIntensity) &&
      preferences.tierShuffleIntensity >= 0 &&
      preferences.tierShuffleIntensity <= 1));

// ---------------------------------------------------------------------------
// Import: remap foreign ids through fingerprint matches, merge by name.
// ---------------------------------------------------------------------------

export interface CollectionsImportResult {
  playlistsImported: number;
  tierlistsImported: number;
  notes: string[];
}

const parseDate = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

export const importCollections = (
  exportData: StatsExportFile,
  matches: Map<string, string>
): CollectionsImportResult => {
  const notes: string[] = [];
  let playlistsImported = 0;
  let tierlistsImported = 0;

  const hasPlaylistsBlock = Array.isArray(exportData.playlists);
  const hasTierlistsBlock = Array.isArray(exportData.tierlists);
  if (!hasPlaylistsBlock && !hasTierlistsBlock)
    return { playlistsImported, tierlistsImported, notes };

  const remapSongIds = (foreignIds: string[]) => {
    const localIds: string[] = [];
    let dropped = 0;
    for (const foreignId of foreignIds) {
      const localId = matches.get(foreignId);
      if (localId) localIds.push(localId);
      else dropped += 1;
    }
    return { localIds, dropped };
  };

  // Both writes happen ONCE at the end — fallback playlists created for
  // tierlists mutate the same local array first.
  const localPlaylists = getPlaylistData();
  let playlistsChanged = false;
  /** foreign playlistId -> local playlistId (feeds tierlist source remapping). */
  const playlistIdMap = new Map<string, string>();

  /** Merge-by-name: adds missing songs to an existing playlist or creates a new one. */
  const upsertPlaylistByName = (name: string, localSongIds: string[], createdDate?: Date) => {
    const existing = localPlaylists.find((playlist) => playlist.name === name);
    if (existing) {
      const known = new Set(existing.songs);
      const additions = localSongIds.filter((songId) => !known.has(songId));
      if (additions.length > 0) {
        existing.songs = [...existing.songs, ...additions];
        playlistsChanged = true;
      }
      return existing;
    }
    const newPlaylist: SavablePlaylist = {
      playlistId: generateRandomId(),
      name,
      createdDate: createdDate ?? new Date(),
      songs: localSongIds,
      isArtworkAvailable: false
    };
    localPlaylists.push(newPlaylist);
    playlistsChanged = true;
    return newPlaylist;
  };

  // --- Playlists ---
  if (hasPlaylistsBlock) {
    for (const foreign of exportData.playlists ?? []) {
      const { localIds, dropped } = remapSongIds(foreign.songs);
      const playlist = upsertPlaylistByName(foreign.name, localIds, parseDate(foreign.createdDate));
      playlistIdMap.set(foreign.playlistId, playlist.playlistId);
      playlistsImported += 1;
      if (dropped > 0)
        notes.push(`Playlist '${foreign.name}': ${dropped} song(s) not found in this library.`);
    }
  }

  // --- Tierlists ---
  if (hasTierlistsBlock) {
    const localTierlists = getTierlistData();
    let tierlistsChanged = false;

    for (const foreign of exportData.tierlists ?? []) {
      // Merging tier placements makes no sense — same-name tierlists are skipped.
      // This also makes a repeated import of the same file a natural no-op.
      if (localTierlists.some((tierlist) => tierlist.name === foreign.name)) {
        notes.push(`Tierlist '${foreign.name}' already exists — skipped.`);
        continue;
      }

      const sourcePlaylistIds: string[] = [];
      for (const foreignPlaylistId of foreign.sourcePlaylistIds) {
        const localPlaylistId = playlistIdMap.get(foreignPlaylistId);
        if (localPlaylistId) sourcePlaylistIds.push(localPlaylistId);
        else
          notes.push(
            `Tierlist '${foreign.name}': a source playlist was not part of the export — dropped.`
          );
      }

      const tiers: TierRow[] = foreign.tiers.map((tier) => ({
        tierId: generateRandomId(),
        name: tier.name,
        items: remapSongIds(tier.items).localIds
      }));

      // Folder sources are absolute paths from another machine and are dropped.
      // Placed (matched) tracks become a fallback playlist so the board still renders.
      const hadFolderSources =
        Array.isArray(foreign.sourceFolderPaths) && foreign.sourceFolderPaths.length > 0;
      if (hadFolderSources) {
        const placedSongIds = [...new Set(tiers.flatMap((tier) => tier.items))];
        if (placedSongIds.length > 0) {
          const fallbackName = `Imported: ${foreign.name}`;
          const fallback = upsertPlaylistByName(fallbackName, placedSongIds);
          sourcePlaylistIds.push(fallback.playlistId);
          notes.push(
            `Tierlist '${foreign.name}': folder sources replaced with playlist '${fallbackName}'.`
          );
        } else {
          notes.push(`Tierlist '${foreign.name}': folder sources dropped (no placements matched).`);
        }
      }

      localTierlists.push({
        tierlistId: generateRandomId(),
        name: foreign.name,
        createdDate: parseDate(foreign.createdDate),
        sourcePlaylistIds,
        sourceFolderPaths: [],
        tiers,
        labelMode: foreign.labelMode,
        ...(foreign.showPlayButton !== undefined ? { showPlayButton: foreign.showPlayButton } : {}),
        ...(foreign.influencesShuffle !== undefined
          ? { influencesShuffle: foreign.influencesShuffle }
          : {})
      });
      tierlistsChanged = true;
      tierlistsImported += 1;
    }

    if (tierlistsChanged) {
      setTierlistData(localTierlists);
      dataUpdateEvent('tierlists/newTierlist');
    }
  }

  if (playlistsChanged) setPlaylistData(localPlaylists);

  logger.info('Stats collections imported.', { playlistsImported, tierlistsImported });
  return { playlistsImported, tierlistsImported, notes };
};
