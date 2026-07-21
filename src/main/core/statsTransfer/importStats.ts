import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';

import {
  getCmrStatsData,
  getListeningData,
  getSongsData,
  saveListeningData,
  setCmrStatsData
} from '../../filesystem';
import { dataUpdateEvent, showOpenDialog } from '../../main';
import hashText from '../../utils/hashText';
import { isAnErrorWithCode } from '../../utils/isAnErrorWithCode';
import makeDir from '../../utils/makeDir';
import logger from '../../logger';
import {
  importCollections,
  isValidExportedPlaylist,
  isValidExportPreferences,
  isValidTierlistExport
} from './importCollections';

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

const norm = (value: string) => value.trim().toLowerCase();

const mergeScalar = (local = 0, foreign = 0, mergeMode: StatsMergeMode) =>
  mergeMode === 'separateDevices' ? local + foreign : Math.max(local, foreign);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isNonNegativeNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0;

// ---------------------------------------------------------------------------
// 1. Read + validate the import source fully in memory (before ANY write)
// ---------------------------------------------------------------------------

/** Accepts the folder itself or its parent (the folder exportAppData nests into). */
const resolveLegacyExportFolder = async (folder: string) => {
  try {
    await fs.access(path.join(folder, 'listening_data.json'));
    return folder;
  } catch {
    const nested = path.join(folder, 'Nora exports');
    try {
      await fs.access(path.join(nested, 'listening_data.json'));
      return nested;
    } catch {
      return folder;
    }
  }
};

const readLegacyExportFolder = async (selectedFolder: string): Promise<StatsExportFile> => {
  const folder = await resolveLegacyExportFolder(selectedFolder);
  const [listeningRaw, songsRaw] = await Promise.all([
    fs.readFile(path.join(folder, 'listening_data.json'), 'utf-8'),
    fs.readFile(path.join(folder, 'songs.json'), 'utf-8')
  ]);

  const listeningJson = JSON.parse(listeningRaw) as { listeningData?: unknown };
  const songsJson = JSON.parse(songsRaw) as { songs?: unknown };
  if (!Array.isArray(listeningJson.listeningData) || !Array.isArray(songsJson.songs))
    throw new Error('The selected folder does not contain valid Nora export files.');

  let elo: EloData | undefined;
  try {
    const cmrStatsRaw = await fs.readFile(path.join(folder, 'cmr_stats.json'), 'utf-8');
    const cmrStatsJson = JSON.parse(cmrStatsRaw) as { cmrStats?: { elo?: EloData } };
    elo = cmrStatsJson.cmrStats?.elo;
  } catch (error) {
    // Stock and older CMR exports do not contain this optional file.
    if (!isAnErrorWithCode(error) || error.code !== 'ENOENT') throw error;
  }

  const foreignSongs = songsJson.songs as SavableSongData[];
  return {
    format: 'nora-cmr-stats-export',
    formatVersion: 1,
    exportId: `legacy-${hashText(listeningRaw)}`,
    exportedAt: '',
    appVersion: '',
    songs: foreignSongs.map((song) => ({
      songId: song.songId,
      title: song.title,
      artists: song.artists?.map((artist) => artist.name) ?? [],
      duration: song.duration,
      fileName: path.basename(song.path)
    })),
    listeningData: listeningJson.listeningData as SongListeningData[],
    ...(elo ? { elo } : {})
  };
};

