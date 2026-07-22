import { useCallback, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import i18n from '../../i18n';

import Button from '../Button';
import Dropdown, { type DropdownOption } from '../Dropdown';

const thresholdOptions: DropdownOption<string>[] = [
  { label: i18n.t('playlistsPage.rediscoverThreshold30'), value: '30' },
  { label: i18n.t('playlistsPage.rediscoverThreshold60'), value: '60' },
  { label: i18n.t('playlistsPage.rediscoverThreshold90'), value: '90' }
];

/**
 * Lets the user pick how "forgotten" a loved track must be (days since the
 * last listen) before it lands in the Rediscover playlist, then refreshes it.
 */
const RefreshRediscoverPrompt = () => {
  const { changePromptMenuData, addNewNotifications } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const [threshold, setThreshold] = useState('30');

  const refresh = useCallback(() => {
    window.api.playlistsData
      .refreshRediscoverPlaylist(Number(threshold))
      .then((res) =>
        addNewNotifications([
          {
            id: 'rediscoverRefreshed',
            duration: 5000,
            iconName: 'refresh',
            content: t('playlistsPage.rediscoverRefreshSuccess', { count: res.count })
          }
        ])
      )
      .catch((err) => console.error(err));
  }, [addNewNotifications, t, threshold]);

  return (
    <>
      <div className="title-container mb-4 mt-1 flex items-center pr-4 text-3xl font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
        {t('playlistsPage.refreshRediscoverTitle')}
      </div>
      <div className="description mb-2">{t('playlistsPage.refreshRediscoverHint')}</div>
      <Dropdown
        name="rediscoverThresholdDropdown"
        value={threshold}
        options={thresholdOptions}
        onChange={(e) => setThreshold(e.currentTarget.value)}
      />
      <div className="buttons-container flex items-center justify-end">
        <Button
          label={t('playlistsPage.refreshRediscover')}
          iconName="refresh"
          className="refresh-rediscover-btn float-right mt-8 h-10 w-48"
          clickHandler={() => {
            changePromptMenuData(false);
            refresh();
          }}
        />
      </div>
    </>
  );
};

export default RefreshRediscoverPrompt;
