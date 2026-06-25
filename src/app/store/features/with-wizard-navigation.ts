import { computed } from '@angular/core';
import {
  patchState,
  signalStoreFeature,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { PageMeta, ProductPage } from '../../models/product.model';

interface NavState {
  currentPage: ProductPage;
  completedPages: ProductPage[];
}

/**
 * Reusable wizard navigation. Owns the current step, the set of completed
 * steps, and derived progress. `completedPages` is updated by the store's
 * reducer (via the `pageCompleted` event) and read here for progress + gating.
 */
export function withWizardNavigation(pages: readonly PageMeta[]) {
  const order = pages.map((p) => p.id);

  return signalStoreFeature(
    withState<NavState>({ currentPage: order[0], completedPages: [] }),
    withComputed((store) => ({
      currentIndex: computed(() => order.indexOf(store.currentPage())),
      isFirst: computed(() => order.indexOf(store.currentPage()) === 0),
      isLast: computed(
        () => order.indexOf(store.currentPage()) === order.length - 1,
      ),
      progress: computed(() =>
        Math.round(
          ((order.indexOf(store.currentPage()) + 1) / order.length) * 100,
        ),
      ),
    })),
    withMethods((store) => ({
      goTo(page: ProductPage): void {
        patchState(store, { currentPage: page });
      },
      next(): void {
        const i = order.indexOf(store.currentPage());
        if (i < order.length - 1) {
          patchState(store, { currentPage: order[i + 1] });
        }
      },
      prev(): void {
        const i = order.indexOf(store.currentPage());
        if (i > 0) {
          patchState(store, { currentPage: order[i - 1] });
        }
      },
    })),
  );
}