const readImportSource = async (source: StatsImportSource): Promise<StatsExportFile> => {
  if (source === 'folder') {
    const folders = await showOpenDialog({
      title: 'Select a "Nora exports" folder',
      buttonLabel: 'Import',
      properties: ['openDirectory']
    });
    if (!folders[0]) throw new Error('PROMPT_CLOSED_BEFORE_INPUT');
    return readLegacyExportFolder(folders[0]);
  }

  const files = await showOpenDialog({
    title: 'Select a stats export file',
    buttonLabel: 'Import',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (!files[0]) throw new Error('PROMPT_CLOSED_BEFORE_INPUT');

  const raw = await fs.readFile(files[0], 'utf-8');
  const parsed = JSON.parse(raw) as StatsExportFile;
  if (parsed.format !== 'nora-cmr-stats-export')
    throw new Error('The selected file is not a Nora stats export.');
  if (parsed.formatVersion !== 1) throw new Error('Unsupported stats export file version.');
  return parsed;
};

const isValidListeningEntry = (entry: SongListeningData) =>
  !!entry &&
  typeof entry.songId === 'string' &&
  (entry.fullListens === undefined || isNonNegativeNumber(entry.fullListens)) &&
  (entry.skips === undefined || isNonNegativeNumber(entry.skips)) &&
  (entry.inNoOfPlaylists === undefined || isNonNegativeNumber(entry.inNoOfPlaylists)) &&
  (entry.seeks === undefined ||
    (Array.isArray(entry.seeks) &&
      entry.seeks.every(
        (seek) => !!seek && isNonNegativeNumber(seek.position) && isNonNegativeNumber(seek.seeks)
      ))) &&
  Array.isArray(entry.listens) &&
  entry.listens.every(
    (year) =>
      !!year &&
      Number.isInteger(year.year) &&
      Array.isArray(year.listens) &&
      year.listens.every(
        (pair) =>
          Array.isArray(pair) &&
          pair.length === 2 &&
          isFiniteNumber(pair[0]) &&
          isNonNegativeNumber(pair[1])
      )
  );

const isValidFingerprint = (song: SongFingerprint) =>
  !!song &&
  typeof song.songId === 'string' &&
  typeof song.title === 'string' &&
  typeof song.fileName === 'string' &&
  isNonNegativeNumber(song.duration) &&
  Array.isArray(song.artists) &&
  song.artists.every((artist) => typeof artist === 'string');

const isValidEloData = (elo: EloData) => {
  if (
    !elo ||
    typeof elo !== 'object' ||
    !elo.ratings ||
    typeof elo.ratings !== 'object' ||
    Array.isArray(elo.ratings) ||
    !Array.isArray(elo.history) ||
    !isNonNegativeNumber(elo.totalDuels)
  )
    return false;

  const ratingsAreValid = Object.values(elo.ratings).every(
    (rating) =>
      !!rating &&
      isFiniteNumber(rating.rating) &&
      isNonNegativeNumber(rating.games) &&
      isNonNegativeNumber(rating.wins) &&
      isNonNegativeNumber(rating.losses) &&
      (rating.lastDuelAt === undefined || isNonNegativeNumber(rating.lastDuelAt))
  );
  if (!ratingsAreValid) return false;

  return elo.history.every(
    (record) =>
      !!record &&
      isNonNegativeNumber(record.at) &&
      typeof record.songAId === 'string' &&
      typeof record.songBId === 'string' &&
      (record.winner === 'A' || record.winner === 'B') &&
      isFiniteNumber(record.deltaA) &&
      isFiniteNumber(record.deltaB)
  );
};

/** Validates EVERY imported listening entry — a single bad entry aborts the whole import. */
const validateExportData = (data: StatsExportFile) => {
  if (!data || typeof data !== 'object') return 'The import file is not a valid stats export.';
  if (!Array.isArray(data.songs) || !Array.isArray(data.listeningData))
    return 'The import file is missing song or listening data.';
  if (typeof data.exportId !== 'string' || data.exportId.length === 0)
    return 'The import file is missing its export id.';
  if (!data.songs.every(isValidFingerprint))
    return 'The import file contains malformed song fingerprints.';
  if (!data.listeningData.every(isValidListeningEntry))
    return 'The import file contains malformed listening data.';
  if (data.elo !== undefined && !isValidEloData(data.elo))
    return 'The import file contains malformed ELO data.';
  return undefined;
};

// ---------------------------------------------------------------------------
// 2. Fingerprint matching (foreign song -> local songId; songIds are random per install)
// ---------------------------------------------------------------------------

const matchForeignSongs = (foreignSongs: SongFingerprint[], localSongs: SavableSongData[]) => {
  const byFileName = new Map<string, SavableSongData[]>();
  const byTitleAndArtists = new Map<string, SavableSongData[]>();
  const byTitle = new Map<string, SavableSongData[]>();

  const pushTo = (map: Map<string, SavableSongData[]>, key: string, song: SavableSongData) => {
    const list = map.get(key);
    if (list) list.push(song);
    else map.set(key, [song]);
  };

  for (const song of localSongs) {
    pushTo(byFileName, norm(path.basename(song.path)), song);
    pushTo(byTitle, norm(song.title), song);
    const artistsKey = (song.artists ?? [])
      .map((artist) => norm(artist.name))
      .sort()
      .join('|');
    pushTo(byTitleAndArtists, `${norm(song.title)}|${artistsKey}`, song);
  }

  const matches = new Map<string, string>(); // foreign songId -> local songId

  for (const foreign of foreignSongs) {
    if (!foreign || typeof foreign.songId !== 'string') continue;
    const duration = Number(foreign.duration) || 0;

    // 1. file name + duration (±2s)
    const fileNameCandidates = (byFileName.get(norm(`${foreign.fileName ?? ''}`)) ?? []).filter(
      (song) => Math.abs(song.duration - duration) <= 2
    );
    if (fileNameCandidates.length === 1) {
      matches.set(foreign.songId, fileNameCandidates[0].songId);
      continue;
    }
    if (fileNameCandidates.length > 1) continue; // ambiguous — skip

    // 2. title + sorted artists + duration (±2s)
    const artistsKey = (foreign.artists ?? [])
      .map((artist) => norm(`${artist}`))
      .sort()
      .join('|');
    const titleArtistCandidates = (
      byTitleAndArtists.get(`${norm(`${foreign.title ?? ''}`)}|${artistsKey}`) ?? []
    ).filter((song) => Math.abs(song.duration - duration) <= 2);
    if (titleArtistCandidates.length === 1) {
      matches.set(foreign.songId, titleArtistCandidates[0].songId);
      continue;
    }
    if (titleArtistCandidates.length > 1) continue; // ambiguous — skip

    // 3. title + duration (±1s), only when unambiguous
    const titleCandidates = (byTitle.get(norm(`${foreign.title ?? ''}`)) ?? []).filter(
      (song) => Math.abs(song.duration - duration) <= 1
    );
    if (titleCandidates.length === 1) matches.set(foreign.songId, titleCandidates[0].songId);
  }

  return matches;
};

// ---------------------------------------------------------------------------
// 3. Merge
// ---------------------------------------------------------------------------

/** Buckets listen records by CALENDAR DAY — raw ms are never compared across devices. */
const bucketListensByDay = (listens: YearlyListeningRate[]) => {
  const dayMap = new Map<number, number>(); // dayStartMs -> count
  for (const year of listens ?? [])
    for (const [ms, count] of year.listens ?? []) {
      const date = new Date(ms);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      dayMap.set(dayStart, (dayMap.get(dayStart) ?? 0) + count);
    }
  return dayMap;
};

const rebuildYearlyListens = (dayMap: Map<number, number>): YearlyListeningRate[] => {
  const byYear = new Map<number, [number, number][]>();
  const sortedDays = [...dayMap.entries()].sort((a, b) => a[0] - b[0]);
  for (const [dayStartMs, count] of sortedDays) {
    const year = new Date(dayStartMs).getFullYear();
    const list = byYear.get(year);
    const pair: [number, number] = [dayStartMs, count];
    if (list) list.push(pair);
    else byYear.set(year, [pair]);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, listens]) => ({ year, listens }));
};

