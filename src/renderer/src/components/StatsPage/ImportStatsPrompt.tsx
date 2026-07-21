import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';

import Button from '../Button';
import storage from '../../utils/localStorage';

type ImportState = 'idle' | 'importing' | 'report';

const ImportStatsPrompt = () => {
  const { changePromptMenuData, addNewNotifications } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const [mergeMode, setMergeMode] = useState<StatsMergeMode>('separateDevices');
  const [state, setState] = useState<ImportState>('idle');
  const [report, setReport] = useState<StatsImportReport>();
  const [lastSource, setLastSource] = useState<StatsImportSource>('file');

  const runImport = (source: StatsImportSource, mode: StatsMergeMode) => {
    setLastSource(source);
    setState('importing');
    window.api.statsData
      .importStatsData(mode, source)
      .then((res) => {
        // User closed the OS dialog — silently go back to the start state.
        if (!res.success && !res.message && !res.alreadyImported) return setState('idle');
        setReport(res);
        setState('report');
        if (res.success) {
          const notifications: Parameters<typeof addNewNotifications>[0] = [
            {
              id: 'statsImportSuccess',
              duration: 5000,
              content: t('statsImport.reportMatched', { count: res.matchedSongs }),
              iconName: 'upload'
            }
          ];
          const intensity = res.importedPreferences?.tierShuffleIntensity;
          if (typeof intensity === 'number') {
            storage.preferences.setPreferences('tierShuffleIntensity', intensity);
            notifications.push({
              id: 'statsImportPreferences',
              duration: 5000,
              content: t('statsImport.preferencesApplied', {
                value: Math.round(intensity * 100)
              }),
              iconName: 'auto_fix'
            });
          }
          addNewNotifications(notifications);
        }
        return undefined;
      })
      .catch((err) => {
        console.error(err);
        setReport({
          success: false,
          message: t('statsImport.failed'),
          matchedSongs: 0,
          unmatchedSongs: 0,
          mergedListens: 0,
          eloMerged: false
        });
        setState('report');
        return undefined;
      });
  };

  const mergeModeOption = (mode: StatsMergeMode, label: string, hint: string, inputId: string) => (
    <label
      key={mode}
      htmlFor={inputId}
      className={`mb-2 flex cursor-pointer flex-col rounded-md bg-background-color-2/75 px-4 py-3 outline-2 outline-offset-1 focus-within:!outline hover:bg-background-color-2 dark:bg-dark-background-color-2/75 dark:hover:bg-dark-background-color-2 ${
        mergeMode === mode && '!bg-background-color-3 dark:!bg-dark-background-color-3'
      }`}
    >
      <input
        type="radio"
        name="statsMergeMode"
        className="invisible absolute -left-[9999px]"
        value={mode}
        id={inputId}
        checked={mergeMode === mode}
        onChange={() => setMergeMode(mode)}
      />
      <span className="font-medium">{label}</span>
      <span className="text-sm opacity-75">{hint}</span>
    </label>
  );

  return (
    <>
      <div className="title-container mb-6 mt-1 flex items-center pr-4 text-3xl font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
        {t('statsImport.title')}
      </div>

      {state === 'idle' && (
        <>
          <div className="description mb-6 flex flex-col">
            {mergeModeOption(
              'separateDevices',
              t('statsImport.mergeModeSeparate'),
              t('statsImport.mergeModeSeparateHint'),
              'mergeModeSeparateRadioBtn'
            )}
            {mergeModeOption(
              'sameOrigin',
              t('statsImport.mergeModeSameOrigin'),
              t('statsImport.mergeModeSameOriginHint'),
              'mergeModeSameOriginRadioBtn'
            )}
          </div>
          <div className="buttons-container flex items-center justify-end gap-2">
            <Button
              label={t('statsImport.pickFile')}
              iconName="upload_file"
              className="import-stats-file-btn !bg-background-color-3 px-6 text-sm !text-font-color-black hover:border-background-color-3 md:text-base dark:!bg-dark-background-color-3 dark:!text-font-color-black dark:hover:border-background-color-3"
              clickHandler={() => runImport('file', mergeMode)}
            />
          </div>
        </>
      )}

      {state === 'importing' && (
        <div className="description my-8 text-center text-lg">{t('statsImport.importing')}</div>
      )}

      {state === 'report' && report && (
        <>
          <div className="description mb-6">
            {report.success ? (
              <ul className="list-inside list-disc pl-4 marker:text-font-color-highlight dark:marker:text-dark-font-color-highlight">
                <li>{t('statsImport.reportMatched', { count: report.matchedSongs })}</li>
                <li>{t('statsImport.reportUnmatched', { count: report.unmatchedSongs })}</li>
                <li>{t('statsImport.reportMerged', { count: report.mergedListens })}</li>
                {report.eloMerged && <li>{t('statsImport.reportElo')}</li>}
                {typeof report.playlistsImported === 'number' && (
                  <li>{t('statsImport.reportPlaylists', { count: report.playlistsImported })}</li>
                )}
                {typeof report.tierlistsImported === 'number' && (
                  <li>{t('statsImport.reportTierlists', { count: report.tierlistsImported })}</li>
                )}
                {report.backupPath && (
                  <li className="break-all">
                    {t('statsImport.reportBackup', { path: report.backupPath })}
                  </li>
                )}
              </ul>
            ) : (
              <span>{report.message || t('statsImport.failed')}</span>
            )}
            {report.notes && report.notes.length > 0 && (
              <ul className="mt-2 list-inside list-disc pl-4 text-sm opacity-75">
                {report.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
            {report.alreadyImported && (
              <div className="mt-4">{t('statsImport.alreadyImportedWarning')}</div>
            )}
          </div>
          <div className="buttons-container flex items-center justify-end gap-2">
            {report.alreadyImported && (
              <Button
                label={t('statsImport.importAsSameOrigin')}
                iconName="upload"
                className="import-stats-same-origin-btn !bg-background-color-3 px-6 text-sm !text-font-color-black hover:border-background-color-3 md:text-base dark:!bg-dark-background-color-3 dark:!text-font-color-black dark:hover:border-background-color-3"
                clickHandler={() => runImport(lastSource, 'sameOrigin')}
              />
            )}
            <Button
              label={t('eloDuels.close')}
              className="import-stats-close-btn !bg-background-color-3 px-8 text-sm !text-font-color-black hover:border-background-color-3 md:text-base dark:!bg-dark-background-color-3 dark:!text-font-color-black dark:hover:border-background-color-3"
              clickHandler={() => changePromptMenuData(false)}
            />
          </div>
        </>
      )}
    </>
  );
};

export default ImportStatsPrompt;
