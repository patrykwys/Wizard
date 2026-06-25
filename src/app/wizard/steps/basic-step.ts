import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  linkedSignal,
} from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { injectDispatch } from '@ngrx/signals/events';
import { Person } from '../../models/product.model';
import { LookupStore } from '../../store/lookup.store';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { FieldError } from '../../shared/field-error';
import { PeoplePicker } from '../../shared/people-picker';

@Component({
  selector: 'app-basic-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldError, PeoplePicker],
  templateUrl: './basic-step.html',
})
export class BasicStep {
  private readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);
  protected readonly lookups = inject(LookupStore);

  // Writable working copy. linkedSignal re-seeds if the store changes underneath
  // (hydrate completing, or jumping back here from Review).
  protected readonly model = linkedSignal(() => this.store.draft().basic);

  protected readonly basicForm = form(this.model, (p) => {
    required(p.name, { message: 'Name is required' });
    required(p.type, { message: 'Type is required' });
    required(p.creator, { message: 'Creator is required' });
    required(p.ownership, { message: 'Ownership is required' });
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

  protected setCreator(person: Person): void {
    this.model.update((m) => ({ ...m, creator: person.name }));
  }

  protected back(): void {
    this.store.prev();
  }
}
