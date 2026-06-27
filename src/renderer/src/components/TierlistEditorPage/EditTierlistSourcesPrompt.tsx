import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import Button from '../Button';
import Img from '../Img';

import DefaultPlaylistCover from '../../assets/images/webp/playlist_cover_default.webp';

interface EditTierlistSourcesPromptProps {
  tierlist: SavableTierlist;
  onSaved: (_updated: SavableTierlist) => void;
}

const EditTierlistSourcesPrompt = ({ tierlist, onSaved }: EditTierlistSourcesPromptProps) => {
  const { changePromptMenuData, addNewNotifications } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(tierlist.sourcePlaylistIds || []);

  useEffect(() => {
    window.api.playlistsData
      .getPlaylistData([], 'aToZ')
      .then((res) => setPlaylists(Array.isArray(res) ? res : []))
      .catch((err) => console.error(err));
  }, []);

  const toggleSelection = (playlistId: string) =>
    setSelectedIds((prev) =>
      prev.includes(playlistId) ? prev.filter((id) => id !== playlistId) : [...prev, playlistId]
    );

  const save = () => {
    if (selectedIds.length === 0) {
      return addNewNotifications([
        { id: 'noSourcePlaylists', duration: 5000, content: t('tierlistsPage.noSourcePlaylists') }
      ]);
    }
    onSaved({ ...tierlist, sourcePlaylistIds: selectedIds });
    changePromptMenuData(false);
    return addNewNotifications([
      { id: 'tierlistSaved', duration: 4000, content: t('tierlistsPage.saved') }
    ]);
  };

  return (
    <div className="mx-auto flex max-h-[80vh] w-full max-w-2xl flex-col items-center">
      <span className="mb-6 text-center text-2xl font-medium">
        {t('tierlistsPage.selectSourcePlaylists')}
      </span>
      <div className="playlists-picker flex w-full flex-wrap justify-center gap-3 overflow-auto px-1 py-1">
        {playlists.map((playlist) => {
          const isSelected = selectedIds.includes(playlist.playlistId);
          return (
            <button
              type="button"
              key={playlist.playlistId}
              onClick={() => toggleSelection(playlist.playlistId)}
              className={`flex h-16 w-56 items-center gap-3 rounded-xl px-3 text-left transition-[outline,background] ${
                isSelected
                  ? 'bg-font-color-highlight/20 outline outline-2 outline-font-color-highlight dark:bg-dark-font-color-highlight/20 dark:outline-dark-font-color-highlight'
                  : 'bg-background-color-2/60 outline-1 hover:outline dark:bg-dark-background-color-2/60'
              }`}
            >
              <Img
                src={playlist.artworkPaths?.artworkPath || DefaultPlaylistCover}
                fallbackSrc={DefaultPlaylistCover}
                alt=""
                className="aspect-square w-10 shrink-0 rounded-md"
              />
              <span className="truncate text-sm font-medium">{playlist.name}</span>
              {isSelected && (
                <span className="material-icons-round ml-auto text-base text-font-color-highlight dark:text-dark-font-color-highlight">
                  check_circle
                </span>
              )}
            </button>
          );
        })}
      </div>
      <Button
        label={t('tierlistsPage.create')}
        iconName="check"
        className="!mr-0 mt-8 cursor-pointer justify-center !bg-background-color-3 !px-8 !py-3 text-lg !text-font-color-black dark:!bg-dark-background-color-3 dark:text-font-color-black"
        clickHandler={save}
      />
    </div>
  );
};

export default EditTierlistSourcesPrompt;
