import { type } from '@ngrx/signals';
import { eventGroup } from '@ngrx/signals/events';
import { ProductDraft, ProductPage, SourceItem } from '../models/product.model';

// A single, readable inventory of everything that can happen in the wizard.
// Pages dispatch these; the store decides what each one does.
export const wizardEvents = eventGroup({
  source: 'Product Wizard',
  events: {
    // Fired continuously as a page is edited (drives autosave). Pass-through
    // section refs keep the store/linkedSignal round-trip stable. Typed as a
    // Partial of the whole draft so new sections need no change here.
    draftPatched: type<Partial<ProductDraft>>(),

    // Sources are an entity collection; committed as a whole array.
    sourcesChanged: type<SourceItem[]>(),

    // Marks a page valid + done (gates navigation / submit).
    pageCompleted: type<ProductPage>(),

    // Explicit "Save draft" button.
    saveRequested: type<void>(),

    // Final submit succeeded -> clear everything.
    cleared: type<void>(),
  },
});
