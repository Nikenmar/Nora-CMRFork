import logger from './logger';

export default async function checkForUpdates() {
  logger.info('Update checking is disabled in CMR Fork');
  return null;
}
