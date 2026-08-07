import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Version from './Version';
import Img from '../Img';

import { urls } from '../../../../../package.json';
import localReleseNotes from '../../../../../release-notes.json';

// The changelog is read straight from the bundled release-notes.json. The stock
// version fetched it from upstream Nora, which no longer publishes that file —
// see src/main/update.ts for the fork's actual update mechanism.
const releaseNotes = localReleseNotes as Changelog;

const ReleaseNotesPrompt = () => {
  const { t } = useTranslation();

  const latestUpdatedInfo = useMemo(() => {
    const sortedReleaseNotes = releaseNotes.versions.sort((versionA, versionB) => {
      const dateNowOfA = new Date(versionA.releaseDate).getTime();
      const dateNowOfB = new Date(versionB.releaseDate).getTime();

      if (dateNowOfA === dateNowOfB) return 0;
      if (dateNowOfA > dateNowOfB) return -1;
      return 1;
    });

    const latestVersion = sortedReleaseNotes[0];

    // ! / / / / TO BE DEPRECATED CODE / / /
    // TODO: Will be deprectated in the next major release
    /** @deprecated  */
    if (releaseNotes.latestVersion) {
      latestVersion.artwork ||= releaseNotes.latestVersion.artwork;
      latestVersion.importantNotes ??= releaseNotes.latestVersion.importantNotes;
    }
    //! / / / / /

    return latestVersion;
  }, []);

  const appVersionComponents = useMemo(
    () =>
      releaseNotes.versions.map((version) => (
        <Version
          key={version.version}
          version={version.version}
          releaseDate={version.releaseDate}
          notes={version.notes}
          isLatest={latestUpdatedInfo.version === version.version}
        />
      )),
    [latestUpdatedInfo.version]
  );

  const latestVersionImportantNotes = useMemo(() => {
    if (latestUpdatedInfo.importantNotes) {
      const notes = latestUpdatedInfo.importantNotes.map((note, index) => {
        return (
          <li
            key={`important note ${index + 1}`}
            className="latest-version-important-note mb-2 max-w-[90%] font-medium"
          >
            {note}
          </li>
        );
      });

      return (
        <ul className="mb-12 mt-8 flex list-disc flex-col justify-center px-8 marker:text-font-color-highlight dark:marker:text-dark-font-color-highlight">
          {notes}
        </ul>
      );
    }
    return undefined;
  }, [latestUpdatedInfo.importantNotes]);

  return (
    <>
      <div className="h-full w-full">
        {releaseNotes && (
          <>
            <h2 className="title-container mb-2 text-center text-3xl font-medium">
              {t('releaseNotesPrompt.changelog')}
            </h2>
            {latestUpdatedInfo.artwork && (
              <div className="version-artwork-container mb-4 p-4 empty:mb-0 empty:p-0">
                <Img
                  src={`${urls.raw_repository_url}master${latestUpdatedInfo.artwork}`}
                  fallbackSrc={latestUpdatedInfo.artwork}
                  className="mx-auto rounded-lg"
                  alt=""
                />
              </div>
            )}
            {latestVersionImportantNotes}
            {appVersionComponents}
          </>
        )}
      </div>
    </>
  );
};

export default ReleaseNotesPrompt;
