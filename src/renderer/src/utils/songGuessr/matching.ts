const BRACKETED_SUFFIX_PATTERN = /\s*(?:\([^)]*\)|\[[^\]]*\])/g;
const NON_ALPHANUMERIC_PATTERN = /[^\p{L}\p{N}]+/gu;

/** Converts user-facing song metadata into a forgiving comparison key. */
export const normalizeGuessText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(BRACKETED_SUFFIX_PATTERN, ' ')
    .replace(NON_ALPHANUMERIC_PATTERN, ' ')
    .trim();

/** Matches by stable id first, then by normalized metadata for duplicate files. */
export const isCorrectGuess = (answer: SongGuessrEntry, guess: SongGuessrCandidate): boolean => {
  if (answer.songId === guess.songId) return true;

  const answerTitle = normalizeGuessText(answer.title);
  if (!answerTitle || answerTitle !== normalizeGuessText(guess.title)) return false;

  const answerArtists = new Set(
    answer.artists.map(normalizeGuessText).filter((artist) => artist.length > 0)
  );
  return guess.artists.some((artist) => {
    const normalizedArtist = normalizeGuessText(artist);
    return normalizedArtist.length > 0 && answerArtists.has(normalizedArtist);
  });
};

export const formatCandidateLabel = (candidate: SongGuessrCandidate | SongGuessrEntry): string => {
  const artists = candidate.artists.join(', ');
  return artists ? `${candidate.title} — ${artists}` : candidate.title;
};
