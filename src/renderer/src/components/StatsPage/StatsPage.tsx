import { lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@tanstack/react-store';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { store } from '@renderer/store';
import i18n from '../../i18n';
import { valueRounder } from '../../utils/valueRounder';
import storage from '../../utils/localStorage';
import { loadSongGuessrState } from '../../utils/songGuessr/persistence';

import Dropdown, { type DropdownOption } from '../Dropdown';
import MainContainer from '../MainContainer';
import Button from '../Button';
import Img from '../Img';
import StatTile from './StatTile';
import ActivityBarGraph from './ActivityBarGraph';
import ActivityCalendar from './ActivityCalendar';
import TopSongRow from './TopSongRow';
import TopNameRow from './TopNameRow';
import SongGuessrStatsSection from './SongGuessrStatsSection';

import NoStatsImage from '../../assets/images/svg/Summer landscape_Monochromatic.svg';

const ImportStatsPrompt = lazy(() => import('./ImportStatsPrompt'));

const statsTimeRangeOptions: DropdownOption<StatsTimeRange>[] = [
  { label: i18n.t('statsPage.timeRange_allTime'), value: 'allTime' },
  { label: i18n.t('statsPage.timeRange_last12Months'), value: 'last12Months' },
  { label: i18n.t('statsPage.timeRange_last30Days'), value: 'last30Days' }
];

const monthNames = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december'
] as const;

