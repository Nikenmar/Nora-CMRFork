import { existsSync } from 'fs';
import path from 'path';
import { join as joinPosix } from 'node:path/posix';
import sharp from 'sharp';

import { DEFAULT_ARTWORK_SAVE_LOCATION, DEFAULT_FILE_URL } from '../filesystem';
import logger from '../logger';

const MD_SIZE = 400;

/**
 * Returns medium (400px) cached artwork thumbnails for the given songs, keyed by
 * songId, served via `nora://`. Tierlist grids render hundreds of covers at once;
 * decoding the full-resolution originals for all of them is what causes the lag.
 * A 400px thumbnail is crisp at the ~96px card size while being cheap to decode.
 *
 * Thumbnails are generated on first request from the existing full-res artwork
 * and cached on disk (`<id>-tl.webp`), so subsequent loads are instant. Songs
 * without a custom cover are simply omitted (the renderer falls back to the
 * optimized/default artwork).
 */
const getTierlistArtworks = async (songIds: string[]): Promise<Record<string, string>> => {
  const result: Record<string, string> = {};
  if (!Array.isArray(songIds) || songIds.length === 0) return result;

  const CONCURRENCY = 12;
  const queue = [...new Set(songIds)];

  const worker = async () => {
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) break;
      try {
        const mdPath = path.join(DEFAULT_ARTWORK_SAVE_LOCATION, `${id}-tl.webp`);
        const fullPath = path.join(DEFAULT_ARTWORK_SAVE_LOCATION, `${id}.webp`);

        if (!existsSync(mdPath)) {
          if (!existsSync(fullPath)) continue; // no custom artwork — let renderer fall back
          await sharp(fullPath)
            .resize(MD_SIZE, MD_SIZE, { fit: 'cover' })
            .webp({ quality: 80, effort: 2 })
            .toFile(mdPath);
        }
        // Build the nora:// URL with POSIX join (forward slashes) — win32
        // path.join mangles the `nora://` prefix and breaks the protocol handler.
        result[id] = joinPosix(DEFAULT_FILE_URL, DEFAULT_ARTWORK_SAVE_LOCATION, `${id}-tl.webp`);
      } catch (error) {
        logger.error('Failed to create a tierlist artwork thumbnail.', { error, id });
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return result;
};

export default getTierlistArtworks;
