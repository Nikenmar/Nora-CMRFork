import { BrowserWindow, dialog } from 'electron';
import electronUpdater from 'electron-updater';
import logger from './logger';
import { IS_DEVELOPMENT } from './main';

const { autoUpdater } = electronUpdater;

let isHandlingUpdate = false;

/**
 * CMR Fork auto-update.
 *
 * Pulls release metadata (`latest.yml`) from the fork's GitHub releases
 * (configured via the `publish` block in electron-builder.yml), compares the
 * published version against the installed one (semver), and — on every launch
 * with internet — prompts the user to update until they do. Once accepted, the
 * update downloads, installs silently, and relaunches Nora automatically.
 *
 * The right artifact (x64 / arm64) is chosen automatically by electron-updater
 * from the running process architecture; no manual selection needed.
 */
export default async function checkForUpdates(mainWindow?: BrowserWindow) {
  // electron-updater throws when unpackaged unless a dev-app-update.yml exists.
  if (IS_DEVELOPMENT) {
    logger.info('Skipping update check in development.');
    return null;
  }

  if (isHandlingUpdate) return null;
  isHandlingUpdate = true;

  autoUpdater.logger = {
    info: (msg) => logger.info(String(msg)),
    warn: (msg) => logger.warn(String(msg)),
    error: (msg) => logger.error(String(msg)),
    debug: (msg) => logger.debug(String(msg))
  };

  // We prompt before downloading, so the user stays in control.
  autoUpdater.autoDownload = false;
  // Installation is explicit in `update-downloaded` so it always uses the NSIS
  // silent-install and force-relaunch flags instead of waiting for a normal quit.
  autoUpdater.autoInstallOnAppQuit = false;
  // The fork versions as `x.y.z-CMR-Fork`, which semver treats as a pre-release,
  // so pre-releases must be allowed for the comparison to offer them.
  autoUpdater.allowPrerelease = true;

  autoUpdater.removeAllListeners();

  autoUpdater.on('error', (error) => {
    logger.error('Auto-update error.', { error: (error?.stack || error)?.toString() });
    isHandlingUpdate = false;
  });

  autoUpdater.on('update-available', async (info) => {
    logger.info('Update available.', { version: info.version });
    const { response } = await dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Update available',
      message: `A new version of Nora (CMR Fork) is available: v${info.version}`,
      detail:
        'You are on v' +
        autoUpdater.currentVersion.version +
        '. Nora will download the update, close, install it silently, and reopen automatically.',
      buttons: ['Update now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });

    if (response === 0) autoUpdater.downloadUpdate();
    else isHandlingUpdate = false;
  });

  autoUpdater.on('update-not-available', () => {
    logger.info('No updates available. App is up-to-date.');
    isHandlingUpdate = false;
  });

  autoUpdater.on('download-progress', (progress) => {
    logger.debug('Downloading update…', { percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('Update downloaded. Installing silently and restarting Nora.', {
      version: info.version
    });

    // electron-updater maps these arguments to NSIS `/S` and `--force-run`.
    // Its own `--updated` flag preserves the existing install location and
    // shortcuts, which keeps the Windows taskbar pin attached to the same AUMID.
    autoUpdater.quitAndInstall(true, true);
  });

  try {
    return await autoUpdater.checkForUpdates();
  } catch (error) {
    logger.error('Failed to check for updates.', { error });
    isHandlingUpdate = false;
    return null;
  }
}
