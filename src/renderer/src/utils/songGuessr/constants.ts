export const SONG_GUESSR_SNIPPETS = [0.1, 0.5, 1, 3, 6, 12] as const;

export const SONG_GUESSR_MAX_ATTEMPTS = SONG_GUESSR_SNIPPETS.length;

export const SONG_GUESSR_STORAGE_KEY = 'nora_song_guessr';

/** Shared so the dock can hand focus to the guess box when the panel opens. */
export const SONG_GUESSR_GUESS_INPUT_ID = 'song-guessr-guess-input';

/** Where focus parks while a round is still loading and there is no guess box. */
export const SONG_GUESSR_PANEL_ATTRIBUTE = 'data-song-guessr-panel';

/** How many finished rounds the stats history keeps, newest first. */
export const SONG_GUESSR_RECENT_ROUNDS_CAP = 50;
