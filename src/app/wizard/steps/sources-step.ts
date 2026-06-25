import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  applyEach,
  form,
  FormField,
  required,
  submit,
} from '@angular/forms/signals';
import { injectDispatch } from '@ngrx/signals/events';
import { SourceItem } from '../../models/product.model';
import { LookupStore } from '../../store/lookup.store';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { FieldError } from '../../shared/field-error';

@Component({
  selector: 'app-sources-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldError],
  templateUrl: './sources-step.html',
})
export class SourcesStep {
  private readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);
  protected readonly lookups = inject(LookupStore);

  // Plain signal, NOT linkedSignal: `sourcesEntities()` returns a fresh array
  // reference on every read, so a linkedSignal working copy would re-seed and
  // feed the autosave effect forever. The component is created on entry (after
  // hydrate), so a one-time seed is correct.
  protected readonly model = signal<{ items: SourceItem[] }>({
    items: this.store.sourcesEntities(),
  });

  protected readonly expanded = signal<string[]>([]);

  protected readonly sourcesForm = form(this.model, (p) => {
    applyEach(p.items, (item) => {
      required(item.kind, { message: 'Pick a type' });
      required(item.location, { message: 'Location is required' });
    });
  });

  private readonly sync = effect(() => {
    this.dispatch.sourcesChanged(this.model().items);
  });

  protected isOpen(id: string): boolean {
    return this.expanded().includes(id);
  }

  protected toggle(id: string): void {
    this.expanded.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  protected add(): void {
    const id = crypto.randomUUID();
    this.model.update((m) => ({
      items: [...m.items, { id, kind: '', location: '', note: '' }],
    }));
    this.expanded.update((ids) => [...ids, id]);
  }

  protected remove(index: number): void {
    this.model.update((m) => ({
      items: m.items.filter((_, i) => i !== index),
    }));
  }

  protected next(): void {
    submit(this.sourcesForm, async () => {
      this.dispatch.pageCompleted('sources');
      this.store.next();
    });
  }

  protected back(): void {
    this.store.prev();
  }
}