/** ±5s position clustering (mirrors updateSeeksArray), capped at 100 entries. */
const mergeSeeks = (
  localSeeks: SongSeek[] = [],
  foreignSeeks: SongSeek[] = [],
  mergeMode: StatsMergeMode
) => {
  const merged = localSeeks.map((seek) => ({ ...seek }));
  for (const foreignSeek of foreignSeeks) {
    const cluster = merged.find(
      (seek) => foreignSeek.position < seek.position + 5 && foreignSeek.position > seek.position - 5
    );
    if (cluster) cluster.seeks = mergeScalar(cluster.seeks, foreignSeek.seeks, mergeMode);
    else merged.push({ ...foreignSeek });
  }
  return merged.slice(0, 100);
};

const mergeListeningEntry = (
  localEntry: SongListeningData | undefined,
  foreignEntry: SongListeningData,
  localSongId: string,
  mergeMode: StatsMergeMode
): SongListeningData => {
  const mergedDays = bucketListensByDay(localEntry?.listens ?? []);
  const foreignDays = bucketListensByDay(foreignEntry.listens);
  for (const [dayStartMs, count] of foreignDays) {
    const localCount = mergedDays.get(dayStartMs);
    mergedDays.set(
      dayStartMs,
      localCount === undefined ? count : mergeScalar(localCount, count, mergeMode)
    );
  }

  const merged: SongListeningData = {
    songId: localSongId,
    listens: rebuildYearlyListens(mergedDays)
  };

  const fullListens = mergeScalar(localEntry?.fullListens, foreignEntry.fullListens, mergeMode);
  const skips = mergeScalar(localEntry?.skips, foreignEntry.skips, mergeMode);
  if (fullListens > 0) merged.fullListens = fullListens;
  if (skips > 0) merged.skips = skips;
  // inNoOfPlaylists is derived from local playlists — the foreign value is meaningless here.
  if (localEntry?.inNoOfPlaylists) merged.inNoOfPlaylists = localEntry.inNoOfPlaylists;
  const seeks = mergeSeeks(localEntry?.seeks, foreignEntry.seeks, mergeMode);
  if (seeks.length > 0) merged.seeks = seeks;

  return merged;
};

