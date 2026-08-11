import NodeID3 from 'node-id3';
import { ReactElement, ReactNode } from 'react';
import { ButtonProps } from '../renderer/src/components/Button';
import { DropdownOption } from '../renderer/src/components/Dropdown';
import { api } from '../preload';
import { LastFMSessionData } from './last_fm_api';
import { SimilarArtist, Tag } from './last_fm_artist_info_api';
import { resources } from 'src/renderer/src/i18n';

declare global {
  interface Window {
    electron: ElectronAPI;
    api: typeof api;
  }

  type LogMessageTypes = 'INFO' | 'WARN' | 'ERROR';

  type IpcChannels =
    | 'app/beforeQuitEvent'
    | 'app/Close'
    | 'app/minimize'
    | 'app/toggleMaximize'
    | 'app/focused'
    | 'app/blurred'
    | 'app/systemThemeChange'
    | 'app/getSongPosition'
    | 'app/incrementNoOfSongListens'
    | 'app/addMusicFolder'
    | 'app/getSong'
    | 'app/getAllSongs'
    | 'app/toggleLikeSongs'
    | 'app/saveUserData'
    | 'app/getUserData'
    | 'app/search'
    | 'app/getSongLyrics'
    | 'app/getSongInfo'
    | 'app/openDevTools'
    | 'app/getArtistArtworks'
    | 'app/getArtistData'
    | 'app/getGenresData'
    | 'app/getAlbumData'
    | 'app/getPlaylistData'
    | 'app/addNewPlaylist'
    | 'app/removePlaylists'
    | 'app/addSongToPlaylist'
    | 'app/removeSongsFromLibrary'
    | 'app/deleteSongFromSystem'
    | 'app/resyncSongsLibrary'
    | 'app/restoreBlacklistedSong'
    | 'app/updateSongId3Tags'
    | 'app/getSongId3Tags'
    | 'app/openLogFile'
    | 'revealSongInFileExplorer'
    | 'app/openInBrowser'
    | 'app/removeAMusicFolder'
    | 'app/sendMessageToRendererEvent'
    | 'app/dataUpdateEvent'
    | 'app/toggleMiniPlayer'
    | 'app/toggleAutoLaunch'
    | 'app/getFolderData'
    | 'app/restartRenderer'
    | 'app/restartApp'
    | 'app/resetApp'
    | 'app/player/songPlaybackStateChange'
    | 'app/player/toggleSongPlaybackState'
    | 'app/player/skipForward'
    | 'app/player/skipBackward'
    | 'app/player/toggleSongPlaybackState'
    | 'app/player/skipBackward'
    | 'app/getSongGuessrRound'
    | 'app/searchSongGuessrCandidates'
    | 'app/getSongGuessrPools';

  interface ImageCoverData {
    format: string;
    data: Buffer;
  }

  // ? Song data related types

  interface SavableSongData {
    songId: string;
    title: string;
    duration: number;
    artists?: { artistId: string; name: string }[];
    album?: { albumId: string; name: string };
    genres?: { genreId: string; name: string }[];
    albumArtists?: { artistId: string; name: string }[];
    bitrate?: number;
    trackNo?: number;
    discNo?: number;
    noOfChannels?: number;
    year?: number;
    sampleRate?: number;
    paletteId?: string;
    isAFavorite: boolean;
    isArtworkAvailable: boolean;
    path: string;
    createdDate?: number;
    modifiedDate?: number;
    addedDate: number;
  }

  interface ArtworkPaths {
    isDefaultArtwork: boolean;
    artworkPath: string;
    optimizedArtworkPath: string;
  }

  interface SongData extends SavableSongData {
    artworkPaths: ArtworkPaths;
    isBlacklisted: boolean;
    paletteData?: PaletteData;
  }

  interface PaletteData extends NodeVibrantPalette {
    paletteId: string;
  }

  interface NodeVibrantPalette {
    DarkMuted?: NodeVibrantPaletteSwatch;
    DarkVibrant?: NodeVibrantPaletteSwatch;
    LightMuted?: NodeVibrantPaletteSwatch;
    LightVibrant?: NodeVibrantPaletteSwatch;
    Muted?: NodeVibrantPaletteSwatch;
    Vibrant?: NodeVibrantPaletteSwatch;
  }
  interface NodeVibrantPaletteSwatch {
    hsl: [number, number, number];
    hex: string;
    population: number;
    // rgb: [number, number, number];
    // bodyTextColor?: string;
    // titleTextColor?: string;
  }

  interface AudioPlayerData {
    songId: string;
    title: string;
    artists?: {
      artistId: string;
      name: string;
      artworkPath?: string;
      onlineArtworkPaths?: OnlineArtistArtworks;
    }[];
    duration: number;
    artwork?: string | Buffer | Uint8Array;
    artworkPath?: string;
    path: string;
    isAFavorite: boolean;
    album?: { albumId: string; name: string };
    paletteData?: PaletteData;
    isKnownSource: boolean;
    isBlacklisted: boolean;
  }

  interface AudioInfo {
    title: string;
    artists?: { artistId: string; name: string }[];
    album?: { albumId: string; name: string };
    duration: number;
    artworkPaths: ArtworkPaths;
    path: string;
    songId: string;
    addedDate: number;
    isAFavorite: boolean;
    year?: number;
    paletteData?: PaletteData;
    isBlacklisted: boolean;
    trackNo?: number;
  }

  type PaginatingData = { start: number; end: number };

  interface PaginatedResult<DataType, SortType extends string> {
    data: DataType[];
    sortType: SortType;
    start: number;
    end: number;
    total: number;
  }

  interface ToggleLikeSongReturnValue {
    likes: string[];
    dislikes: string[];
  }

  // ? Song listening data related types

  interface SongListeningData {
    /** song id of the relevant song */
    songId: string;
    /** no of song skips.
     * Incremented if the song is skipped less than 5 seconds */
    skips?: number;
    /** no of full listens.
     * Incremented if the user has listened to more than 80% of the song. */
    fullListens?: number;
    /** no of playlists the song was added.
     * Incremented if the user added the song to any playlist. */
    inNoOfPlaylists?: number;
    /** an array of listening records for each year. */
    listens: YearlyListeningRate[];
    /** an array of listening records for each year. */
    seeks?: SongSeek[];
  }

  interface SongSeek {
    position: number;
    seeks: number;
  }
  interface YearlyListeningRate {
    year: number;
    /** [Date in milliseconds, No of listens in that day] [] */
    listens: [number, number][];
  }

  interface ListeningDataTypes extends Omit<SongListeningData, 'listens'> {
    listens: number;
  }

  // ? Audio player and lyrics related types

  type RepeatTypes = 'false' | 'repeat' | 'repeat-1';

  type PlayerTypes = 'normal' | 'mini' | 'full';

  type PlayerVolume = { isMuted: boolean; value: number };
  interface Player {
    isCurrentSongPlaying: boolean;
    volume: PlayerVolume;
    isRepeating: RepeatTypes;
    songPosition: number;
    isShuffling: boolean;
    /** Tierlist (Mega Smart) Shuffle mode — mutually exclusive with isShuffling. */
    isTierShuffling: boolean;
    isPlayerStalled: boolean;
    playbackRate: number;
  }

  type SongSkipReason = 'USER_SKIP' | 'PLAYER_SKIP';

  type AutomaticallySaveLyricsTypes = 'SYNCED' | 'SYNCED_OR_UN_SYNCED' | 'NONE';

  type LyricsTypes = 'ENHANCED_SYNCED' | 'SYNCED' | 'UN_SYNCED' | 'ANY';

  type LyricsRequestTypes = 'ONLINE_ONLY' | 'OFFLINE_ONLY' | 'ANY';

  type LyricsSource = 'IN_SONG_LYRICS' | 'MUSIXMATCH' | string;

  export type SyncedLyricsLineWord = {
    text: string;
    start: number;
    end: number;
    unparsedText: string;
  };

  // Represents a single translation of a lyric line in a specific language
  interface TranslatedLyricLine {
    lang: string; // Language code of the translation
    text: string | SyncedLyricsLineWord[]; // Translated text or synced lyrics
  }

  // Represents a single line of lyrics, either synced or unsynced
  interface LyricLine {
    originalText: string | SyncedLyricsLineWord[]; // Original text of the lyric line
    romanizedText?: string | SyncedLyricsLineWord[]; // Romanized text of the lyric line (optional)
    translatedTexts: TranslatedLyricLine[]; // Array of translations in different languages
    //convertedLyrics: string | SyncedLyricsLineWord[]; // Converted lyrics
    start?: number; // Timing start (for synced lyrics only)
    end?: number; // Timing end (for synced lyrics only)
    isEnhancedSynced: boolean; // Indicates if the original text is enhanced synced lyrics
  }

  // Holds all the lyrics data, whether synced or unsynced
  interface LyricsData {
    isSynced: boolean;
    isRomanized: boolean; // Indicates if the lyrics have been romanized
    isTranslated: boolean; // Indicates if translations are available
    // isTranslated: boolean;
    // isJapanese: boolean;
    // isChinese: boolean;
    // isKorean: boolean;
    // isConvertedToRomaji: boolean;
    // isConvertedToPinyin: boolean;
    // isConvertedToRomaja: boolean;
    isReset: boolean;
    parsedLyrics: LyricLine[]; // Array of original lyric lines (both synced and unsynced)
    unparsedLyrics: string;
    offset?: number;
    originalLanguage?: string; // Language of the original lyrics (optional)
    translatedLanguages?: string[]; // Array of language codes of the translated lyrics (optional)
    copyright?: string;
  }

  interface SongLyrics {
    title: string;
    source: LyricsSource;
    lyricsType: LyricsTypes;
    link?: string;
    lyrics: LyricsData; // original and translated lyrics data
    isOfflineLyricsAvailable: boolean;
  }

  interface LyricsRequestTrackInfo {
    songTitle: string;
    songArtists?: string[];
    album?: string;
    songPath: string;
    duration: number;
  }

  // node-id3 synchronisedLyrics types.
  type UnsynchronisedLyrics =
    | {
        language: string;
        text: string;
      }
    | undefined;

  type SynchronisedLyrics =
    | Array<{
        /**
         * 3 letter ISO 639-2 language code, for example: eng
         * @see {@link https://id3.org/ISO%20639-2 ISO 639-2}
         */
        language: string;
        /**
         * Absolute time unit:
         * {@link TagConstants.TimeStampFormat}
         */
        timeStampFormat: number;
        /**
         * {@link TagConstants.SynchronisedLyrics.ContentType}
         */
        contentType: number;
        /**
         * Content descriptor
         */
        shortText?: string;
        synchronisedText: Array<{
          text: string;
          /**
           * Absolute time in unit according to `timeStampFormat`.
           */
          timeStamp: number;
        }>;
      }>
    | undefined;

  interface LyricsMetadataFromShortText {
    copyright?: string;
  }

  // ? Song queue related types

  interface Queue {
    currentSongIndex: number | null;
    queue: string[];
    queueBeforeShuffle?: number[];
    queueId?: string;
    queueType: QueueTypes;
  }

  interface QueuedSong {
    title: string;
    artists: string[];
    path: string;
    artworkPath: string;
    duration: number;
    songId: string;
  }

  type QueueTypes = 'album' | 'playlist' | 'artist' | 'songs' | 'genre' | 'folder';

  // ? User data related types

  type AppThemeWithoutSystem = 'dark' | 'light';

  type AppTheme = AppThemeWithoutSystem | 'system';

  type UserDataTypes =
    | 'theme'
    | 'language'
    | 'currentSong.songId'
    | 'currentSong.stoppedPosition'
    | 'volume.value'
    | 'volume.isMuted'
    | 'musicFolders'
    | 'defaultPage'
    | 'queue'
    | 'isShuffling'
    | 'isRepeating'
    | 'windowPositions.mainWindow'
    | 'windowPositions.miniPlayer'
    | 'windowDiamensions.mainWindow'
    | 'windowDiamensions.miniPlayer'
    | 'windowState'
    | 'recentSearches'
    | 'preferences.isMiniPlayerAlwaysOnTop'
    | 'preferences.autoLaunchApp'
    | 'preferences.isMusixmatchLyricsEnabled'
    | 'preferences.hideWindowOnClose'
    | 'preferences.openWindowAsHiddenOnSystemStart'
    | 'preferences.sendSongScrobblingDataToLastFM'
    | 'preferences.sendSongFavoritesDataToLastFM'
    | 'preferences.sendNowPlayingSongDataToLastFM'
    | 'preferences.saveLyricsInLrcFilesForSupportedSongs'
    | 'preferences.autoTranslateLyrics'
    | 'preferences.autoConvertLyrics'
    | 'preferences.enableDiscordRPC'
    | 'preferences.saveVerboseLogs'
    | 'customMusixmatchUserToken'
    | 'customLrcFilesSaveLocation'
    | 'lastFmSessionData'
    | 'storageMetrics'
    | PageSortTypes;

  interface Blacklist {
    songBlacklist: string[];
    folderBlacklist: string[];
  }

  interface UserData {
    language: LanguageCodes;
    theme: AppThemeData;
    musicFolders: FolderStructure[];
    preferences: {
      autoLaunchApp: boolean;
      openWindowMaximizedOnStart: boolean;
      openWindowAsHiddenOnSystemStart: boolean;
      isMiniPlayerAlwaysOnTop: boolean;
      isMusixmatchLyricsEnabled: boolean;
      hideWindowOnClose: boolean;
      sendSongScrobblingDataToLastFM: boolean;
      sendSongFavoritesDataToLastFM: boolean;
      sendNowPlayingSongDataToLastFM: boolean;
      saveLyricsInLrcFilesForSupportedSongs: boolean;
      enableDiscordRPC: boolean;
      saveVerboseLogs: boolean;
    };
    windowPositions: {
      mainWindow?: WindowCordinates;
      miniPlayer?: WindowCordinates;
    };
    windowDiamensions: {
      mainWindow?: WindowCordinates;
      miniPlayer?: WindowCordinates;
    };
    windowState: WindowState;
    recentSearches: string[];
    customMusixmatchUserToken?: string;
    lastFmSessionData?: LastFMSessionData;
    storageMetrics?: StorageMetrics;
    customLrcFilesSaveLocation?: string;
  }

  type LanguageCodes = NoInfer<keyof typeof resources>;

  interface AppThemeData {
    isDarkMode: boolean;
    useSystemTheme: boolean;
  }

  interface WindowCordinates {
    x: number;
    y: number;
  }

  type WindowState = 'maximized' | 'normal' | 'minimized';
  interface MusicFolderData {
    path: string;
    stats: {
      lastModifiedDate: Date;
      lastChangedDate: Date;
      fileCreatedDate: Date;
      lastParsedDate: Date;
    };
  }

  interface FolderStructure extends MusicFolderData {
    subFolders: FolderStructure[];
    noOfSongs?: number;
  }

  interface MusicFolder extends FolderStructure {
    songIds: string[];
    isBlacklisted: boolean;
    subFolders: MusicFolder[];
  }

  // ? LocalStorage related types

  interface Preferences {
    seekbarScrollInterval: number;
    isSongIndexingEnabled: boolean;
    doNotShowBlacklistSongConfirm: boolean;
    isReducedMotion: boolean;
    doNotVerifyWhenOpeningLinks: boolean;
    doNotShowHelpPageOnLyricsEditorStartUp: boolean;
    showSongRemainingTime: boolean;
    showArtistArtworkNearSongControls: boolean;
    disableBackgroundArtworks: boolean;
    noUpdateNotificationForNewUpdate: string;
    defaultPageOnStartUp: DefaultPages;
    enableArtworkFromSongCovers: boolean;
    shuffleArtworkFromSongCovers: boolean;
    removeAnimationsOnBatteryPower: boolean;

    lyricsAutomaticallySaveState: AutomaticallySaveLyricsTypes;
    showTrackNumberAsSongIndex: boolean;
    allowToPreventScreenSleeping: boolean;
    enableImageBasedDynamicThemes: boolean;
    autoTranslateLyrics: boolean;
    autoConvertLyrics: boolean;
    /** Smart Shuffle intensity, 0..1 (0 = pure random, 0.6 = default 60/40, 1 = fully smart). */
    tierShuffleIntensity?: number;
  }

  interface CurrentSong {
    songId: string | null;
    stoppedPosition: number;
    playlistId?: string;
  }

  interface Volume {
    isMuted: boolean;
    value: number;
  }

  interface Playback {
    isShuffling: boolean;
    isTierShuffling?: boolean;
    isRepeating: RepeatTypes;
    currentSong: CurrentSong;
    volume: Volume;
    playbackRate: number;
  }

  type EqualizerBandFilters =
    | 'thirtyTwoHertzFilter'
    | 'sixtyFourHertzFilter'
    | 'hundredTwentyFiveHertzFilter'
    | 'twoHundredFiftyHertzFilter'
    | 'fiveHundredHertzFilter'
    | 'thousandHertzFilter'
    | 'twoThousandHertzFilter'
    | 'fourThousandHertzFilter'
    | 'eightThousandHertzFilter'
    | 'sixteenThousandHertzFilter';

  type EqualierPresetDropdownOptionValues =
    | 'custom'
    | 'flat'
    | 'acoustic'
    | 'bassBooster'
    | 'bassReducer'
    | 'classical'
    | 'club'
    | 'dance'
    | 'deep'
    | 'electronic'
    | 'hipHop'
    | 'jazz'
    | 'latin'
    | 'live'
    | 'loudness'
    | 'lounge'
    | 'metal'
    | 'piano'
    | 'pop'
    | 'reggae'
    | 'rnb'
    | 'rock'
    | 'ska'
    | 'smallSpeakers'
    | 'soft'
    | 'softRock'
    | 'spokenWord'
    | 'techno'
    | 'trebleBooster'
    | 'trebleReducer'
    | 'vocalBooster';

  interface Equalizer extends Record<EqualizerBandFilters, number> {
    thirtyTwoHertzFilter: number;
    sixtyFourHertzFilter: number;
    hundredTwentyFiveHertzFilter: number;
    twoHundredFiftyHertzFilter: number;
    fiveHundredHertzFilter: number;
    thousandHertzFilter: number;
    twoThousandHertzFilter: number;
    fourThousandHertzFilter: number;
    eightThousandHertzFilter: number;
    sixteenThousandHertzFilter: number;
  }

  type EqualizerPresetsData = {
    title: EqualierPresetDropdownOptionValues;
    preset: Equalizer;
  }[];

  interface EqualizerPresetDropdownOptions
    extends DropdownOption<EqualierPresetDropdownOptionValues> {
    preset?: Equalizer;
  }

  interface IgnoredDuplicates {
    artists: string[];
    albums: string[];
    genres: string[];
  }

  interface SortingStates {
    songsPage?: SongSortTypes;
    artistsPage?: ArtistSortTypes;
    playlistsPage?: PlaylistSortTypes;
    albumsPage?: AlbumSortTypes;
    genresPage?: GenreSortTypes;
    musicFoldersPage?: FolderSortTypes;
    tierlistsPage?: TierlistSortTypes;
  }

  interface LyricsEditorSettings {
    offset: number;
    editNextAndCurrentStartAndEndTagsAutomatically: boolean;
  }

  interface LocalStorage {
    preferences: Preferences;
    playback: Playback;
    queue: Queue;
    ignoredSeparateArtists: string[];
    ignoredSongsWithFeatArtists: string[];
    ignoredDuplicates: IgnoredDuplicates;
    sortingStates: SortingStates;
    equalizerPreset: Equalizer;
    lyricsEditorSettings: LyricsEditorSettings;
    duels: DuelsLocalStorage;
  }

  // ? Playlists related types

  interface SavablePlaylist {
    playlistId: 'Favorites' | 'History' | 'Rediscover' | string;
    name: string;
    /** song ids of the songs in the playlist */
    songs: string[];
    createdDate: Date;
    isArtworkAvailable: boolean;
  }

  interface Playlist extends SavablePlaylist {
    artworkPaths: ArtworkPaths;
  }

  // ? Tierlist related types

  /** How a card caption is rendered inside a tierlist. */
  type TierlistLabelMode = 'track' | 'artistAndTrack';

  /** A single ranked row inside a tierlist (e.g. S, A, B ...). */
  interface TierRow {
    tierId: string;
    /** User editable label shown on the colored band. */
    name: string;
    /** Ordered songIds placed in this tier. Filtered against the live pool on render. */
    items: string[];
  }

  /**
   * Persisted shape of a tierlist (stored in the isolated `tierlists.json` store).
   * The image pool is NOT stored — it is derived live from `sourcePlaylistIds`
   * (union of their songs, minus songs already placed in a tier) so editing a
   * source playlist instantly reflects in the pool.
   */
  interface SavableTierlist {
    tierlistId: string;
    name: string;
    createdDate: Date;
    /** Playlists whose songs make up the live image pool. */
    sourcePlaylistIds: string[];
    /** Music folders whose songs feed the pool. More authoritative than playlists
     * for dedup: a track present in both keeps the folder's songId. */
    sourceFolderPaths?: string[];
    /** Ordered tier rows, each holding its placed songIds. */
    tiers: TierRow[];
    labelMode: TierlistLabelMode;
    /** Show a hover play button on each card. Defaults to true when undefined. */
    showPlayButton?: boolean;
    /** When true, this tierlist's rankings feed the Tierlist (Mega Smart) Shuffle. */
    influencesShuffle?: boolean;
  }

  // ? CMR stats types (ELO duels + stats aggregation + portable stats transfer)

  interface EloSongRating {
    /** ELO rating, starts at 1200. Stored with one decimal. */
    rating: number;
    games: number;
    wins: number;
    losses: number;
    /** Draws introduced by the Too close feedback action. */
    draws?: number;
    /** ms timestamp of the last duel this song took part in. */
    lastDuelAt?: number;
  }

  interface DuelRecord {
    /** ms timestamp of the duel. */
    at: number;
    songAId: string;
    songBId: string;
    winner: 'A' | 'B' | 'draw';
    /** signed rating changes applied to song A / song B. */
    deltaA: number;
    deltaB: number;
  }

  interface EloData {
    /** key = songId (local to the device owning the store). */
    ratings: Record<string, EloSongRating>;
    /** newest first, capped at 1000 entries. */
    history: DuelRecord[];
    totalDuels: number;
  }

  type DuelSkipReason = 'tooClose' | 'tooDifferent' | 'cantDecide';

  interface DuelSkipRecord {
    at: number;
    songAId: string;
    songBId: string;
    /** Absent on records created before reasoned feedback; treated as cantDecide. */
    reason?: DuelSkipReason;
  }

  interface DuelMatchmakingData {
    /** Newest first. Used only to cool down pairs that were hard to compare. */
    skippedPairs: DuelSkipRecord[];
  }

  interface MegaShuffleData {
    weights: Record<string, number>;
    /** Pairwise signals used by the renderer's final queue ordering pass. */
    pairFeedback: DuelSkipRecord[];
  }

  /**
   * Persisted shape of the isolated `cmr_stats.json` store. On installs that
   * predate this file it simply doesn't exist and is created fresh — no
   * existing store/schema/migration is ever touched (tierlists pattern).
   */
  interface CmrStatsData {
    elo: EloData;
    /** exportIds already imported — anti-double-import guard. */
    importedStatsExportIds: string[];
    /** Optional for migration compatibility with pre-matchmaker stores. */
    duelMatchmaking?: DuelMatchmakingData;
  }

  type StatsTimeRange = 'allTime' | 'last12Months' | 'last30Days';

  /** separateDevices = sum both sides; sameOrigin = max (data originally came from this PC). */
  type StatsMergeMode = 'separateDevices' | 'sameOrigin';

  /** file = our stats export JSON; folder = a stock "Nora exports" directory. */
  type StatsImportSource = 'file' | 'folder';

  interface SongFingerprint {
    /** songId ON THE EXPORTING DEVICE — meaningless locally (songIds are random per install). */
    songId: string;
    title: string;
    /** artist names. */
    artists: string[];
    /** seconds (float, as stored). */
    duration: number;
    /** path basename, original case. */
    fileName: string;
  }

  /** A user playlist inside a stats export. Favorites/History are never exported. */
  interface ExportedPlaylist {
    /** playlistId ON THE EXPORTING DEVICE — meaningless locally (ids are random per install). */
    playlistId: string;
    name: string;
    /** songIds ON THE EXPORTING DEVICE — remapped via fingerprint matches on import. */
    songs: string[];
    /** ISO string once serialized to JSON. */
    createdDate: Date;
  }

  /** Portable renderer-side preferences carried inside a stats export. */
  interface StatsExportPreferences {
    /** Smart Shuffle intensity, 0..1. */
    tierShuffleIntensity?: number;
  }

  interface StatsExportFile {
    format: 'nora-cmr-stats-export';
    formatVersion: 1;
    /** random id, generated at export. */
    exportId: string;
    /** ISO timestamp. */
    exportedAt: string;
    appVersion: string;
    songs: SongFingerprint[];
    listeningData: SongListeningData[];
    /** absent when the exported data has no duels. */
    elo?: EloData;
    /** absent when the exporting device has no user playlists. */
    playlists?: ExportedPlaylist[];
    /** absent when the exporting device has no tierlists. IDs are foreign — remapped on import. */
    tierlists?: SavableTierlist[];
    /** absent when no portable preferences were provided at export time. */
    preferences?: StatsExportPreferences;
  }

  interface StatsImportReport {
    success: boolean;
    message?: string;
    matchedSongs: number;
    unmatchedSongs: number;
    mergedListens: number;
    eloMerged: boolean;
    backupPath?: string;
    /** exportId seen before (separateDevices double-import warning). */
    alreadyImported?: boolean;
    /** user playlists created or merged-into during this import. */
    playlistsImported?: number;
    /** tierlists created during this import. */
    tierlistsImported?: number;
    /** portable preferences from the file, for the renderer to apply. */
    importedPreferences?: StatsExportPreferences;
    /** human-readable notes about skipped/merged/broken blocks. */
    notes?: string[];
  }

  interface StatsSongEntry {
    songId: string;
    title: string;
    artists: string[];
    artworkPath?: string;
    listensInRange: number;
    /** all-time skips — filled for the "most skipped" list. */
    skips?: number;
  }

  interface StatsNameEntry {
    name: string;
    artistId?: string;
    listens: number;
  }

  interface StatsData {
    timeRange: StatsTimeRange;
    totals: {
      distinctSongsPlayed: number;
      totalListens: number;
      /** all-time scalar (range-independent — labeled so in the UI). */
      fullListens: number;
      /** all-time scalar. */
      skips: number;
      approxListeningTimeSec: number;
      favorites: number;
    };
    /** 12 month buckets (last12Months/allTime) or 30 day buckets (last30Days). */
    activity: { label: string; listens: number }[];
    /** GitHub-style trailing-53-weeks activity calendar + streaks (range-independent). */
    calendar: {
      days: { date: string; listens: number }[];
      currentStreak: number;
      longestStreak: number;
      mostActiveDay: { date: string; listens: number } | null;
    };
    topSongs: StatsSongEntry[];
    topArtists: StatsNameEntry[];
    topAlbums: StatsNameEntry[];
    topGenres: StatsNameEntry[];
    mostSkipped: StatsSongEntry[];
    elo: {
      totalDuels: number;
      topRated: (StatsSongEntry & {
        rating: number;
        effectiveRating: number;
        isProvisional: boolean;
        games: number;
        wins: number;
        losses: number;
        draws: number;
      })[];
      recentDuels: {
        at: number;
        titleA: string;
        titleB: string;
        winner: 'A' | 'B' | 'draw';
        deltaA: number;
        deltaB: number;
      }[];
    };
  }

  interface DuelSongEntry {
    songId: string;
    title: string;
    artists: string[];
    duration: number;
    path: string;
    artworkPaths: ArtworkPaths;
    rating: number;
    games: number;
  }

  interface DuelPair {
    songA: DuelSongEntry;
    songB: DuelSongEntry;
    /** Present for earned duels, independent of randomized A/B presentation. */
    ticketAnchorSongId?: string;
  }

  interface DuelResult {
    deltaA: number;
    deltaB: number;
    ratingA: number;
    ratingB: number;
  }

  type DuelInviteFrequency = 'off' | 'rare' | 'normal' | 'frequent';

  interface DuelTicket {
    anchorSongId: string;
    earnedAt: number;
  }

  interface DuelAnchorCandidate {
    songId: string;
    listenedAt: number;
  }

  interface DuelsLocalStorage {
    frequency: DuelInviteFrequency;
    /** Legacy: ms of the last earned duel. Unused since full-listen pacing replaced the time gate. */
    lastInviteAt: number;
    /** full listens (90%+) registered since the last earned duel. */
    listensSinceInvite: number;
    /** earned duel prompts that have not been voted on or skipped yet. */
    pendingDuels: number;
    /** FIFO queue of earned duel opportunities. The opponent is chosen just in time. */
    pendingDuelTickets: DuelTicket[];
    /** Recent full listens accumulated toward the next ticket. */
    duelAnchorCandidates: DuelAnchorCandidate[];
    /** Legacy fixed-pair queue, retained only for one-time migration. */
    /** FIFO queue of earned duel pairs [songAId, songBId]; A = the just-listened track. */
    pendingDuelPairs: [string, string][];
  }

  // ? Genre related types

  interface SavableGenre {
    genreId: string;
    name: string;
    songs: {
      title: string;
      songId: string;
    }[];
    artworkName?: string;
    paletteId?: string;
  }

  interface Genre extends SavableGenre {
    artworkPaths: ArtworkPaths;
    paletteData?: PaletteData;
  }

  // ? Albums related types

  interface SavableAlbum {
    albumId: string;
    title: string;
    artists?: {
      name: string;
      artistId: string;
    }[];
    songs: {
      title: string;
      songId: string;
    }[];
    year?: number;
    artworkName?: string;
  }

  interface Album extends SavableAlbum {
    artworkPaths: ArtworkPaths;
  }

  // ? Artists related types

  interface SavableArtist {
    artistId: string;
    songs: {
      title: string;
      songId: string;
    }[];
    albums?: {
      title: string;
      albumId: string;
    }[];
    name: string;
    isAFavorite: boolean;
    artworkName?: string;
    onlineArtworkPaths?: OnlineArtistArtworks;
  }

  interface Artist extends SavableArtist {
    artworkPaths: ArtworkPaths;
  }

  interface ArtistInfo extends Artist {
    artistPalette?: NodeVibrantPalette;
    artistBio?: string;
    similarArtists?: SimilarArtistInfo;
    tags?: Tag[];
  }

  interface SimilarArtistInfo {
    availableArtists: SimilarArtist[];
    unAvailableArtists: SimilarArtist[];
  }

  interface ArtistInfoFromNet {
    artistArtworks?: OnlineArtistArtworks;
    artistPalette?: PaletteData;
    artistBio?: string;
    similarArtists: SimilarArtistInfo;
    tags: Tag[];
  }

  interface OnlineArtistArtworks {
    picture_small: string;
    picture_medium: string;
    picture_xl?: string;
  }

  //  ? Storage related types

  interface AppDataStorageMetrics {
    appDataSize: number;
    artworkCacheSize: number;
    tempArtworkCacheSize: number;
    totalArtworkCacheSize: number;
    logSize: number;
    songDataSize: number;
    artistDataSize: number;
    albumDataSize: number;
    genreDataSize: number;
    playlistDataSize: number;
    paletteDataSize: number;
    userDataSize: number;
    librarySize: number;
    totalKnownItemsSize: number;
    otherSize: number;
  }

  interface StorageMetrics {
    rootSizes: { freeSpace: number; size: number };
    remainingSize: number;
    appFolderSize: number;
    appDataSizes: AppDataStorageMetrics;
    totalSize: number;
    generatedDate: string;
  }

  // ? Search related types

  type SearchFilters = 'All' | 'Artists' | 'Albums' | 'Songs' | 'Playlists' | 'Genres';

  interface SearchResult {
    songs: SongData[];
    artists: Artist[];
    albums: Album[];
    playlists: Playlist[];
    genres: Genre[];
    availableResults: string[];
  }

  // ? Prompt menu related types

  interface PromptMenuData {
    prompt: ReactNode;
    className?: string;
    isOneTime?: boolean;
  }
  interface PromptMenuNavigationHistoryData {
    isVisible: boolean;
    prompts: PromptMenuData[];
    currentActiveIndex: number;
  }

  // ? Notification panel related

  type DefaultCodes = 'SUCCESS' | 'FAILURE' | 'LOADING' | 'INFO';

  type ErrorCodes =
    | 'SONG_NOT_FOUND'
    | 'ARTISTS_NOT_FOUND'
    | 'EMPTY_SONG_ARRAY'
    | 'EMPTY_USERDATA'
    | 'DATA_FILE_ERROR'
    | 'EMPTY_BLACKLIST'
    | 'SONG_DATA_SEND_FAILED'
    | 'NO_BLACKLISTED_SONG_IN_GIVEN_PATH'
    | 'CREATE_TEMP_ARTWORK_FAILED'
    | 'READING_MODIFICATIONS_FAILED'
    | 'FOLDER_MODIFICATIONS_CHECK_FAILED'
    | 'SONG_EXT_NOT_SUPPORTED_FOR_LYRICS_SAVES'
    | 'RESET_FAILED'
    | 'MUSIC_FOLDER_DELETED'
    | 'EMPTY_MUSIC_FOLDER_DELETED'
    | 'OPEN_SONG_IN_EXPLORER_FAILED'
    | 'LYRICS_FIND_FAILED'
    | 'LYRICS_TRANSLATION_FAILED'
    | 'LYRICS_CONVERT_FAILED'
    | 'RESET_CONVERTED_LYRICS_FAILED'
    | 'METADATA_UPDATE_FAILED'
    | 'DESTINATION_NOT_SELECTED'
    | 'ARTWORK_SAVE_FAILED'
    | 'APPDATA_EXPORT_FAILED'
    | 'PLAYLIST_EXPORT_FAILED'
    | 'APPDATA_IMPORT_FAILED'
    | 'APPDATA_IMPORT_FAILED_DUE_TO_MISSING_FILES'
    | 'PLAYLIST_IMPORT_FAILED'
    | 'PLAYLIST_IMPORT_FAILED_DUE_TO_SONGS_OUTSIDE_LIBRARY'
    | 'PLAYLIST_IMPORT_TO_EXISTING_PLAYLIST_FAILED'
    | 'PLAYLIST_CREATION_FAILED'
    | 'PLAYLIST_IMPORT_FAILED_DUE_TO_INVALID_FILE_DATA'
    | 'PLAYLIST_IMPORT_FAILED_DUE_TO_INVALID_FILE_EXTENSION'
    | 'PLAYLIST_NOT_FOUND'
    | 'SONG_REPARSE_FAILED'
    | 'WHITELISTING_FOLDER_FAILED_DUE_TO_BLACKLISTED_PARENT_FOLDER'
    | 'WHITELISTING_SONG_FAILED_DUE_TO_BLACKLISTED_DIRECTORY'
    | 'UNSUPPORTED_FILE_EXTENSION';

  type MessageCodes =
    | DefaultCodes
    | ErrorCodes
    | 'SONG_LIKE'
    | 'SONG_DISLIKE'
    | 'ARTIST_LIKE'
    | 'ARTIST_DISLIKE'
    | 'PROMPT_CLOSED_BEFORE_INPUT'
    | 'PARSE_FAILED'
    | 'PARSE_SUCCESSFUL'
    | 'SONG_DELETED'
    | 'NO_NETWORK_CONNECTION'
    | 'NETWORK_DISCONNECTED'
    | 'NETWORK_CONNECTED'
    | 'APP_THEME_CHANGE'
    | 'PLAYBACK_FROM_UNKNOWN_SOURCE'
    | 'AUDIO_PARSING_PROCESS_UPDATE'
    | 'SONG_PALETTE_GENERATING_PROCESS_UPDATE'
    | 'GENRE_PALETTE_GENERATING_PROCESS_UPDATE'
    | 'SONG_REMOVE_PROCESS_UPDATE'
    | 'NO_MORE_SONG_PALETTES'
    | 'NO_MORE_GENRE_PALETTES'
    | 'SONG_BLACKLISTED'
    | 'SONG_WHITELISTED'
    | 'FOLDER_BLACKLISTED'
    | 'FOLDER_WHITELISTED'
    | 'PENDING_METADATA_UPDATES_SAVED'
    | 'FOLDER_PARSED_FOR_DIRECTORIES'
    | 'RESET_SUCCESSFUL'
    | 'LYRICS_SAVE_QUEUED'
    | 'LYRICS_SAVED_IN_LRC_FILE'
    | 'PENDING_LYRICS_SAVED'
    | 'LYRICS_TRANSLATION_SUCCESS'
    | 'LYRICS_TRANSLATION_TO_SAME_SOURCE_LANGUAGE'
    | 'LYRICS_CONVERT_SUCCESS'
    | 'RESET_CONVERTED_LYRICS_SUCCESS'
    | 'LASTFM_LOGIN_SUCCESS'
    | 'APPDATA_EXPORT_STARTED'
    | 'APPDATA_IMPORT_STARTED'
    | 'APPDATA_EXPORT_SUCCESS'
    | 'APPDATA_IMPORT_SUCCESS'
    | 'APPDATA_IMPORT_SUCCESS_WITH_PENDING_RESTART'
    | 'PLAYLIST_EXPORT_SUCCESS'
    | 'PLAYLIST_IMPORT_SUCCESS'
    | 'PLAYLIST_RENAME_SUCCESS'
    | 'PLAYLIST_IMPORT_TO_EXISTING_PLAYLIST'
    | 'SONG_REPARSE_SUCCESS'
    | 'ADDED_SONGS_TO_PLAYLIST'
    | 'ARTWORK_SAVED'
    | 'RESYNC_SUCCESSFUL';

  interface MessageToRendererData extends Record<string, unknown> {
    total?: number;
    value?: number;
  }

  type MessageToRendererProps = {
    messageCode: MessageCodes;
    data?: MessageToRendererData;
  };

  interface NotificationPanelData {
    notifications: AppNotification[];
    // notificationsMap: Map<string, AppNotification>;
  }

  type NotificationTypes = 'DEFAULT' | 'WITH_PROGRESS_BAR';

  interface AppNotification {
    duration?: number;
    id: string;
    order?: number;
    content: ReactNode;
    icon?: ReactElement;
    iconName?: string;
    iconClassName?: string;
    buttons?: ButtonProps[];
    type?: NotificationTypes;
    progressBarData?: {
      total: number;
      value: number;
    };
  }

  // ? Navigation History related data

  interface NavigationHistory {
    pageTitle: PageTitles;
    data?: PageData;
    onPageChange?: (changedPageTitle: PageTitles, changedPageData?: PageData) => void;
  }

  interface PageData<R = unknown> extends Record<string, R> {
    scrollTopOffset?: number;
    isLowResponseRequired?: boolean;
    preventScreenSleeping?: boolean;
  }

  interface NavigationHistoryData {
    pageHistoryIndex: number;
    history: NavigationHistory[];
  }

  // ? Navigation History related data

  interface MultipleSelectionData {
    isEnabled: boolean;
    multipleSelections: string[];
    selectionType?: QueueTypes;
  }

  // ? Context menu related related types

  interface ContextMenuAdditionalData {
    title: string;
    artworkPath: string;
    artworkClassName?: string;
    subTitle?: string;
    subTitle2?: string;
    button?: ReactElement;
  }

  interface ContextMenuData {
    isVisible: boolean;
    data?: ContextMenuAdditionalData;
    menuItems: ContextMenuItem[];
    pageX: number;
    pageY: number;
  }

  interface ContextMenuItem {
    label: string;
    class?: string;
    iconName?: string;
    iconClassName?: string;
    isContextMenuItemSeperator?: boolean;
    innerContextMenus?: ContextMenuItem[];
    handlerFunction: null | (() => void);
    isDisabled?: boolean;
  }

  // ? Data sorting related types

  type PageSortTypes =
    | 'sortingStates.songsPage'
    | 'sortingStates.artistsPage'
    | 'sortingStates.playlistsPage'
    | 'sortingStates.albumsPage'
    | 'sortingStates.artistsPage'
    | 'sortingStates.genresPage';

  type SongFilterTypes = 'notSelected' | 'blacklistedSongs' | 'whitelistedSongs';

  type SongSortTypes =
    | 'aToZ'
    | 'zToA'
    | 'addedOrder'
    | 'dateAddedAscending'
    | 'dateAddedDescending'
    | 'releasedYearAscending'
    | 'releasedYearDescending'
    | 'trackNoAscending'
    | 'trackNoDescending'
    | 'artistNameAscending'
    | 'artistNameDescending'
    | 'allTimeMostListened'
    | 'allTimeLeastListened'
    | 'monthlyMostListened'
    | 'monthlyLeastListened'
    | 'artistNameDescending'
    | 'albumNameAscending'
    | 'albumNameDescending'
    | 'blacklistedSongs'
    | 'whitelistedSongs';

  type ArtistFilterTypes = 'notSelected' | 'favorites';

  type ArtistSortTypes =
    | 'aToZ'
    | 'zToA'
    | 'noOfSongsAscending'
    | 'noOfSongsDescending'
    | 'mostLovedAscending'
    | 'mostLovedDescending';

  type PlaylistSortTypes = 'aToZ' | 'zToA' | 'noOfSongsAscending' | 'noOfSongsDescending';

  type TierlistSortTypes = 'aToZ' | 'zToA' | 'dateAddedAscending' | 'dateAddedDescending';

  type AlbumSortTypes = 'aToZ' | 'zToA' | 'noOfSongsAscending' | 'noOfSongsDescending';

  type GenreSortTypes = 'aToZ' | 'zToA' | 'noOfSongsAscending' | 'noOfSongsDescending';

  type FolderSortTypes =
    | 'aToZ'
    | 'zToA'
    | 'noOfSongsAscending'
    | 'noOfSongsDescending'
    | 'blacklistedFolders'
    | 'whitelistedFolders';

  // ? App pages related types

  type DefaultPages =
    | 'Songs'
    | 'Home'
    | 'Artists'
    | 'Albums'
    | 'Playlists'
    | 'Folders'
    | 'Search'
    | 'Genres';

  type PageTitles =
    | DefaultPages
    | 'Settings'
    | 'Lyrics'
    | 'SongInfo'
    | 'ArtistInfo'
    | 'AlbumInfo'
    | 'PlaylistInfo'
    | 'GenreInfo'
    | 'MusicFolderInfo'
    | 'CurrentQueue'
    | 'SongTagsEditor'
    | 'LyricsEditor'
    | 'Tierlists'
    | 'TierlistEditor'
    | 'Stats'
    | 'AllSearchResults';

  type PromiseFunctionReturn = Promise<{ success: boolean; message?: string }>;

  // ? Data updated event related types

  type DataUpdateEventTypes =
    | 'songs'
    | 'songs/newSong'
    | 'songs/updatedSong'
    | 'songs/deletedSong'
    | 'songs/artworks'
    | 'songs/palette'
    | 'songs/listeningData'
    | 'songs/listeningData/fullSongListens'
    | 'songs/listeningData/skips'
    | 'songs/listeningData/listens'
    | 'songs/listeningData/inNoOfPlaylists'
    | 'songs/likes'
    | 'songs/lyrics'
    | 'artists'
    | 'artists/likes'
    | 'artists/newArtist'
    | 'artists/updatedArtist'
    | 'artists/deletedArtist'
    | 'artists/artworks'
    | 'albums'
    | 'albums/newAlbum'
    | 'albums/updatedAlbum'
    | 'albums/deletedAlbum'
    | 'genres'
    | 'genres/newGenre'
    | 'genres/updatedGenre'
    | 'genres/deletedGenre'
    | 'genres/backgroundColor'
    | 'playlists'
    | 'playlists/newPlaylist'
    | 'playlists/updatedPlaylist'
    | 'playlists/deletedPlaylist'
    | 'playlists/history'
    | 'playlists/favorites'
    | 'playlists/rediscover'
    | 'playlists/newSong'
    | 'playlists/deletedSong'
    | 'userData'
    | 'userData/theme'
    | 'userData/currentSong'
    | 'userData/recentlyPlayedSongs'
    | 'userData/volume'
    | 'userData/queue'
    | 'userData/musicFolder'
    | 'userData/windowPosition'
    | 'userData/windowDiamension'
    | 'userData/recentSearches'
    | 'userData/sortingStates'
    | 'settings/preferences'
    | 'blacklist'
    | 'blacklist/songBlacklist'
    | 'blacklist/folderBlacklist'
    | 'tierlists'
    | 'tierlists/newTierlist'
    | 'tierlists/updatedTierlist'
    | 'tierlists/deletedTierlist'
    | 'eloDuels';

  interface DataUpdateEvent {
    dataType: DataUpdateEventTypes;
    eventData: { data?: string[]; message?: string }[];
  }

  interface DetailAvailableEvent<DetailType> extends Event {
    detail: DetailType;
  }

  // ? Logs related types

  interface ErrorLogData {
    os: {
      architecture: string;
      cpu: string;
      platform: NodeJS.Platform;
      os: string;
      totalMemory: number;
    };
    logs: ErrorLog[];
  }

  interface ErrorLog {
    time: string;
    error: {
      name: string;
      message: string;
      stack?: string;
    };
  }

  interface LogsData {
    logs: string[];
  }

  // ? SongTags related types
  type SongTagsAlbumData = {
    title: string;
    albumId?: string;
    noOfSongs?: number;
    artists?: string[];
    artworkPath?: string;
  };

  type SongTagsArtistData = {
    artistId?: string;
    name: string;
    artworkPath?: string;
    onlineArtworkPaths?: OnlineArtistArtworks;
  };

  interface SongTags {
    title: string;
    artists?: SongTagsArtistData[];
    albumArtists?: SongTagsArtistData[];
    album?: SongTagsAlbumData;
    trackNumber?: number;
    releasedYear?: number;
    genres?: { genreId?: string; name: string; artworkPath?: string }[];
    composer?: string;
    synchronizedLyrics?: string;
    unsynchronizedLyrics?: string;
    artworkPath?: string;
    duration: number;
    isLyricsSavePending?: boolean;
    isMetadataSavePending?: boolean;
  }

  interface SongOutsideLibraryData {
    title: string;
    songId: string;
    duration: number;
    path: string;
    artworkPath?: string;
  }

  interface NodeID3Tags extends NodeID3.Tags {
    image: string;
  }

  // ? Release notes related types

  export interface Changelog {
    latestVersion: LatestAppVersion;
    versions: AppVersion[];
  }

  export interface LatestAppVersion {
    version: string;
    phase: string;
    releaseDate: string;
    artwork?: string;
    importantNotes?: string[];
  }

  export interface AppVersion {
    version: string;
    releaseDate: string;
    importantNotes?: string[];
    artwork?: string;
    notes: ChangelogNoteTypes;
  }

  export interface ChangelogNoteTypes {
    new: ChangelogNote[];
    fixed: ChangelogNote[];
    knownIssues: ChangelogNote[];
    developerUpdates: ChangelogNote[];
  }

  export interface ChangelogNote {
    note: string;
  }

  interface UpdateSongDataResult {
    success: boolean;
    reason?: string;
    updatedData?: AudioPlayerData;
  }

  // ? Song metadata results related types

  export type SongMetadataSource = 'LAST_FM' | 'GENIUS' | 'DEEZER' | 'ITUNES' | 'MUSIXMATCH';

  interface SongMetadataResultFromInternet {
    title: string;
    artists: string[];
    album?: string;
    genres?: string[];
    duration?: number;
    artworkPaths: string[];
    releasedYear?: number;
    language?: string;
    lyrics?: string;
    source: SongMetadataSource;
    sourceId: string;
  }

  type ArtAssetKeys =
    | 'nora_logo'
    | 'song_artwork'
    | 'album_artwork'
    | 'favorites_artwork'
    | 'genre_artwork'
    | 'playlist_artwork';
}
