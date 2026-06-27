import { useCallback, useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import Button from '../Button';

interface ConfirmDeleteTierlistProps {
  tierlist: SavableTierlist;
}

const ConfirmDeleteTierlistPrompt = ({ tierlist }: ConfirmDeleteTierlistProps) => {
  const { addNewNotifications, changePromptMenuData } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const deleteTierlist = useCallback(() => {
    window.api.tierlistsData
      .removeTierlists([tierlist.tierlistId])
      .then(() => {
        changePromptMenuData(false);
        return addNewNotifications([
          {
            id: 'tierlistDeleted',
            duration: 5000,
            content: t('tierlistsPage.deleteTierlist')
          }
        ]);
      })
      .catch((err) => console.error(err));
  }, [addNewNotifications, changePromptMenuData, t, tierlist.tierlistId]);

  return (
    <>
      <div className="title-container mb-8 mt-1 flex items-center pr-4 text-3xl font-medium text-font-color-black dark:text-font-color-white">
        {t('tierlistsPage.deleteTierlist')} — {tierlist.name}
      </div>
      <div className="description">{t('tierlistsPage.confirmDeleteMessage')}</div>
      <div className="buttons-container mt-8 flex w-full justify-end">
        <Button
          label={t('tierlistsPage.deleteTierlist')}
          className="delete-tierlist-btn danger-btn float-right h-10 w-48 cursor-pointer rounded-lg border-[transparent] !bg-font-color-crimson text-font-color-white outline-none ease-in-out hover:border-font-color-crimson dark:!bg-font-color-crimson dark:text-font-color-white"
          clickHandler={deleteTierlist}
        />
      </div>
    </>
  );
};

export default ConfirmDeleteTierlistPrompt;
