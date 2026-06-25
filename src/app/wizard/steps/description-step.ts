import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  linkedSignal,
} from '@angular/core';
import {
  form,
  FormField,
  maxLength,
  pattern,
  required,
  submit,
} from '@angular/forms/signals';
import { injectDispatch } from '@ngrx/signals/events';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { FieldError } from '../../shared/field-error';
import { TagInput } from '../../shared/tag-input';

@Component({
  selector: 'app-description-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldError, TagInput],
  templateUrl: './description-step.html',
})
export class DescriptionStep {
  private readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);

  protected readonly model = linkedSignal(() => this.store.draft().description);

  protected readonly descForm = form(this.model, (p) => {
    required(p.description, { message: 'A description is required' });
    maxLength(p.description, 500, { message: 'Keep it under 500 characters' });
    pattern(p.url, /^https?:\/\/.+/, {
      message: 'Must start with http:// or https://',
    });
  });

  private readonly sync = effect(() => {
    this.dispatch.draftPatched({ description: this.model() });
  });

  protected setTags(tags: string[]): void {
    this.model.update((m) => ({ ...m, tags }));
  }

  protected next(): void {
    submit(this.descForm, async () => {
      this.dispatch.pageCompleted('description');
      this.store.next();
    });
  }

  protected back(): void {
    this.store.prev();
  }
}