const StatsPage = () => {
  const { t } = useTranslation();
  const currentlyActivePage = useStore(store, (state) => state.currentlyActivePage);
  const {
    changeCurrentActivePage,
    updateCurrentlyActivePageData,
    changePromptMenuData,
    addNewNotifications
  } = useContext(AppUpdateContext);

  const [timeRange, setTimeRange] = useState<StatsTimeRange>(
    () => (currentlyActivePage.data?.statsTimeRange as StatsTimeRange | undefined) ?? 'allTime'
  );
  const [stats, setStats] = useState<StatsData>();
  /*
    SongGuessr keeps its own isolated localStorage key and never joins the
    library stores, so this is a plain read alongside the IPC stats rather than
    part of StatsData — nothing here can touch listening data or ELO saves.
    Re-read whenever the page becomes active again; rounds are played in the
    dialog, which emits no `app/dataUpdates` event.
  */
  const [songGuessrStats, setSongGuessrStats] = useState<SongGuessrStats>(
    () => loadSongGuessrState().stats
  );
  const statsRequestIdRef = useRef(0);

  useEffect(() => {
    setSongGuessrStats(loadSongGuessrState().stats);
  }, [currentlyActivePage]);

  const fetchStats = useCallback(() => {
    const requestId = ++statsRequestIdRef.current;
    const requestedRange = timeRange;
    window.api.statsData
      .getStatsData(requestedRange)
      .then((res) => {
        // Range changes can resolve out of order. Never render an old monthly
        // response using the new daily label/key format (or vice versa).
        if (res && requestId === statsRequestIdRef.current && res.timeRange === requestedRange)
          return setStats(res);
        return undefined;
      })
      .catch((err) => console.error(err));
  }, [timeRange]);

  useEffect(() => {
    fetchStats();
    const manageStatsDataUpdates = (e: Event) => {
      if ('detail' in e) {
        const dataEvents = (e as DetailAvailableEvent<DataUpdateEvent[]>).detail;
        const shouldRefresh = dataEvents.some(({ dataType }) => {
          return (
            dataType.startsWith('songs/listeningData') ||
            dataType === 'songs/newSong' ||
            dataType === 'songs/deletedSong' ||
            dataType === 'blacklist/songBlacklist' ||
            dataType === 'playlists/favorites' ||
            dataType === 'eloDuels'
          );
        });
        if (shouldRefresh) fetchStats();
      }
    };
    document.addEventListener('app/dataUpdates', manageStatsDataUpdates);
    return () => {
      statsRequestIdRef.current += 1;
      document.removeEventListener('app/dataUpdates', manageStatsDataUpdates);
    };
  }, [fetchStats]);

  useEffect(() => {
    updateCurrentlyActivePageData((currentPageData) => ({
      ...currentPageData,
      statsTimeRange: timeRange
    }));
  }, [timeRange, updateCurrentlyActivePageData]);

  const openSongInfoPage = useCallback(
    (songId: string) => changeCurrentActivePage('SongInfo', { songId }),
    [changeCurrentActivePage]
  );

  const exportStats = useCallback(() => {
    window.api.statsData
      .exportStatsData({
        tierShuffleIntensity: storage.preferences.getPreferences('tierShuffleIntensity')
      })
      .then((res) => {
        if (res.success)
          return addNewNotifications([
            {
              id: 'statsExportSuccess',
              duration: 5000,
              content: t('statsPage.exportSuccess'),
              iconName: 'download'
            }
          ]);
        // No message = the user closed the save dialog — stay silent.
        if (res.message)
          return addNewNotifications([
            {
              id: 'statsExportFailed',
              duration: 5000,
              content: t('statsPage.exportFailed'),
              iconName: 'error'
            }
          ]);
        return undefined;
      })
      .catch((err) => console.error(err));
  }, [addNewNotifications, t]);

  const openImportPrompt = useCallback(
    () => changePromptMenuData(true, <ImportStatsPrompt />),
    [changePromptMenuData]
  );

  const formatActivityLabel = useCallback(
    (isoDate: string, range: StatsTimeRange) => {
      const [, month, day] = isoDate.split('-').map(Number);
      if (range === 'last30Days') return `${day}`;
      return t(`month.${monthNames[(month - 1 + 12) % 12]}`);
    },
    [t]
  );

  const activityData = useMemo(
    () =>
      (stats?.activity ?? []).map((datum) => ({
        id: datum.label,
        label: formatActivityLabel(datum.label, stats?.timeRange ?? timeRange),
        listens: datum.listens
      })),
    [stats, timeRange, formatActivityLabel]
  );

  const approxListeningTime = useMemo(() => {
    const sec = stats?.totals.approxListeningTimeSec ?? 0;
    const hours = Math.round(sec / 3600);
    if (hours >= 1) return `~${t('time.hourWithCount', { count: hours })}`;
    const minutes = Math.round(sec / 60);
    return `~${t('time.minuteWithCount', { count: minutes })}`;
  }, [stats, t]);

  const mostActiveDayLabel = useMemo(() => {
    const mostActiveDay = stats?.calendar.mostActiveDay;
    if (!mostActiveDay) return '';
    return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
      new Date(`${mostActiveDay.date}T00:00:00`)
    );
  }, [stats]);

  const hasData =
    !!stats &&
    (stats.totals.totalListens > 0 || stats.elo.totalDuels > 0 || songGuessrStats.gamesPlayed > 0);

  return (
    <MainContainer className="stats-page appear-from-bottom !h-full overflow-hidden !pb-0 text-font-color-black dark:text-font-color-white">
      <>
        <div className="title-container mb-4 mt-1 flex items-center justify-between pr-4 text-3xl font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
          <div className="container flex items-center">{t('statsPage.title')}</div>
          <div className="other-controls-container flex items-center">
            <Button
              label={t('statsPage.exportStats')}
              iconName="download"
              className="export-stats-btn mr-2 text-sm md:text-lg"
              clickHandler={exportStats}
            />
            <Button
              label={t('statsPage.importStats')}
              iconName="upload"
              className="import-stats-btn mr-4 text-sm md:text-lg"
              clickHandler={openImportPrompt}
            />
            <Dropdown
              name="statsTimeRangeDropdown"
              value={timeRange}
              options={statsTimeRangeOptions}
              onChange={(e) => setTimeRange(e.currentTarget.value as StatsTimeRange)}
            />
          </div>
        </div>

        {hasData ? (
          <div className="stats-content-container h-full overflow-y-auto overflow-x-hidden p-1 pb-8 pr-4">
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6 sm:grid-cols-3">
              <StatTile
                label={t('statsPage.totalListens')}
                value={valueRounder(stats.totals.totalListens)}
              />
              <StatTile
                label={t('statsPage.fullListens')}
                value={valueRounder(stats.totals.fullListens)}
              />
              <StatTile label={t('statsPage.skips')} value={valueRounder(stats.totals.skips)} />
              <StatTile label={t('statsPage.approxListeningTime')} value={approxListeningTime} />
              <StatTile
                label={t('statsPage.songsPlayed')}
                value={valueRounder(stats.totals.distinctSongsPlayed)}
              />
              <ActivityCalendar days={stats.calendar.days} />
            </div>

            <section className="mb-6">
              <h2 className="mb-2 text-lg font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
                {t('statsPage.listeningActivity')}
              </h2>
              <ActivityBarGraph key={stats.timeRange} data={activityData} />
            </section>

            <section className="mb-6">
              <h2 className="mb-2 text-lg font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
                {t('statsPage.listeningCalendar')}
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <StatTile
                  label={t('statsPage.currentStreak')}
                  value={t('time.dayWithCount', { count: stats.calendar.currentStreak })}
                />
                <StatTile
                  label={t('statsPage.longestStreak')}
                  value={t('time.dayWithCount', { count: stats.calendar.longestStreak })}
                />
                <StatTile
                  label={t('statsPage.mostActiveDay')}
                  value={stats.calendar.mostActiveDay ? mostActiveDayLabel : '-'}
                  title={
                    stats.calendar.mostActiveDay
                      ? `${mostActiveDayLabel} - ${t('songInfoPage.listensCount', { count: stats.calendar.mostActiveDay.listens })}`
                      : undefined
                  }
                />
              </div>
            </section>

            <div className="mb-6 grid gap-6 lg:grid-cols-3">
              <section>
                <h2 className="mb-2 text-lg font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
                  {t('statsPage.topSongs')}
                </h2>
                <div className="rounded-md bg-background-color-2/70 p-4 backdrop-blur-md dark:bg-dark-background-color-2/70">
                  <ul>
                    {stats.topSongs.map((song, index) => (
                      <TopSongRow
                        key={song.songId}
                        rank={index + 1}
                        entry={song}
                        count={song.listensInRange}
                        onTitleClick={openSongInfoPage}
                      />
                    ))}
                  </ul>
                </div>
              </section>
              <section>
                <h2 className="mb-2 text-lg font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
                  {t('statsPage.topArtists')}
                </h2>
                <div className="rounded-md bg-background-color-2/70 p-4 backdrop-blur-md dark:bg-dark-background-color-2/70">
                  <ul>
                    {stats.topArtists.map((artist, index) => (
                      <TopNameRow
                        key={artist.artistId ?? artist.name}
                        rank={index + 1}
                        entry={artist}
                      />
                    ))}
                  </ul>
                </div>
              </section>
              <section>
                <h2 className="mb-2 text-lg font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
                  {t('statsPage.topAlbums')}
                </h2>
                <div className="rounded-md bg-background-color-2/70 p-4 backdrop-blur-md dark:bg-dark-background-color-2/70">
                  <ul>
                    {stats.topAlbums.map((album, index) => (
                      <TopNameRow key={album.name} rank={index + 1} entry={album} />
                    ))}
                  </ul>
                </div>
              </section>
            </div>

            <div className="mb-6 grid gap-6 lg:grid-cols-2">
              <section>
                <h2 className="mb-2 text-lg font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
                  {t('statsPage.topGenres')}
                </h2>
                <div className="rounded-md bg-background-color-2/70 p-4 backdrop-blur-md dark:bg-dark-background-color-2/70">
                  <ul>
                    {stats.topGenres.map((genre, index) => (
                      <TopNameRow key={genre.name} rank={index + 1} entry={genre} />
                    ))}
                  </ul>
                </div>
              </section>
              <section>
                <h2 className="mb-2 text-lg font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
                  {t('statsPage.mostSkipped')}
                </h2>
                <div className="rounded-md bg-background-color-2/70 p-4 backdrop-blur-md dark:bg-dark-background-color-2/70">
                  <ul>
                    {stats.mostSkipped.map((song, index) => (
                      <TopSongRow
                        key={song.songId}
                        rank={index + 1}
                        entry={song}
                        count={song.skips ?? 0}
                        details={t('songInfoPage.listensCount', {
                          count: song.listensInRange
                        })}
                        onTitleClick={openSongInfoPage}
                      />
                    ))}
                  </ul>
                </div>
              </section>
            </div>

            {songGuessrStats.gamesPlayed > 0 && (
              <SongGuessrStatsSection stats={songGuessrStats} onTitleClick={openSongInfoPage} />
            )}

            {stats.elo.totalDuels > 0 && (
              <section className="mb-6">
                <h2 className="mb-2 text-lg font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
                  {t('eloDuels.sectionTitle')}
                </h2>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-md bg-background-color-2/70 p-4 backdrop-blur-md dark:bg-dark-background-color-2/70">
                    <div className="mb-2 text-sm opacity-75">
                      {t('eloDuels.totalDuels')}: {stats.elo.totalDuels}
                    </div>
                    <h3 className="mb-1 font-medium">{t('eloDuels.topRated')}</h3>
                    <ul>
                      {stats.elo.topRated.map((song, index) => (
                        <TopSongRow
                          key={song.songId}
                          rank={index + 1}
                          entry={song}
                          count={Math.round(song.effectiveRating)}
                          details={`${song.wins}W · ${song.losses}L${
                            song.draws > 0 ? ` · ${song.draws}D` : ''
                          } · ${song.games}g${
                            song.isProvisional ? ` · ${t('eloDuels.provisional')}` : ''
                          }`}
                          onTitleClick={openSongInfoPage}
                        />
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-md bg-background-color-2/70 p-4 backdrop-blur-md dark:bg-dark-background-color-2/70">
                    <h3 className="mb-1 font-medium">{t('eloDuels.recentDuels')}</h3>
                    <ul>
                      {stats.elo.recentDuels.map((duel) => (
                        <li
                          key={`${duel.at}-${duel.titleA}-${duel.titleB}`}
                          className="flex items-center justify-between gap-2 py-1"
                          title={new Date(duel.at).toLocaleString()}
                        >
                          <span className="min-w-0 truncate">
                            <span
                              className={
                                duel.winner === 'A' || duel.winner === 'draw' ? 'font-semibold' : ''
                              }
                            >
                              {duel.titleA}
                            </span>
                            <span className="opacity-60"> vs </span>
                            <span
                              className={
                                duel.winner === 'B' || duel.winner === 'draw' ? 'font-semibold' : ''
                              }
                            >
                              {duel.titleB}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm">
                            <span
                              className={
                                duel.deltaA >= 0
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                              }
                            >
                              {duel.deltaA >= 0
                                ? `+${Math.round(duel.deltaA)}`
                                : Math.round(duel.deltaA)}
                            </span>
                            <span className="opacity-60"> / </span>
                            <span
                              className={
                                duel.deltaB >= 0
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                              }
                            >
                              {duel.deltaB >= 0
                                ? `+${Math.round(duel.deltaB)}`
                                : Math.round(duel.deltaB)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="no-stats-container my-[8%] flex h-full w-full flex-col items-center justify-center text-center text-xl">
            <Img src={NoStatsImage} alt="" className="mb-8 w-60" />
            <span>{t('statsPage.empty')}</span>
          </div>
        )}
      </>
    </MainContainer>
  );
};

export default StatsPage;
