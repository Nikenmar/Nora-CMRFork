import fs from 'fs/promises';
import path from 'path';

import { getCmrStatsData, getListeningData, getSongsData } from '../../filesystem';
import { showSaveDialog } from '../../main';
import { generateRandomId } from '../../utils/randomId';
import logger from '../../logger';
import { version } from '../../../../package.json';

const EXPORT_FORMAT = 'nora-cmr-stats-export' as const;

const exportStatsData = async (): Promise<{ success: boolean; message?: string }> => {
  try {
    const destination = await showSaveDialog({
      title: 'Export Stats',
      buttonLabel: 'Export',
      defaultPath: `Nora Stats Export - ${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    });

    const listeningData = getListeningData();
    const songs = getSongsData();
    const songById = new Map(songs.map((song) => [song.songId, song]));

    // Fingerprints are how the importing device recognizes songs — songIds are
    // random per install and mean nothing across devices.
    const fingerprints: SongFingerprint[] = [];
    for (const entry of listeningData) {
      const song = songById.get(entry.songId);
      if (!song) continue;
      fingerprints.push({
        songId: song.songId,
        title: song.title,
        artists: song.artists?.map((artist) => artist.name) ?? [],
        duration: song.duration,
        fileName: path.basename(song.path)
      });
    }

    const elo = getCmrStatsData().elo;

    const exportFile: StatsExportFile = {
      format: EXPORT_FORMAT,
      formatVersion: 1,
      exportId: generateRandomId(),
      exportedAt: new Date().toISOString(),
      appVersion: version,
      songs: fingerprints,
      listeningData,
      ...(elo.totalDuels > 0 ? { elo } : {})
    };

    await fs.writeFile(destination, JSON.stringify(exportFile, null, 2), 'utf-8');

    logger.info('Stats data exported successfully.', { destination, songs: fingerprints.length });
    return { success: true };
  } catch (error) {
    // User closed the save dialog — not an error, stay silent.
    if ((error as Error).message === 'PROMPT_CLOSED_BEFORE_INPUT') return { success: false };
    logger.error('Failed to export stats data.', { error });
    return { success: false, message: 'Failed to export stats data.' };
  }
};

export default exportStatsData;
