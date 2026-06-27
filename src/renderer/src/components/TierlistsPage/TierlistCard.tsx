import { lazy, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import Button from '../Button';
import Img from '../Img';
import MultipleArtworksCover from '../PlaylistsPage/MultipleArtworksCover';

import DefaultTierlistCover from '../../assets/images/webp/playlist_cover_default.webp';

const ConfirmDeleteTierlistPrompt = lazy(() => import('./ConfirmDeleteTierlistPrompt'));

interface TierlistCardProps {
  tierlist: SavableTierlist;
}

const TierlistCard = ({ tierlist }: TierlistCardProps) => {
  const { changeCurrentActivePage, changePromptMenuData } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const [sourceSongIds, setSourceSongIds] = useState<string[]>([]);

  // Ranked songs first (S-tier → F-tier order = the "top" picks), then fill from
  // the source playlists so the icon is populated even before anything is ranked.
  const rankedIds = useMemo(
    () => (tierlist.tiers || []).flatMap((tier) => tier.items || []),
    [tierlist.tiers]
  );
  const placedCount = rankedIds.length;

  useEffect(() => {
    const ids = tierlist.sourcePlaylistIds || [];
    if (ids.length === 0) return setSourceSongIds([]);
    window.api.playlistsData
      .getPlaylistData(ids)
      .then((playlists) => {
        const union: string[] = [];
        const seen = new Set<string>();
        for (const playlist of playlists || []) {
          for (const songId of playlist.songs) {
            if (!seen.has(songId)) {
              seen.add(songId);
              union.push(songId);
            }
          }
        }
        return setSourceSongIds(union);
      })
      .catch((err) => console.error(err));
  }, [tierlist.sourcePlaylistIds]);

  const coverSongIds = useMemo(() => {
    const seen = new Set<string>();
    const combined: string[] = [];
    for (const id of [...rankedIds, ...sourceSongIds]) {
      if (!seen.has(id)) {
        seen.add(id);
        combined.push(id);
      }
      if (combined.length >= 12) break;
    }
    return combined;
  }, [rankedIds, sourceSongIds]);

  const openEditor = () =>
    changeCurrentActivePage('TierlistEditor', { tierlistId: tierlist.tierlistId });

  return (
    <div
      className="tierlist-card group relative flex aspect-square w-48 cursor-pointer flex-col overflow-hidden rounded-xl bg-background-color-2/70 shadow-md ring-1 ring-black/5 transition-shadow hover:shadow-xl hover:ring-2 hover:ring-font-color-highlight dark:bg-dark-background-color-2/70 dark:ring-white/10 dark:hover:ring-dark-font-color-highlight"
      role="button"
      tabIndex={0}
      onClick={openEditor}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openEditor();
      }}
    >
      <div className="cover h-3/5 w-full">
        {coverSongIds.length >= 2 ? (
          <MultipleArtworksCover
            songIds={coverSongIds}
            className="!h-full !w-full !rounded-none"
            imgClassName="!w-full"
          />
        ) : (
          <Img
            src={DefaultTierlistCover}
            alt=""
            className="h-full w-full object-cover opacity-90"
          />
        )}
      </div>
      <div className="info flex grow flex-col justify-between p-3">
        <div
          className="name truncate text-base font-medium text-font-color-black dark:text-font-color-white"
          title={tierlist.name}
        >
          {tierlist.name}
        </div>
        <div className="meta flex items-center justify-between text-xs text-font-color-black/60 dark:text-font-color-white/60">
          <span>
            {t('common.playlistWithCount', { count: tierlist.sourcePlaylistIds?.length || 0 })}
          </span>
          <span>{t('tierlistsPage.rankedCount', { count: placedCount })}</span>
        </div>
      </div>
      <Button
        className="delete-btn invisible absolute right-2 top-2 !mr-0 aspect-square !rounded-full !border-none !bg-black/55 !p-1 !text-white opacity-0 backdrop-blur-sm transition-[background,opacity] hover:!bg-font-color-crimson hover:!text-white group-hover:visible group-hover:opacity-100"
        iconName="delete"
        tooltipLabel={t('tierlistsPage.deleteTierlist')}
        clickHandler={(e) => {
          e.stopPropagation();
          changePromptMenuData(true, <ConfirmDeleteTierlistPrompt tierlist={tierlist} />);
        }}
      />
    </div>
  );
};

export default TierlistCard;
