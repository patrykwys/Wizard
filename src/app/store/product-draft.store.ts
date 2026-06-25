import { computed, inject } from '@angular/core';
import {
  signalStore,
  type,
  withComputed,
  withState,
} from '@ngrx/signals';
import {
  entityConfig,
  removeAllEntities,
  setAllEntities,
  withEntities,
} from '@ngrx/signals/entities';
import { Events, on, withEventHandlers, withReducer } from '@ngrx/signals/events';
import { debounceTime, merge, tap } from 'rxjs';
import {
  INITIAL_DRAFT,
  PAGES,
  ProductDraft,
  REQUIRED_PAGES,
  SourceItem,
} from '../models/product.model';
import { withDraftPersistence } from './features/with-draft-persistence';
import { withWizardNavigation } from './features/with-wizard-navigation';
import { wizardEvents } from './wizard.events';

const STORAGE_KEY = 'product-wizard-draft-v1';

export const sourceConfig = entityConfig({
  entity: type<SourceItem>(),
  collection: 'sources',
  selectId: (s) => s.id,
});

export const ProductDraftStore = signalStore(
  // 1. Navigation: currentPage, completedPages, progress, next/prev/goTo.
  withWizardNavigation(PAGES),

  // 2. The serializable draft (sources live in the entity collection below).
  withState<{ draft: ProductDraft }>({ draft: INITIAL_DRAFT }),

  // 3. Repeatable sub-collection -> entities (keyed add/remove/reorder).
  withEntities(sourceConfig),

  // 4. Derived state for gating + review.
  withComputed((store) => ({
    allRequiredComplete: computed(() =>
      REQUIRED_PAGES.every((p) => store.completedPages().includes(p)),
    ),
  })),

  // 5. Events -> state transitions. Pages never mutate state directly.
  withReducer(
    // Merge a page's section into the draft. `payload` carries the same object
    // refs the page holds, so the store/linkedSignal round-trip stays stable.
    on(wizardEvents.draftPatched, ({ payload }, state) => ({
      draft: { ...state.draft, ...payload },
    })),

    // Sources committed as a whole array.
    on(wizardEvents.sourcesChanged, ({ payload }) =>
      setAllEntities(payload, sourceConfig),
    ),

    // Mark a page complete (dedup).
    on(wizardEvents.pageCompleted, ({ payload }, state) => ({
      completedPages: state.completedPages.includes(payload)
        ? state.completedPages
        : [...state.completedPages, payload],
    })),

    // Reset everything after a successful submit.
    on(wizardEvents.cleared, () => [
      { draft: INITIAL_DRAFT, completedPages: [], currentPage: PAGES[0].id },
      removeAllEntities(sourceConfig),
    ]),
  ),

  // 6. Persistence mechanism (hydrate on init, persistNow, clearStorage).
  withDraftPersistence(STORAGE_KEY),

  // 7. The autosave side effect: persist after any meaningful change, debounced.
  //    This is where the "save in case of emergency" guarantee lives.
  withEventHandlers((store, events = inject(Events)) => ({
    autosave$: merge(
      events.on(
        wizardEvents.draftPatched,
        wizardEvents.sourcesChanged,
        wizardEvents.pageCompleted,
        wizardEvents.saveRequested,
      ),
    ).pipe(
      debounceTime(400),
      tap(() => store.persistNow()),
    ),
    clearOnReset$: events.on(wizardEvents.cleared).pipe(
      tap(() => store.clearStorage()),
    ),
  })),
);