const mergeListeningData = (
  exportData: StatsExportFile,
  matches: Map<string, string>,
  mergeMode: StatsMergeMode
) => {
  const localListeningData = getListeningData();
  // Untouched local entries keep their original object references (byte-identical passthrough).
  const mergedById = new Map(localListeningData.map((entry) => [entry.songId, entry]));
  const touchedIds = new Set<string>();
  let matchedSongs = 0;
  let unmatchedSongs = 0;

  for (const foreignEntry of exportData.listeningData) {
    const localSongId = matches.get(foreignEntry.songId);
    if (!localSongId) {
      unmatchedSongs += 1;
      continue;
    }
    matchedSongs += 1;
    mergedById.set(
      localSongId,
      mergeListeningEntry(mergedById.get(localSongId), foreignEntry, localSongId, mergeMode)
    );
    touchedIds.add(localSongId);
  }

  return {
    listeningData: [...mergedById.values()],
    matchedSongs,
    unmatchedSongs,
    mergedEntries: touchedIds.size
  };
};

const normalizeRating = (rating: EloSongRating): EloSongRating => ({
  rating: typeof rating?.rating === 'number' ? rating.rating : 1200,
  games: typeof rating?.games === 'number' ? rating.games : 0,
  wins: typeof rating?.wins === 'number' ? rating.wins : 0,
  losses: typeof rating?.losses === 'number' ? rating.losses : 0,
  ...(typeof rating?.lastDuelAt === 'number' ? { lastDuelAt: rating.lastDuelAt } : {})
});

