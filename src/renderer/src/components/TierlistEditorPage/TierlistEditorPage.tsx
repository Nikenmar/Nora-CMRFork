import {
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react';
import { useTranslation } from 'react-i18next';
import { ReactSortable } from 'react-sortablejs';
import { useStore } from '@tanstack/react-store';

import { store } from '@renderer/store';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';

import MainContainer from '../MainContainer';
import Button from '../Button';
import TierItemCard from './TierItemCard';
import { getTierColor, TIER_LABEL_TEXT_COLOR } from './tierColors';

const EditTierlistSourcesPrompt = lazy(() => import('./EditTierlistSourcesPrompt'));
const ConfirmDeleteTierlistPrompt = lazy(
  () => import('../TierlistsPage/ConfirmDeleteTierlistPrompt')
);
const DeleteSongsFromSystemConfrimPrompt = lazy(
  () => import('../SongsPage/DeleteSongsFromSystemConfrimPrompt')
);

const POOL_ID = 'pool';

// Local id generator — only needs to be unique within a single tierlist, and
// avoids any secure-context dependency that crypto.randomUUID would impose.
const newTierId = () => `tier_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

type Item = { id: string };
type Board = { pool: Item[]; tiers: Record<string, Item[]> };

const sameIds = (a: Item[], b: Item[]) =>
  a.length === b.length && a.every((x, i) => x.id === b[i].id);

/**
 * Initial seed of the drag board from the PERSISTED placements (`tier.items`).
 * Run once, only after the song map is ready, so saved placements are never lost
 * to a premature reconcile against an empty song map.
 */
const seedBoard = (
  tierlist: SavableTierlist,
  liveSongIds: string[],
  songMap: Record<string, SongData>,
  remap: Record<string, string> = {}
): Board => {
  const isVisible = (id: string) => !!songMap[id];
  const placed = new Set<string>();
  const tiers: Record<string, Item[]> = {};

  for (const tier of tierlist.tiers) {
    const seen = new Set<string>();
    // Map each placed song to its canonical (folder-authoritative) id first, so a
    // ranking made via a playlist migrates onto the folder's duplicate cleanly.
    const ids = tier.items
      .map((id) => remap[id] ?? id)
      .filter((id) => {
        if (!isVisible(id) || seen.has(id) || placed.has(id)) return false;
        seen.add(id);
        placed.add(id);
        return true;
      });
    tiers[tier.tierId] = ids.map((id) => ({ id }));
  }

  const pool = liveSongIds.filter((id) => isVisible(id) && !placed.has(id)).map((id) => ({ id }));

  return { pool, tiers };
};

/**
 * Incremental update once seeded: the BOARD is the source of truth for ordering.
 * We only drop songs that left the live pool, append newly added songs, add new
 * tiers and remove deleted ones — never resetting placements from `tier.items`.
 */
const incrementalBoard = (
  prev: Board,
  tierlist: SavableTierlist,
  liveSongIds: string[],
  songMap: Record<string, SongData>,
  remap: Record<string, string> = {}
): Board => {
  const isVisible = (id: string) => !!songMap[id];
  const liveVisible = new Set(liveSongIds.filter(isVisible));
  const placed = new Set<string>();
  const tiers: Record<string, Item[]> = {};

  for (const tier of tierlist.tiers) {
    const seen = new Set<string>();
    const prevItems = (prev.tiers[tier.tierId] ?? [])
      .map((i) => remap[i.id] ?? i.id) // a newly-added folder may dup a placed song
      .filter((id) => {
        if (!liveVisible.has(id) || placed.has(id) || seen.has(id)) return false;
        seen.add(id);
        placed.add(id);
        return true;
      });
    tiers[tier.tierId] = prevItems.map((id) => ({ id }));
  }

  const prevPool = prev.pool
    .map((i) => i.id)
    .filter((id) => liveVisible.has(id) && !placed.has(id));
  const prevPoolSet = new Set(prevPool);
  const appended = liveSongIds.filter(
    (id) => isVisible(id) && !placed.has(id) && !prevPoolSet.has(id)
  );
  const pool = [...prevPool, ...appended].map((id) => ({ id }));

  return { pool, tiers };
};

const TierlistEditorPage = () => {
  const currentlyActivePage = useStore(store, (state) => state.currentlyActivePage);
  const tierlistId = currentlyActivePage?.data?.tierlistId as string | undefined;

  const {
    changeCurrentActivePage,
    changePromptMenuData,
    addNewNotifications,
    playSong,
    createQueue,
    toggleSongPlayback,
    updateContextMenuData
  } = useContext(AppUpdateContext);
  const currentSongId = useStore(store, (state) => state.currentSongData.songId);
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const { t } = useTranslation();

  const [tierlist, setTierlist] = useState<SavableTierlist | null>(null);
  const [songMap, setSongMap] = useState<Record<string, SongData>>({});
  const [liveSongIds, setLiveSongIds] = useState<string[]>([]);
  // Dedup remap: a duplicate song's id -> the canonical (folder-authoritative) id.
  const [remap, setRemap] = useState<Record<string, string>>({});
  const [board, setBoard] = useState<Board>({ pool: [], tiers: {} });
  // Cached 200px thumbnails per songId (cheap to decode; full-res would lag).
  const [thumbMap, setThumbMap] = useState<Record<string, string>>({});
  // True once the source-playlist fetch for this tierlist has actually settled,
  // so the board is only seeded against real (not yet-loading) song data.
  const [poolLoaded, setPoolLoaded] = useState(false);

  const exportRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const placementTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tierlistRef = useRef<SavableTierlist | null>(null);
  const boardRef = useRef<Board>(board);
  // Whether the board has been seeded from disk for the current tierlist. Until
  // it is, the reconcile pass must NOT touch placements (avoids the empty-songMap
  // race that used to drop saved placements back into the pool).
  const seededRef = useRef(false);

  // ? Smooth custom auto-scroll while dragging (SortableJS's built-in scroll is
  // ? choppy). A rAF loop scrolls the editor container with speed proportional
  // ? to how close the pointer is to the top/bottom edge.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pointerYRef = useRef(0);
  const draggingRef = useRef(false);
  const rafRef = useRef<number | undefined>(undefined);

  const autoScrollTick = useCallback(() => {
    if (!draggingRef.current) return;
    const el = scrollContainerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const EDGE = 110; // px from edge where scrolling kicks in
      const MAX_SPEED = 26; // px per frame at the very edge
      const y = pointerYRef.current;
      let delta = 0;
      if (y < rect.top + EDGE) delta = -MAX_SPEED * Math.min(1, (rect.top + EDGE - y) / EDGE);
      else if (y > rect.bottom - EDGE)
        delta = MAX_SPEED * Math.min(1, (y - (rect.bottom - EDGE)) / EDGE);
      if (delta !== 0) el.scrollTop += delta;
    }
    rafRef.current = requestAnimationFrame(autoScrollTick);
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    pointerYRef.current = e.clientY;
  }, []);

  const handleDragStart = useCallback(() => {
    draggingRef.current = true;
    document.addEventListener('pointermove', onPointerMove);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(autoScrollTick);
  }, [autoScrollTick, onPointerMove]);

  const handleDragEnd = useCallback(() => {
    draggingRef.current = false;
    document.removeEventListener('pointermove', onPointerMove);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, [onPointerMove]);

  useEffect(() => () => handleDragEnd(), [handleDragEnd]);

  useEffect(() => {
    tierlistRef.current = tierlist;
  }, [tierlist]);

  // Keep boardRef mirroring the committed board (read synchronously by the drag
  // handler and the save flush). boardRef must never be written from inside a
  // setBoard updater — StrictMode double-invokes updaters, which corrupts refs.
  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  // Synced ref so the (memo-stable) context-menu handler can read the latest
  // song data without changing identity and re-rendering every card.
  const songMapRef = useRef(songMap);
  useEffect(() => {
    songMapRef.current = songMap;
  }, [songMap]);

  const openCardMenu = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>, songId: string) => {
      const song = songMapRef.current[songId];
      const artists = song?.artists || [];
      const tl = tierlistRef.current;

      // Is this track pulled in by a source FOLDER? If so it can't simply be
      // "removed" (the folder re-adds it) — the only way out is deleting the file.
      const inFolder = !!(
        song?.path && (tl?.sourceFolderPaths || []).some((fp) => fp && song.path.includes(fp))
      );

      const removeItem: ContextMenuItem = inFolder
        ? {
            label: t('tierlistsPage.deleteFromSystem'),
            iconName: 'delete_forever',
            class: '!text-font-color-crimson',
            handlerFunction: () =>
              changePromptMenuData(true, <DeleteSongsFromSystemConfrimPrompt songIds={[songId]} />)
          }
        : {
            label: t('tierlistsPage.removeFromTierlist'),
            iconName: 'playlist_remove',
            handlerFunction: () => {
              const ids = tl?.sourcePlaylistIds || [];
              Promise.all(
                ids.map((pid) => window.api.playlistsData.removeSongFromPlaylist(pid, songId))
              ).catch((err) => console.error(err));
            }
          };

      const goToArtist = (name: string, id: string) =>
        changeCurrentActivePage('ArtistInfo', { artistName: name, artistId: id });
      const artistItem: ContextMenuItem | null =
        artists.length === 1
          ? {
              label: t('tierlistsPage.goToArtist'),
              iconName: 'person',
              handlerFunction: () => goToArtist(artists[0].name, artists[0].artistId)
            }
          : artists.length > 1
            ? {
                label: t('tierlistsPage.goToArtist'),
                iconName: 'person',
                handlerFunction: null,
                innerContextMenus: artists.map((a) => ({
                  label: a.name,
                  handlerFunction: () => goToArtist(a.name, a.artistId)
                }))
              }
            : null;

      const items: ContextMenuItem[] = [
        {
          label: t('common.play'),
          iconName: 'play_arrow',
          handlerFunction: () => playSong(songId)
        },
        { label: 'Hr', isContextMenuItemSeperator: true, handlerFunction: () => true },
        {
          label: t('common.info'),
          iconName: 'info',
          handlerFunction: () => changeCurrentActivePage('SongInfo', { songId })
        },
        ...(artistItem ? [artistItem] : []),
        { label: 'Hr', isContextMenuItemSeperator: true, handlerFunction: () => true },
        removeItem
      ];
      updateContextMenuData(true, items, e.pageX, e.pageY);
    },
    [playSong, changeCurrentActivePage, changePromptMenuData, updateContextMenuData, t]
  );

  // ? Persist (debounced) — single source of truth for writing to disk.
  const persist = useCallback((updated: SavableTierlist) => {
    tierlistRef.current = updated;
    setTierlist(updated);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      window.api.tierlistsData.saveTierlist(updated).catch((err) => console.error(err));
    }, 400);
  }, []);

  // ? Load the tierlist itself (and reset the seed for a fresh board).
  useEffect(() => {
    if (!tierlistId) return;
    seededRef.current = false;
    setPoolLoaded(false);
    boardRef.current = { pool: [], tiers: {} };
    setBoard({ pool: [], tiers: {} });
    window.api.tierlistsData
      .getTierlistData([tierlistId])
      .then((res) => {
        const tl = Array.isArray(res) && res.length > 0 ? res[0] : null;
        tierlistRef.current = tl;
        setTierlist(tl);
        return undefined;
      })
      .catch((err) => console.error(err));
  }, [tierlistId]);

  // ? Derive the live image pool from the source playlists AND folders, live.
  const sourceKey = [
    ...(tierlist?.sourcePlaylistIds || []),
    '|F|',
    ...(tierlist?.sourceFolderPaths || [])
  ].join(',');
  const fetchPoolSource = useCallback(() => {
    const tl = tierlistRef.current;
    // Critical: do nothing until the tierlist itself has loaded.
    if (!tl) return;
    const playlistIds = tl.sourcePlaylistIds || [];
    const folderPaths = tl.sourceFolderPaths || [];
    if (playlistIds.length === 0 && folderPaths.length === 0) {
      setLiveSongIds([]);
      setSongMap({});
      setRemap({});
      setPoolLoaded(true);
      return;
    }

    let orderedIds: string[] = [];
    Promise.all([
      playlistIds.length
        ? window.api.playlistsData.getPlaylistData(playlistIds)
        : Promise.resolve([] as Playlist[]),
      folderPaths.length
        ? window.api.folderData.getFolderData(folderPaths)
        : Promise.resolve([] as MusicFolder[])
    ])
      .then(([playlists, folders]) => {
        // Folders are the authoritative source: collect their songs first so a
        // duplicate keeps the folder's id. (A folder's songIds already include
        // sub-folders, matched by path.)
        const seen = new Set<string>();
        const ordered: string[] = [];
        const add = (id: string) => {
          if (!seen.has(id)) {
            seen.add(id);
            ordered.push(id);
          }
        };
        for (const folder of folders || []) for (const id of folder.songIds || []) add(id);
        for (const playlist of playlists || []) for (const id of playlist.songs) add(id);
        orderedIds = ordered;
        return ordered.length
          ? window.api.audioLibraryControls.getSongInfo(
              ordered,
              undefined,
              undefined,
              undefined,
              true
            )
          : [];
      })
      .then((songs) => {
        const ordered = orderedIds;
        const map: Record<string, SongData> = {};
        for (const song of songs || []) map[song.songId] = song;

        // ----- smart dedup by track key; folder-sourced id wins (it comes first) -----
        const norm = (s?: string) => (s || '').normalize('NFC').trim().toLowerCase();
        const keyOf = (s?: SongData) =>
          s
            ? `${norm(s.title)}|${(s.artists || [])
                .map((a) => norm(a.name))
                .sort()
                .join(',')}`
            : '';
        const canonicalByKey: Record<string, string> = {};
        const remapObj: Record<string, string> = {};
        const canonicalIds: string[] = [];
        for (const id of ordered) {
          const song = map[id];
          const key = keyOf(song);
          if (key && canonicalByKey[key]) {
            remapObj[id] = canonicalByKey[key]; // duplicate -> keep the first (folder) id
          } else {
            if (key) canonicalByKey[key] = id;
            canonicalIds.push(id);
          }
        }

        setSongMap(map);
        setRemap(remapObj);
        setLiveSongIds(canonicalIds);
        setPoolLoaded(true);
      })
      .catch((err) => console.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  useEffect(() => fetchPoolSource(), [fetchPoolSource]);

  // ? Generate/cache the cheap 200px thumbnails for the loaded songs.
  useEffect(() => {
    const ids = Object.keys(songMap);
    if (ids.length === 0) return setThumbMap({});
    window.api.tierlistsData
      .getTierlistArtworks(ids)
      .then((res) => setThumbMap(res || {}))
      .catch((err) => console.error(err));
    return undefined;
  }, [songMap]);

  // ? Keep the pool in sync with playlist edits instantly.
  useEffect(() => {
    const manageUpdates = (e: Event) => {
      if (!('detail' in e)) return;
      const dataEvents = (e as DetailAvailableEvent<DataUpdateEvent[]>).detail;
      for (const event of dataEvents) {
        // A source playlist changed (track added/removed) or a song was deleted
        // from the library entirely — re-derive the live pool either way.
        if (
          event.dataType.startsWith('playlists') ||
          event.dataType === 'songs/deletedSong' ||
          event.dataType === 'songs'
        )
          fetchPoolSource();
      }
    };
    document.addEventListener('app/dataUpdates', manageUpdates);
    return () => document.removeEventListener('app/dataUpdates', manageUpdates);
  }, [fetchPoolSource]);

  // ? Reconcile the drag board whenever the tier structure or the live pool
  // ? changes (NOT on every placement commit — keyed on tier ids only).
  const structureKey = (tierlist?.tiers ?? []).map((tier) => tier.tierId).join('|');
  useEffect(() => {
    const tl = tierlistRef.current;
    if (!tl) return;

    if (!seededRef.current) {
      // Don't seed until the source-playlist fetch has settled — seeding against
      // not-yet-loaded song data would wipe saved placements.
      if (!poolLoaded) return;
      // Side effects live in the effect body (NOT in a setBoard updater) so the
      // StrictMode double-invoke of updaters can't corrupt them. Seed is applied
      // as a plain value, which React does not double-invoke.
      seededRef.current = true;
      setBoard(seedBoard(tl, liveSongIds, songMap, remap));
    } else {
      // Pure updater (no ref mutation, stable branch) — safe under StrictMode.
      setBoard((prev) => incrementalBoard(prev, tl, liveSongIds, songMap, remap));
    }
  }, [structureKey, liveSongIds, songMap, poolLoaded, remap]);

  // ? Flush any pending debounced save on unmount so quickly navigating away
  // ? right after a drag never loses the placement.
  useEffect(() => {
    return () => {
      // Never write before the board has been seeded from disk — otherwise an
      // unmount (incl. React StrictMode's dev double-mount) would persist the
      // still-empty board over the saved placements and wipe them.
      if (!seededRef.current) return;
      const tl = tierlistRef.current;
      if (placementTimerRef.current) {
        clearTimeout(placementTimerRef.current);
        if (tl) {
          const tiers = tl.tiers.map((tier) => ({
            ...tier,
            items: (boardRef.current.tiers[tier.tierId] ?? []).map((i) => i.id)
          }));
          window.api.tierlistsData
            .saveTierlist({ ...tl, tiers })
            .catch((err) => console.error(err));
        }
      } else if (saveTimerRef.current && tl) {
        clearTimeout(saveTimerRef.current);
        window.api.tierlistsData.saveTierlist(tl).catch((err) => console.error(err));
      }
    };
  }, []);

  // ? Persist placements (debounced) from the latest board + tier structure.
  const schedulePlacementPersist = useCallback(() => {
    // Guard: never persist before the board is seeded (avoids writing an empty
    // board over saved placements).
    if (!seededRef.current) return;
    if (placementTimerRef.current) clearTimeout(placementTimerRef.current);
    placementTimerRef.current = setTimeout(() => {
      const tl = tierlistRef.current;
      if (!tl) return;
      const tiers = tl.tiers.map((tier) => ({
        ...tier,
        items: (boardRef.current.tiers[tier.tierId] ?? []).map((i) => i.id)
      }));
      persist({ ...tl, tiers });
    }, 400);
  }, [persist]);

  // ? Persist whenever the board's placements diverge from what's on disk. This
  // ? covers user drags AND auto-pruning: when a track is removed from a source
  // ? playlist (or deleted), the reconcile drops it from the board, and this
  // ? writes the cleaned placements so the saved data / "ranked" count stay correct.
  useEffect(() => {
    if (!seededRef.current) return;
    const tl = tierlistRef.current;
    if (!tl) return;
    const diverged = tl.tiers.some((tier) => {
      const a = tier.items;
      const b = (board.tiers[tier.tierId] ?? []).map((i) => i.id);
      return a.length !== b.length || a.some((id, i) => id !== b[i]);
    });
    if (diverged) schedulePlacementPersist();
  }, [board, schedulePlacementPersist]);

  // ? SortableJS list-change handler for one droppable (a tier or the pool).
  const handleSetList = useCallback(
    (listId: string) => (newList: Item[]) => {
      const prev = boardRef.current;
      const current = listId === POOL_ID ? prev.pool : (prev.tiers[listId] ?? []);
      if (sameIds(current, newList)) return;
      const next: Board =
        listId === POOL_ID
          ? { ...prev, pool: newList }
          : { ...prev, tiers: { ...prev.tiers, [listId]: newList } };
      boardRef.current = next;
      setBoard(next);
    },
    []
  );

  const addTier = useCallback(() => {
    const tl = tierlistRef.current;
    if (!tl) return;
    persist({ ...tl, tiers: [...tl.tiers, { tierId: newTierId(), name: '', items: [] }] });
  }, [persist]);

  const removeTier = useCallback(
    (tierId: string) => {
      const tl = tierlistRef.current;
      if (!tl) return;
      persist({ ...tl, tiers: tl.tiers.filter((tier) => tier.tierId !== tierId) });
    },
    [persist]
  );

  const renameTier = useCallback(
    (tierId: string, name: string) => {
      const tl = tierlistRef.current;
      if (!tl) return;
      persist({
        ...tl,
        tiers: tl.tiers.map((tier) => (tier.tierId === tierId ? { ...tier, name } : tier))
      });
    },
    [persist]
  );

  const toggleLabelMode = useCallback(() => {
    const tl = tierlistRef.current;
    if (!tl) return;
    persist({ ...tl, labelMode: tl.labelMode === 'track' ? 'artistAndTrack' : 'track' });
  }, [persist]);

  const toggleShowPlayButton = useCallback(() => {
    const tl = tierlistRef.current;
    if (!tl) return;
    persist({ ...tl, showPlayButton: tl.showPlayButton === false });
  }, [persist]);

  const toggleInfluencesShuffle = useCallback(() => {
    const tl = tierlistRef.current;
    if (!tl) return;
    persist({ ...tl, influencesShuffle: !tl.influencesShuffle });
  }, [persist]);

  // Play a track FROM the tierlist: build a queue from the whole tierlist (tiers
  // top-to-bottom, then the pool) so next/prev/shuffle/Smart-Shuffle all operate
  // within it — the tierlist acts like a hidden playlist. Clicking the currently
  // playing track just toggles play/pause.
  const handlePlay = useCallback(
    (songId: string) => {
      if (songId === store.state.currentSongData.songId) {
        toggleSongPlayback();
        return;
      }
      const tl = tierlistRef.current;
      const b = boardRef.current;
      const queueIds = [
        ...(tl?.tiers || []).flatMap((tier) => (b.tiers[tier.tierId] ?? []).map((i) => i.id)),
        ...b.pool.map((i) => i.id)
      ];
      // Omit isShuffleQueue so it respects the current shuffle / Smart Shuffle state.
      createQueue(queueIds, 'songs', undefined, undefined, false);
      playSong(songId, true);
    },
    [createQueue, playSong, toggleSongPlayback]
  );

  const exportAsImage = useCallback(async () => {
    if (!exportRef.current) return;
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(exportRef.current, { cacheBust: true, pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `${tierlistRef.current?.name || 'tierlist'}.png`;
      link.href = dataUrl;
      link.click();
      addNewNotifications([
        { id: 'tierlistExported', duration: 5000, content: t('tierlistsPage.exportSuccess') }
      ]);
    } catch (err) {
      console.error(err);
      addNewNotifications([
        { id: 'tierlistExportFailed', duration: 5000, content: t('tierlistsPage.exportError') }
      ]);
    }
  }, [addNewNotifications, t]);

  const poolCount = useMemo(() => board.pool.length, [board.pool]);

  if (!tierlist)
    return (
      <MainContainer className="tierlist-editor !h-full">
        <></>
      </MainContainer>
    );

  const labelModeText =
    tierlist.labelMode === 'artistAndTrack'
      ? t('tierlistsPage.labelModeArtistAndTrack')
      : t('tierlistsPage.labelModeTrack');
  const showPlayButton = tierlist.showPlayButton !== false;
  const influencesShuffle = !!tierlist.influencesShuffle;

  return (
    <MainContainer className="tierlist-editor flex !h-full flex-col overflow-hidden !pb-0 text-font-color-black dark:text-font-color-white">
      <>
        <div className="header mb-4 flex items-center justify-between pr-4">
          <div className="flex items-center gap-2">
            <Button
              iconName="arrow_back"
              className="!mr-0 !rounded-full !p-2"
              tooltipLabel={t('tierlistsPage.title')}
              clickHandler={() => changeCurrentActivePage('Tierlists')}
            />
            <span className="truncate text-3xl font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
              {tierlist.name}
            </span>
          </div>
          <div className="controls flex flex-wrap items-center gap-1">
            <Button
              label={`${t('tierlistsPage.labelMode')}: ${labelModeText}`}
              iconName="badge"
              className="text-sm"
              clickHandler={toggleLabelMode}
            />
            <Button
              label={t(
                showPlayButton ? 'tierlistsPage.hidePlayButton' : 'tierlistsPage.showPlayButton'
              )}
              iconName={showPlayButton ? 'play_disabled' : 'play_arrow'}
              className="text-sm"
              clickHandler={toggleShowPlayButton}
            />
            <Button
              label={t(
                influencesShuffle
                  ? 'tierlistsPage.influencesShuffleOn'
                  : 'tierlistsPage.influencesShuffleOff'
              )}
              iconName="auto_fix"
              className={`text-sm ${influencesShuffle ? '!text-font-color-highlight dark:!text-dark-font-color-highlight' : ''}`}
              clickHandler={toggleInfluencesShuffle}
            />
            <Button
              label={t('tierlistsPage.editSources')}
              iconName="queue_music"
              className="text-sm"
              clickHandler={() =>
                changePromptMenuData(
                  true,
                  <EditTierlistSourcesPrompt tierlist={tierlist} onSaved={persist} />
                )
              }
            />
            <Button
              label={t('tierlistsPage.addTier')}
              iconName="add"
              className="text-sm"
              clickHandler={addTier}
            />
            <Button
              label={t('tierlistsPage.exportImage')}
              iconName="photo_camera"
              className="text-sm"
              clickHandler={exportAsImage}
            />
            <Button
              iconName="delete"
              className="!mr-0 !rounded-full !p-2"
              tooltipLabel={t('tierlistsPage.deleteTierlist')}
              clickHandler={() =>
                changePromptMenuData(true, <ConfirmDeleteTierlistPrompt tierlist={tierlist} />)
              }
            />
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="editor-scroll flex h-full flex-col gap-4 overflow-auto pb-6 pr-2"
        >
          {/* The tier board (this is what gets exported to PNG) */}
          <div
            ref={exportRef}
            className="tiers flex flex-col gap-[3px] rounded-lg bg-background-color-2 p-[3px] dark:bg-dark-background-color-2"
          >
            {tierlist.tiers.map((tier, tierIndex) => (
              <div
                key={tier.tierId}
                className="tier grid min-h-[96px] grid-cols-[90px_minmax(0,1fr)] overflow-hidden rounded-md bg-background-color-1 dark:bg-dark-background-color-1"
              >
                <div
                  className="tier-label group/label relative flex flex-col items-center justify-center px-1.5 text-center"
                  style={{
                    backgroundColor: getTierColor(tierIndex),
                    color: TIER_LABEL_TEXT_COLOR
                  }}
                >
                  <input
                    value={tier.name}
                    onChange={(e) => renameTier(tier.tierId, e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="w-full border-none bg-transparent text-center text-lg font-black uppercase tracking-[0.2em] text-inherit outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeTier(tier.tierId)}
                    title={t('tierlistsPage.removeTier')}
                    className="invisible absolute right-0.5 top-0.5 opacity-70 hover:opacity-100 group-hover/label:visible"
                  >
                    <span className="material-icons-round-outlined text-[16px]">close</span>
                  </button>
                </div>
                <ReactSortable
                  group="tierlist"
                  animation={140}
                  swapThreshold={0.5}
                  dragoverBubble={false}
                  ghostClass="tierlist-ghost"
                  filter=".tier-play-btn"
                  preventOnFilter={false}
                  forceFallback
                  fallbackOnBody
                  fallbackTolerance={5}
                  scroll={false}
                  onStart={handleDragStart}
                  onEnd={handleDragEnd}
                  list={board.tiers[tier.tierId] ?? []}
                  setList={handleSetList(tier.tierId)}
                  className="tier-dropzone flex min-h-[96px] flex-wrap content-start items-start gap-[7px] bg-background-color-1 p-[7px] dark:bg-dark-background-color-1"
                >
                  {(board.tiers[tier.tierId] ?? []).map((item) => (
                    <TierItemCard
                      key={item.id}
                      song={songMap[item.id]}
                      thumbSrc={thumbMap[item.id]}
                      labelMode={tierlist.labelMode}
                      showPlayButton={showPlayButton}
                      playState={
                        item.id === currentSongId
                          ? isCurrentSongPlaying
                            ? 'playing'
                            : 'paused'
                          : 'none'
                      }
                      onPlay={handlePlay}
                      onCardContextMenu={openCardMenu}
                    />
                  ))}
                </ReactSortable>
              </div>
            ))}
          </div>

          {/* The live image pool */}
          <div className="pool flex flex-col">
            <div className="pool-header mb-2 flex items-center gap-3 text-lg font-medium">
              <span>{t('tierlistsPage.pool')}</span>
              <span className="text-xs opacity-60">
                {t('tierlistsPage.poolCount', { count: poolCount })}
              </span>
            </div>
            <ReactSortable
              group="tierlist"
              animation={140}
              swapThreshold={0.5}
              dragoverBubble={false}
              ghostClass="tierlist-ghost"
              filter=".tier-play-btn"
              preventOnFilter={false}
              forceFallback
              fallbackOnBody
              fallbackTolerance={5}
              scroll={false}
              onStart={handleDragStart}
              onEnd={handleDragEnd}
              list={board.pool}
              setList={handleSetList(POOL_ID)}
              className="pool-dropzone flex min-h-[110px] flex-wrap content-start items-start justify-center gap-[7px] rounded-lg border border-dashed border-black/15 bg-background-color-2/60 p-[7px] dark:border-white/15 dark:bg-dark-background-color-2/40"
            >
              {board.pool.map((item) => (
                <TierItemCard
                  key={item.id}
                  song={songMap[item.id]}
                  thumbSrc={thumbMap[item.id]}
                  labelMode={tierlist.labelMode}
                  showPlayButton={showPlayButton}
                  playState={
                    item.id === currentSongId
                      ? isCurrentSongPlaying
                        ? 'playing'
                        : 'paused'
                      : 'none'
                  }
                  onPlay={handlePlay}
                  onCardContextMenu={openCardMenu}
                />
              ))}
            </ReactSortable>
          </div>
        </div>
      </>
    </MainContainer>
  );
};

export default TierlistEditorPage;
