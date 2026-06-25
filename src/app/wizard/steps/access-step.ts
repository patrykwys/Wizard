import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  linkedSignal,
} from '@angular/core';
import { form, required, submit } from '@angular/forms/signals';
import { injectDispatch } from '@ngrx/signals/events';
import { Classification, Visibility } from '../../models/product.model';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { FieldError } from '../../shared/field-error';
import { TagInput } from '../../shared/tag-input';

@Component({
  selector: 'app-access-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldError, TagInput],
  templateUrl: './access-step.html',
  styles: [
    `
      .classification-card .option-card-title { text-transform: capitalize; }
    `,
  ],
})
export class AccessStep {
  private readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);

  protected readonly model = linkedSignal(() => this.store.draft().access);

  protected readonly classifications = [
    'public',
    'internal',
    'confidential',
    'restricted',
  ] as const;

  protected readonly accessForm = form(this.model, (p) => {
    required(p.visibility, { message: 'Choose a visibility' });
    required(p.classification, { message: 'Choose a classification' });
  });

  private readonly sync = effect(() => {
    this.dispatch.draftPatched({ access: this.model() });
  });

  protected setVisibility(visibility: Visibility): void {
    this.model.update((m) => ({ ...m, visibility }));
  }

  protected setClassification(classification: Classification): void {
    this.model.update((m) => ({ ...m, classification }));
  }

  protected setTags(tags: string[]): void {
    this.model.update((m) => ({ ...m, tags }));
  }

  protected next(): void {
    submit(this.accessForm, async () => {
      this.dispatch.pageCompleted('access');
      this.store.next();
    });
  }

  protected back(): void {
    this.store.prev();
  }
}