const mergeEloData = (
  foreignElo: EloData | undefined,
  localElo: EloData,
  matches: Map<string, string>,
  mergeMode: StatsMergeMode
) => {
  if (!foreignElo || typeof foreignElo !== 'object') return { elo: localElo, merged: false };

  const ratings: Record<string, EloSongRating> = { ...localElo.ratings };
  for (const [foreignSongId, foreignRatingRaw] of Object.entries(foreignElo.ratings ?? {})) {
    const localSongId = matches.get(foreignSongId);
    if (!localSongId) continue;

    const foreignRating = normalizeRating(foreignRatingRaw);
    const localRating = ratings[localSongId];
    if (!localRating) {
      ratings[localSongId] = foreignRating;
      continue;
    }

    const games = mergeScalar(localRating.games, foreignRating.games, mergeMode);
    const wins = mergeScalar(localRating.wins, foreignRating.wins, mergeMode);
    const losses = mergeScalar(localRating.losses, foreignRating.losses, mergeMode);
    const totalGamesWeight = localRating.games + foreignRating.games;
    // A song rated on both sides keeps the games-weighted mean of both ratings.
    const rating =
      totalGamesWeight > 0
        ? Math.round(
            ((localRating.rating * localRating.games + foreignRating.rating * foreignRating.games) /
              totalGamesWeight) *
              10
          ) / 10
        : 1200;
    const lastDuelAt = Math.max(localRating.lastDuelAt ?? 0, foreignRating.lastDuelAt ?? 0);

    ratings[localSongId] = {
      rating,
      games,
      wins,
      losses,
      ...(lastDuelAt > 0 ? { lastDuelAt } : {})
    };
  }

  const remappedForeignHistory = (Array.isArray(foreignElo.history) ? foreignElo.history : [])
    .map((record) => {
      const songAId = matches.get(record.songAId);
      const songBId = matches.get(record.songBId);
      if (!songAId || !songBId) return undefined;
      return { ...record, songAId, songBId };
    })
    .filter(isDefined);

  const combinedHistory = [...localElo.history, ...remappedForeignHistory];
  const historySource =
    mergeMode === 'sameOrigin'
      ? [
          ...new Map(
            combinedHistory.map((record) => [
              [
                record.at,
                record.songAId,
                record.songBId,
                record.winner,
                record.deltaA,
                record.deltaB
              ].join('|'),
              record
            ])
          ).values()
        ]
      : combinedHistory;
  const history = historySource.sort((a, b) => b.at - a.at).slice(0, 1000);

  const totalDuels = mergeScalar(localElo.totalDuels, foreignElo.totalDuels, mergeMode);

  return { elo: { ratings, history, totalDuels }, merged: true };
};

// ---------------------------------------------------------------------------
// 4. Backup (before the single write)
// ---------------------------------------------------------------------------

const backupCurrentStatsFiles = async () => {
  const userDataPath = app.getPath('userData');
  const backupsFolder = path.join(userDataPath, 'backups');
  await makeDir(backupsFolder);

  const epoch = Date.now();
  let firstBackupPath: string | undefined;

  for (const fileName of [
    'listening_data.json',
    'cmr_stats.json',
    'playlists.json',
    'tierlists.json'
  ]) {
    const source = path.join(userDataPath, fileName);
    const destination = path.join(backupsFolder, `${fileName}.backup.${epoch}.json`);
    try {
      await fs.copyFile(source, destination);
      if (!firstBackupPath) firstBackupPath = destination;
    } catch (error) {
      // cmr_stats.json may not exist yet on fresh installs — nothing to back up then.
      if (isAnErrorWithCode(error) && error.code === 'ENOENT') continue;
      throw error;
    }
  }

  return firstBackupPath;
};

// ---------------------------------------------------------------------------

