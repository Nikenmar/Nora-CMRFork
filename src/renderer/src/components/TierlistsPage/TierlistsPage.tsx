import { lazy, useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import storage from '../../utils/localStorage';
import i18n from '../../i18n';

import Dropdown, { type DropdownOption } from '../Dropdown';
import MainContainer from '../MainContainer';
import Button from '../Button';
import Img from '../Img';
import TierlistCard from './TierlistCard';

import NoTierlistsImage from '../../assets/images/svg/Summer landscape_Monochromatic.svg';

const NewTierlistPrompt = lazy(() => import('./NewTierlistPrompt'));

const tierlistSortTypes: DropdownOption<TierlistSortTypes>[] = [
  { label: i18n.t('sortTypes.aToZ'), value: 'aToZ' },
  { label: i18n.t('sortTypes.zToA'), value: 'zToA' },
  { label: i18n.t('sortTypes.dateAddedAscending'), value: 'dateAddedAscending' },
  { label: i18n.t('sortTypes.dateAddedDescending'), value: 'dateAddedDescending' }
];

const TierlistsPage = () => {
  const { changePromptMenuData } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const [tierlists, setTierlists] = useState<SavableTierlist[]>([]);
  const [sortingOrder, setSortingOrder] = useState<TierlistSortTypes>(
    storage.sortingStates.getSortingStates('tierlistsPage') || 'dateAddedDescending'
  );

  const fetchTierlists = useCallback(() => {
    window.api.tierlistsData
      .getTierlistData([], sortingOrder)
      .then((res) => setTierlists(Array.isArray(res) ? res : []))
      .catch((err) => console.error(err));
  }, [sortingOrder]);

  useEffect(() => {
    fetchTierlists();
    const manageTierlistUpdates = (e: Event) => {
      if ('detail' in e) {
        const dataEvents = (e as DetailAvailableEvent<DataUpdateEvent[]>).detail;
        for (let i = 0; i < dataEvents.length; i += 1) {
          if (dataEvents[i].dataType.startsWith('tierlists')) fetchTierlists();
        }
      }
    };
    document.addEventListener('app/dataUpdates', manageTierlistUpdates);
    return () => document.removeEventListener('app/dataUpdates', manageTierlistUpdates);
  }, [fetchTierlists]);

  useEffect(() => {
    storage.sortingStates.setSortingStates('tierlistsPage', sortingOrder);
  }, [sortingOrder]);

  const openCreatePrompt = useCallback(
    () => changePromptMenuData(true, <NewTierlistPrompt />),
    [changePromptMenuData]
  );

  return (
    <MainContainer className="tierlists-page appear-from-bottom !h-full overflow-hidden !pb-0 text-font-color-black dark:text-font-color-white">
      <>
        <div className="title-container mb-4 mt-1 flex items-center justify-between pr-4 text-3xl font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
          <div className="container flex items-center">
            {t('tierlistsPage.title')}
            <div className="other-stats-container ml-12 flex items-center text-xs text-font-color-black dark:text-font-color-white">
              {tierlists.length > 0 && (
                <span className="no-of-tierlists">
                  {t('tierlistsPage.tierlistWithCount', { count: tierlists.length })}
                </span>
              )}
            </div>
          </div>
          <div className="other-controls-container flex items-center">
            <Button
              label={t('tierlistsPage.addTierlist')}
              iconName="add"
              className="add-tierlist-btn text-sm md:text-lg"
              clickHandler={openCreatePrompt}
            />
            {tierlists.length > 0 && (
              <Dropdown
                name="tierlistSortDropdown"
                value={sortingOrder}
                options={tierlistSortTypes}
                onChange={(e) => setSortingOrder(e.currentTarget.value as TierlistSortTypes)}
              />
            )}
          </div>
        </div>

        {tierlists.length > 0 ? (
          <div className="tierlists-container flex h-full flex-wrap content-start gap-4 overflow-auto p-1 pb-8">
            {tierlists.map((tierlist) => (
              <TierlistCard key={tierlist.tierlistId} tierlist={tierlist} />
            ))}
          </div>
        ) : (
          <div className="no-tierlists-container my-[8%] flex h-full w-full flex-col items-center justify-center text-center text-xl">
            <Img src={NoTierlistsImage} alt="" className="mb-8 w-60" />
            <span>{t('tierlistsPage.empty')}</span>
            <Button
              label={t('tierlistsPage.addTierlist')}
              iconName="add"
              className="mt-6 !bg-background-color-3 !px-8 !py-3 !text-font-color-black dark:!bg-dark-background-color-3"
              clickHandler={openCreatePrompt}
            />
          </div>
        )}
      </>
    </MainContainer>
  );
};

export default TierlistsPage;
