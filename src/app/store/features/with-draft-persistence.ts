import { inject } from '@angular/core';
import {
  getState,
  patchState,
  signalStoreFeature,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { StorageService } from '../../shared/storage.service';

interface PersistenceState {
  lastSavedAt: string | null;
}

/**
 * Reusable persistence mechanism. The store decides *when* to persist (which
 * events trigger it); this feature owns *how*: serialize the whole state via
 * StorageService, rehydrate it on init, and clear it. StorageService handles
 * JSON (de)serialization and SSR safety, so there are no window guards here.
 *
 * `lastSavedAt` doubles as the autosave indicator for the UI.
 */
export function withDraftPersistence(storageKey: string) {
  return signalStoreFeature(
    withState<PersistenceState>({ lastSavedAt: null }),
    withMethods((store) => {
      const storage = inject(StorageService);
      return {
        persistNow(): void {
          storage.setItem(storageKey, getState(store));
          patchState(store, { lastSavedAt: new Date().toISOString() });
        },
        clearStorage(): void {
          storage.removeItem(storageKey);
          patchState(store, { lastSavedAt: null });
        },
      };
    }),
    withHooks({
      onInit(store) {
        const storage = inject(StorageService);
        // Keys match the store's state shape (draft, entity keys, nav, etc.),
        // so a single patch rehydrates everything including sources entities.
        const snapshot = storage.getItem<PersistenceState>(storageKey);
        if (snapshot && typeof snapshot === 'object') {
          patchState(store, snapshot);
        }
      },
    }),
  );
}
