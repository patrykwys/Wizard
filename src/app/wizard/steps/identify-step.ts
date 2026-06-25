import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  linkedSignal,
} from '@angular/core';
import { form, FormField, submit, validate } from '@angular/forms/signals';
import { injectDispatch } from '@ngrx/signals/events';
import { TaxonomySelection } from '../../models/product.model';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { FieldError } from '../../shared/field-error';
import { TaxonomyPicker } from '../../shared/taxonomy-picker';

@Component({
  selector: 'app-identify-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldError, TaxonomyPicker],
  templateUrl: './identify-step.html',
  styles: [
    `
      .identify-or {
        display: block;
        margin: var(--space-7) 0;
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-secondary);
      }
    `,
  ],
})
export class IdentifyStep {
  private readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);

  protected readonly model = linkedSignal(() => this.store.draft().identify);

  protected readonly identifyForm = form(this.model, (p) => {
    // Need an Application ID or at least one taxonomy category.
    validate(p, ({ value }) => {
      const v = value();
      return v.appId.trim().length || v.categories.length
        ? undefined
        : {
            kind: 'required',
            message:
              'Enter an Application ID or choose at least one taxonomy category',
          };
    });
  });

  private readonly sync = effect(() => {
    this.dispatch.draftPatched({ identify: this.model() });
  });

  protected setCategories(categories: TaxonomySelection[]): void {
    this.model.update((m) => ({ ...m, categories }));
  }

  protected next(): void {
    submit(this.identifyForm, async () => {
      this.dispatch.pageCompleted('identify');
      this.store.next();
    });
  }
}
