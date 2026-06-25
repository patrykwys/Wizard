import {
  getState,
  patchState,
  signalStoreFeature,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

interface PersistenceState {
  lastSavedAt: string | null;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

/**
 * Reusable persistence mechanism. The store decides *when* to persist (which
 * events trigger it); this feature owns *how*: serialize the whole state to
 * localStorage, rehydrate it on init, and clear it.
 *
 * `lastSavedAt` doubles as the autosave indicator for the UI.
 */
export function withDraftPersistence(storageKey: string) {
  return signalStoreFeature(
    withState<PersistenceState>({ lastSavedAt: null }),
    withMethods((store) => ({
      persistNow(): void {
        if (!canUseStorage()) {
          return;
        }
        const snapshot = getState(store);
        window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
        patchState(store, { lastSavedAt: new Date().toISOString() });
      },
      clearStorage(): void {
        if (canUseStorage()) {
          window.localStorage.removeItem(storageKey);
        }
        patchState(store, { lastSavedAt: null });
      },
    })),
    withHooks({
      onInit(store) {
        if (!canUseStorage()) {
          return;
        }
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
          return;
        }
        try {
          // Keys match the store's state shape (draft, entity keys, nav, etc.),
          // so a single patch rehydrates everything including sources entities.
          patchState(store, JSON.parse(raw));
        } catch {
          window.localStorage.removeItem(storageKey);
        }
      },
    }),
  );
}
