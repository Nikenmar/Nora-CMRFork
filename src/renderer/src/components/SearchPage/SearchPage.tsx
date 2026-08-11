/* eslint-disable jsx-a11y/no-autofocus */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import useResizeObserver from '../../hooks/useResizeObserver';
import debounce from '../../utils/debounce';
import i18n from '../../i18n';

import SearchResultsFilter, { type SearchResultFilter } from './SearchResultsFilter';
import MainContainer from '../MainContainer';
import GenreSearchResultsContainer from './Result_Containers/GenreSearchResultsContainer';
import PlaylistSearchResultsContainer from './Result_Containers/PlaylistSearchResultsContainer';
import AlbumSearchResultsContainer from './Result_Containers/AlbumSearchResultsContainer';
import SongSearchResultsContainer from './Result_Containers/SongSearchResultsContainer';
import MostRelevantSearchResultsContainer from './Result_Containers/MostRelevantSearchResultsContainer';
import ArtistsSearchResultsContainer from './Result_Containers/ArtistsSearchResultsContainer';
import NoSearchResultsContainer from './NoSearchResultsContainer';
import SearchStartPlaceholder from './SearchStartPlaceholder';
import { useStore } from '@tanstack/react-store';
import { store } from '@renderer/store';

const searchFilter: SearchResultFilter[] = [
  { label: i18n.t('searchPage.allFilter'), icon: 'select_all', value: 'All' },
  { label: i18n.t('common.song_other'), icon: 'music_note', value: 'Songs' },
  { label: i18n.t('common.album_other'), icon: 'people', value: 'Albums' },
  { label: i18n.t('common.artist_other'), icon: 'album', value: 'Artists' },
  {
    label: i18n.t('common.playlist_other'),
    icon: 'track_changes',
    value: 'Playlists'
  },
  { label: i18n.t('common.genre_other'), icon: 'queue_music', value: 'Genres' }
];
const ARTIST_WIDTH = 175;
const ALBUM_WIDTH = 210;
const PLAYLIST_WIDTH = 160;
const GENRE_WIDTH = 300;