const importStatsData = async (
  mergeMode: StatsMergeMode,
  source: StatsImportSource
): Promise<StatsImportReport> => {
  const fail = (message?: string): StatsImportReport => ({
    success: false,
    ...(message ? { message } : {}),
    matchedSongs: 0,
    unmatchedSongs: 0,
    mergedListens: 0,
    eloMerged: false
  });

  if (mergeMode !== 'separateDevices' && mergeMode !== 'sameOrigin')
    return fail('Unknown stats merge mode.');
  if (source !== 'file' && source !== 'folder') return fail('Unknown stats import source.');

  // 1. Read + validate everything fully in memory — before ANY write.
  let exportData: StatsExportFile;
  try {
    exportData = await readImportSource(source);
  } catch (error) {
    if ((error as Error).message === 'PROMPT_CLOSED_BEFORE_INPUT') return fail();
    logger.error('Failed to read the stats import source.', { error, source });
    return fail((error as Error).message || 'Failed to read the selected import source.');
  }

  const validationError = validateExportData(exportData);
  if (validationError) {
    logger.warn('Stats import aborted: invalid import data.', { validationError, source });
    return fail(validationError);
  }

  // Optional blocks never abort the import — a malformed one is skipped with a note.
  const blockNotes: string[] = [];
  if (
    exportData.playlists !== undefined &&
    !(Array.isArray(exportData.playlists) && exportData.playlists.every(isValidExportedPlaylist))
  ) {
    blockNotes.push('Skipped a malformed playlists block.');
    exportData = { ...exportData, playlists: undefined };
  }
  if (
    exportData.tierlists !== undefined &&
    !(Array.isArray(exportData.tierlists) && exportData.tierlists.every(isValidTierlistExport))
  ) {
    blockNotes.push('Skipped a malformed tierlists block.');
    exportData = { ...exportData, tierlists: undefined };
  }
  if (exportData.preferences !== undefined && !isValidExportPreferences(exportData.preferences)) {
    blockNotes.push('Skipped malformed preferences.');
    exportData = { ...exportData, preferences: undefined };
  }

  const cmrStats = getCmrStatsData();

  // Double-import guard: summing the same export twice would double every number.
  if (
    mergeMode === 'separateDevices' &&
    cmrStats.importedStatsExportIds.includes(exportData.exportId)
  ) {
    return { ...fail('This export was already imported.'), alreadyImported: true };
  }

  // 2. Fingerprint-match + merge fully in memory.
  const matches = matchForeignSongs(exportData.songs, getSongsData());
  const mergedListening = mergeListeningData(exportData, matches, mergeMode);
  const mergedElo = mergeEloData(exportData.elo, cmrStats.elo, matches, mergeMode);

  // 3. Backup the current files before touching them.
  let backupPath: string | undefined;
  try {
    backupPath = await backupCurrentStatsFiles();
  } catch (error) {
    logger.error('Stats import aborted: failed to create a backup.', { error });
    return fail('Failed to create a backup before importing. Nothing was changed.');
  }

  // 4. Single write via the existing setters.
  saveListeningData(mergedListening.listeningData);
  setCmrStatsData({
    elo: mergedElo.elo,
    importedStatsExportIds: cmrStats.importedStatsExportIds.includes(exportData.exportId)
      ? cmrStats.importedStatsExportIds
      : [...cmrStats.importedStatsExportIds, exportData.exportId]
  });

  // 5. Playlists + tierlists (no-ops for exports that don't carry them).
  const collections = importCollections(exportData, matches);

  // 6. Refresh listeners — no app restart needed.
  dataUpdateEvent('songs/listeningData');
  dataUpdateEvent('eloDuels');

  logger.info('Stats data imported successfully.', {
    source,
    mergeMode,
    matchedSongs: mergedListening.matchedSongs,
    unmatchedSongs: mergedListening.unmatchedSongs,
    backupPath
  });

  const notes = [...blockNotes, ...collections.notes];
  return {
    success: true,
    matchedSongs: mergedListening.matchedSongs,
    unmatchedSongs: mergedListening.unmatchedSongs,
    mergedListens: mergedListening.mergedEntries,
    eloMerged: mergedElo.merged,
    ...(collections.playlistsImported > 0
      ? { playlistsImported: collections.playlistsImported }
      : {}),
    ...(collections.tierlistsImported > 0
      ? { tierlistsImported: collections.tierlistsImported }
      : {}),
    ...(exportData.preferences ? { importedPreferences: exportData.preferences } : {}),
    ...(notes.length > 0 ? { notes } : {}),
    ...(backupPath ? { backupPath } : {})
  };
};

export default importStatsData;
