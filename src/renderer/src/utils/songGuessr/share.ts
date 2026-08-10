import { SONG_GUESSR_MAX_ATTEMPTS } from './constants';

const getAttemptSquare = (attempt: SongGuessrAttempt): string => {
  switch (attempt.kind) {
    case 'skip':
      return '⬜';
    case 'wrong':
      return '🟥';
    case 'correct':
      return '🟩';
  }
};

export const buildShareText = (
  attempts: SongGuessrAttempt[],
  won: boolean,
  roundLabel: string
): string => {
  const displayedAttempts = attempts.slice(0, SONG_GUESSR_MAX_ATTEMPTS);
  const squares = displayedAttempts.map(getAttemptSquare).join('');
  const padding = '⬛'.repeat(SONG_GUESSR_MAX_ATTEMPTS - displayedAttempts.length);
  const result = won
    ? `${displayedAttempts.length}/${SONG_GUESSR_MAX_ATTEMPTS}`
    : `X/${SONG_GUESSR_MAX_ATTEMPTS}`;

  return [`SongGuessr — ${roundLabel}`, `${squares}${padding}`, result].join('\n');
};
