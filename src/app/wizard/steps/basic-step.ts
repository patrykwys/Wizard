import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  linkedSignal,
} from '@angular/core';
import { form, FormField, pattern, required, submit } from '@angular/forms/signals';
import { LucideAngularModule } from 'lucide-angular';
import { ICONS } from '../../shared/icons';
import { injectDispatch } from '@ngrx/signals/events';
import { AssociateDto } from '../../models/product.model';
import { LookupStore } from '../../store/lookup.store';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { FieldError } from '../../shared/field-error';
import { PeoplePicker } from '../../shared/people-picker';

@Component({
  selector: 'app-basic-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldError, PeoplePicker, LucideAngularModule],
  templateUrl: './basic-step.html',
  styles: [
    `
      .basic-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        column-gap: var(--space-7);
        row-gap: var(--space-8);
      }
      .basic-grid .field { margin-bottom: 0; }
      .basic-grid .span-2 { grid-column: 1 / -1; }
    `,
  ],
})
export class BasicStep {
  protected readonly icons = ICONS;
  private readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);
  protected readonly lookups = inject(LookupStore);

  // Writable working copy. linkedSignal re-seeds if the store changes underneath
  // (hydrate completing, or jumping back here from Review).
  protected readonly model = linkedSignal(() => this.store.draft().basic);

  protected readonly basicForm = form(this.model, (p) => {
    required(p.name, { message: 'Name is required' });
    required(p.type, { message: 'Type is required' });
    required(p.appNumber, { message: 'App number is required' });
    required(p.creator, { message: 'Creator is required' });
    required(p.ownership, { message: 'Ownership is required' });
    // Product link + version are optional; the link just has to look like a URL.
    pattern(p.productLink, /^https?:\/\/.+/, {
      message: 'Must start with http:// or https://',
    });
  });

  // Autosave: push edits into the store on every change (pass-through ref).
  private readonly sync = effect(() => {
    this.dispatch.draftPatched({ basic: this.model() });
  });

  protected next(): void {
    submit(this.basicForm, async () => {
      this.dispatch.pageCompleted('basic');
      this.store.next();
    });
  }

  protected setCreator(associate: AssociateDto): void {
    this.model.update((m) => ({ ...m, creator: associate.fullName }));
  }

  protected back(): void {
    this.store.prev();
  }
}
