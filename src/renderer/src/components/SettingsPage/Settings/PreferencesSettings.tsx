import { useTranslation } from 'react-i18next';
import storage from '../../../utils/localStorage';
import Checkbox from '../../Checkbox';
import Dropdown, { type DropdownOption } from '../../Dropdown';
import i18n from '../../../i18n';
import { useStore } from '@tanstack/react-store';
import { store } from '@renderer/store';

const duelFrequencyOptions: DropdownOption<DuelInviteFrequency>[] = [
  { label: i18n.t('eloDuels.frequency_off'), value: 'off' },
  { label: i18n.t('eloDuels.frequency_rare'), value: 'rare' },
  { label: i18n.t('eloDuels.frequency_normal'), value: 'normal' },
  { label: i18n.t('eloDuels.frequency_frequent'), value: 'frequent' }
];

const PreferencesSettings = () => {
  const userData = useStore(store, (state) => state.userData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const duels = useStore(store, (state) => state.localStorage.duels);
  const { t } = useTranslation();

  return (
    <li className="main-container preferences-settings-container mb-16">
      <div className="title-container mb-4 mt-1 flex items-center text-2xl font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
        <span className="material-icons-round-outlined mr-2">tune</span>
        {t('settingsPage.preferences')}
      </div>
      <ul className="list-disc pl-6 marker:bg-background-color-3 dark:marker:bg-background-color-3">
        <li className="checkbox-container">
          <div className="secondary-container toggle-song-indexing mb-4">
            <div className="description">{t('settingsPage.songIndexingDescription')}</div>
            <Checkbox
              id="isSongIndexingEnabled"
              isChecked={preferences?.isSongIndexingEnabled}
              checkedStateUpdateFunction={(state) =>
                storage.preferences.setPreferences('isSongIndexingEnabled', state)
              }
              labelContent={t('settingsPage.enableSongIndexing')}
            />
          </div>
        </li>

        <li className="checkbox-container">
          <div className="secondary-container toggle-song-indexing mb-4">
            <div className="description">
              {t('settingsPage.showTrackNumberAsSongIndexDescription')}
            </div>
            <Checkbox
              id="showTrackNumberAsSongIndex"
              isChecked={preferences?.showTrackNumberAsSongIndex}
              checkedStateUpdateFunction={(state) =>
                storage.preferences.setPreferences('showTrackNumberAsSongIndex', state)
              }
              labelContent={t('settingsPage.showTrackNumberAsSongIndex')}
            />
          </div>
        </li>

        <li className="checkbox-container">
          <div className="secondary-container show-artists-artwork-near-song-controls mb-4">
            <div className="description">
              {t('settingsPage.showArtistArtworkNearSongControlsDescription')}
            </div>
            <Checkbox
              id="showArtistArtworkNearSongControls"
              isChecked={userData !== undefined && preferences?.showArtistArtworkNearSongControls}
              checkedStateUpdateFunction={(state) =>
                storage.preferences.setPreferences('showArtistArtworkNearSongControls', state)
              }
              labelContent={t('settingsPage.showArtistArtworkNearSongControls')}
            />
          </div>
        </li>

        <li className="checkbox-container">
          <div className="secondary-container disable-background-artworks mb-4">
            <div className="description">
              {t('settingsPage.disableBackgroundArtworksDescription')}
            </div>
            <Checkbox
              id="disableBackgroundArtwork"
              isChecked={preferences?.disableBackgroundArtworks}
              checkedStateUpdateFunction={(state) =>
                storage.preferences.setPreferences('disableBackgroundArtworks', state)
              }
              labelContent={t('settingsPage.disableBackgroundArtworks')}
            />
          </div>
        </li>

        <li className="checkbox-container">
          <div className="secondary-container enable-artwork-from-song-covers mb-4">
            <div className="description">{t('settingsPage.playlistArtworksDescription')}</div>
            <Checkbox
              id="enableArtworkFromSongCovers"
              className="mb-2"
              isChecked={preferences?.enableArtworkFromSongCovers}
              checkedStateUpdateFunction={(state) =>
                storage.preferences.setPreferences('enableArtworkFromSongCovers', state)
              }
              labelContent={t('settingsPage.enablePlaylistArtworks')}
            />
            <Checkbox
              id="shuffleArtworkFromSongCovers"
              isDisabled={!preferences?.enableArtworkFromSongCovers}
              isChecked={preferences?.shuffleArtworkFromSongCovers}
              checkedStateUpdateFunction={(state) =>
                storage.preferences.setPreferences('shuffleArtworkFromSongCovers', state)
              }
              labelContent={t('settingsPage.shuffleArtworkFromSongCovers')}
            />
          </div>
        </li>

        <li className="duel-invites-frequency mb-4">
          <div className="secondary-container">
            <label htmlFor="duelInvitesFrequency" className="font-medium">
              {t('eloDuels.settingsLabel')}
            </label>
            <div className="description">{t('eloDuels.settingsDescription')}</div>
            <Dropdown
              className="mt-4"
              name="duelInvitesFrequency"
              value={duels?.frequency ?? 'normal'}
              options={duelFrequencyOptions}
              onChange={(e) =>
                storage.duels.setDuelsData(
                  'frequency',
                  e.currentTarget.value as DuelInviteFrequency
                )
              }
            />
          </div>
        </li>
      </ul>
    </li>
  );
};

export default PreferencesSettings;