const SearchPage = () => {
  const currentlyActivePage = useStore(store, (state) => state.currentlyActivePage);

  const { updateCurrentlyActivePageData } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const [searchInput, setSearchInput] = useState(
    (currentlyActivePage?.data?.keyword as string) || ''
  );

  const searchContainerRef = useRef(null);
  const { width } = useResizeObserver(searchContainerRef);

  const [searchResults, setSearchResults] = useState({
    albums: [],
    artists: [],
    songs: [],
    playlists: [],
    genres: [],
    availableResults: []
  } as SearchResult);
  const [activeFilter, setActiveFilter] = useState('All' as SearchFilters);

  const { noOfArtists, noOfPlaylists, noOfAlbums, noOfGenres } = useMemo(() => {
    return {
      noOfPlaylists: Math.floor(width / PLAYLIST_WIDTH) || 4,
      noOfArtists: Math.floor(width / ARTIST_WIDTH) || 5,
      noOfAlbums: Math.floor(width / ALBUM_WIDTH) || 4,
      noOfGenres: Math.floor(width / GENRE_WIDTH) || 3
    };
  }, [width]);

  const changeActiveFilter = useCallback(
    (filterType: SearchFilters) => setActiveFilter(filterType),
    []
  );

  const filters = searchFilter.map((filter) => {
    return (
      <SearchResultsFilter
        key={filter.value}
        label={filter.label}
        icon={filter.icon}
        value={filter.value}
        isCurrentActiveFilter={filter.value === activeFilter}
        changeActiveFilter={changeActiveFilter}
      />
    );
  });

  const timeOutIdRef = useRef(undefined as NodeJS.Timeout | undefined);
  const fetchSearchResults = useCallback(() => {
    if (searchInput.trim() !== '') {
      if (timeOutIdRef.current) clearTimeout(timeOutIdRef.current);
      timeOutIdRef.current = setTimeout(
        () =>
          window.api.search.search(activeFilter, searchInput, true).then((results) => {
            return setSearchResults(results);
          }),
        250
      );
    } else
      setSearchResults({
        albums: [],
        artists: [],
        songs: [],
        playlists: [],
        genres: [],
        availableResults: []
      });
  }, [activeFilter, searchInput, timeOutIdRef]);

  useEffect(() => {
    fetchSearchResults();
    const manageSearchResultsUpdatesInSearchPage = (e: Event) => {
      if ('detail' in e) {
        const dataEvents = (e as DetailAvailableEvent<DataUpdateEvent[]>).detail;
        for (let i = 0; i < dataEvents.length; i += 1) {
          const event = dataEvents[i];
          if (
            event.dataType === 'songs' ||
            event.dataType === 'artists' ||
            event.dataType === 'albums' ||
            event.dataType === 'playlists/newPlaylist' ||
            event.dataType === 'playlists/deletedPlaylist' ||
            event.dataType === 'genres/newGenre' ||
            event.dataType === 'genres/deletedGenre' ||
            event.dataType === 'blacklist/songBlacklist'
          )
            fetchSearchResults();
        }
      }
    };
    document.addEventListener('app/dataUpdates', manageSearchResultsUpdatesInSearchPage);
    return () => {
      document.removeEventListener('app/dataUpdates', manageSearchResultsUpdatesInSearchPage);
    };
  }, [fetchSearchResults]);

  const updateSearchInput = useCallback((input: string) => setSearchInput(input), []);

  return (
    <MainContainer className="!h-full !pb-0 [scrollbar-gutter:stable]" ref={searchContainerRef}>
      <div className="search-controls-container">
        <div className="search-input-container appear-from-bottom mb-4 flex items-center">
          {/*
            The bar used to take its height from the padding of the
            predictive-search toggle that sat inside it, so removing that button
            shrank the field. The height is stated here instead, and everything
            else about the bar is exactly as it was.
          */}
          <div className="search-bar-container flex h-[3.125rem] w-1/2 min-w-[25rem] max-w-xl items-center rounded-3xl bg-background-color-2 px-4 dark:bg-dark-background-color-2">
            <span
              className="material-icons-round-outlined mr-3 flex-shrink-0 text-xl !leading-none text-font-color-highlight dark:text-dark-font-color-highlight"
              aria-hidden="true"
            >
              search
            </span>
            {/* SEARCH INPUT */}
            <input
              type="search"
              name="search"
              id="searchBar"
              /* The webkit cancel button is unstyled browser chrome — a grey
                 cross that ignores the theme. Ours sits in its place. */
              className="h-full w-full min-w-0 border-2 border-[transparent] bg-[transparent] text-font-color-black outline-none placeholder:text-font-color-highlight dark:text-font-color-white dark:placeholder:text-dark-font-color-highlight [&::-webkit-search-cancel-button]:hidden"
              aria-label="Search"
              placeholder={t('searchPage.searchForAnything')}
              value={searchInput}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                debounce(
                  () =>
                    updateCurrentlyActivePageData((currentData) => ({
                      ...currentData,
                      keyword: e.target.value
                    })),
                  500
                );
                setSearchInput(e.target.value);
              }}
              onKeyDown={(e) => e.stopPropagation()}
              autoFocus
            />
            {searchInput.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  updateSearchInput('');
                  updateCurrentlyActivePageData((currentData) => ({
                    ...currentData,
                    keyword: ''
                  }));
                }}
                aria-label={t('searchPage.clearSearch')}
                title={t('searchPage.clearSearch')}
                className="ml-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-font-color-highlight opacity-60 transition-[background-color,opacity] duration-200 hover:bg-background-color-3 hover:opacity-100 motion-reduce:transition-none dark:text-dark-font-color-highlight dark:hover:bg-dark-background-color-3/15"
              >
                <span className="material-icons-round text-base !leading-none">close</span>
              </button>
            )}
          </div>
          <span
            className="material-icons-round-outlined ml-4 flex-shrink-0 cursor-help text-2xl text-font-color-highlight dark:text-dark-font-color-highlight"
            title={t('searchPage.separateKeywords')}
          >
            help
          </span>
        </div>
        {/* SEARCH FILTERS */}
        <div className="search-filters-container mb-6">
          <ul className="flex items-center">{filters}</ul>
        </div>
      </div>
      <div className="search-results-container relative !h-full">
        {/* MOST RELEVANT SEARCH RESULTS */}
        <MostRelevantSearchResultsContainer searchResults={searchResults} />
        {/* SONG SEARCH RESULTS */}
        <SongSearchResultsContainer songs={searchResults.songs} searchInput={searchInput} />
        {/* ARTIST SEARCH RESULTS */}
        <ArtistsSearchResultsContainer
          artists={searchResults.artists}
          searchInput={searchInput}
          noOfVisibleArtists={noOfArtists}
        />
        {/* ALBUM SEARCH RESULTS */}
        <AlbumSearchResultsContainer
          albums={searchResults.albums}
          searchInput={searchInput}
          noOfVisibleAlbums={noOfAlbums}
        />
        {/* PLAYLIST SEARCH RESULTS */}
        <PlaylistSearchResultsContainer
          playlists={searchResults.playlists}
          searchInput={searchInput}
          noOfVisiblePlaylists={noOfPlaylists}
        />
        {/* GENRE SEARCH RESULTS */}
        <GenreSearchResultsContainer
          genres={searchResults.genres}
          searchInput={searchInput}
          noOfVisibleGenres={noOfGenres}
        />
        {/* NO SEARCH RESULTS PLACEHOLDER */}
        <NoSearchResultsContainer
          searchInput={searchInput}
          searchResults={searchResults}
          updateSearchInput={updateSearchInput}
        />
        {/* SEARCH START PLACEHOLDER */}
        <SearchStartPlaceholder
          searchResults={searchResults}
          searchInput={searchInput}
          updateSearchInput={updateSearchInput}
        />
      </div>
    </MainContainer>
  );
};

export default SearchPage;
