/**
 * Weighted version of shuffleQueueRandomly. Reorders the current queue using
 * per-song weights (from the Mega Smart Shuffle), keeping the currently playing
 * song at the front. Uses Efraimidis–Spirakis weighted sampling
 * (key = random^(1/weight)), so higher-weighted songs tend earlier while the
 * order stays genuinely random. Returns `positions` to restore the original
 * order, exactly like the normal shuffle.
 */
const megaShuffleQueue = (
  songIds: string[],
  weights: Record<string, number>,
  currentSongIndex?: number
) => {
  const positions: number[] = [];
  const initialQueue = songIds.slice(0);
  const working = songIds.slice(0);
  const currentSongId =
    typeof currentSongIndex === 'number' ? working.splice(currentSongIndex, 1)[0] : undefined;

  const keyed = working.map((id) => {
    const weight = weights[id] ?? 0.4;
    return { id, key: Math.random() ** (1 / weight) };
  });
  keyed.sort((a, b) => b.key - a.key);
  const shuffledQueue = keyed.map((k) => k.id);

  if (currentSongId) shuffledQueue.unshift(currentSongId);

  for (let i = 0; i < initialQueue.length; i += 1) {
    positions.push(shuffledQueue.indexOf(initialQueue[i]));
  }

  return { shuffledQueue, positions };
};

export default megaShuffleQueue;
