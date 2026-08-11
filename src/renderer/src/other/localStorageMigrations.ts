import type { MigrationData } from '../utils/localStorage';
import { LOCAL_STORAGE_DEFAULT_TEMPLATE } from './appReducer';

const localStorageMigrationData: MigrationData = {
  '2.4.2-stable': (storage) => {
    storage.equalizerPreset = LOCAL_STORAGE_DEFAULT_TEMPLATE.equalizerPreset;
    return storage;
  },
  /*
    Predictive search is gone — there is one search now. Anyone who had the
    toggle on carries a dead flag that would otherwise sit in their store
    forever, so it is dropped here rather than merely ignored.
  */
  '3.4.5-CMR-Fork': (storage) => {
    if (storage.preferences && 'isPredictiveSearchEnabled' in storage.preferences)
      delete (storage.preferences as Record<string, unknown>).isPredictiveSearchEnabled;
    return storage;
  }
};

export default localStorageMigrationData;
