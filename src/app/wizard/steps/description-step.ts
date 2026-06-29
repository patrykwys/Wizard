import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import { LucideAngularModule } from 'lucide-angular';
import { injectDispatch } from '@ngrx/signals/events';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { FieldError } from '../../shared/field-error';
import { TagInput } from '../../shared/tag-input';
import { ICONS } from '../../shared/icons';

const MAX_DESCRIPTION = 1000;
const URL_RE = /^https?:\/\/.+/;

@Component({
  selector: 'app-description-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldError, TagInput, LucideAngularModule],
  templateUrl: './description-step.html',
  styles: [
    `
      .doc-list {
        list-style: none;
        margin: var(--space-5) 0;
        padding: 0;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        overflow: hidden;
      }
      .doc-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-4);
        padding: var(--space-5) var(--space-6);
        border-bottom: 1px solid var(--color-divider);
      }
      .doc-item:last-child { border-bottom: none; }
      .doc-item-main { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
      .doc-item-title { font-weight: var(--font-weight-medium); }
      .doc-item-link { font-size: var(--font-size-sm); color: var(--color-primary); overflow: hidden; text-overflow: ellipsis; }
      .doc-link-row { display: flex; align-items: center; gap: var(--space-4); margin-top: var(--space-4); }
      .doc-link { flex: 1; }
      .doc-add { flex: none; }
      .doc-remove { flex: none; color: var(--color-text-muted); font-size: var(--font-size-lg); line-height: 1; }
      .doc-remove:hover { color: var(--color-danger); }
      .char-count { display: block; margin-top: var(--space-3); font-size: var(--font-size-xs); color: var(--color-text-muted); text-align: right; }
      .char-count.is-limit { color: var(--color-danger); }
    `,
  ],
})
export class DescriptionStep {
  private readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);
  protected readonly icons = ICONS;
  protected readonly maxDescription = MAX_DESCRIPTION;

  protected readonly model = linkedSignal(() => this.store.draft().description);

  protected readonly descForm = form(this.model, (p) => {
    required(p.description, { message: 'A description is required' });
    maxLength(p.description, MAX_DESCRIPTION, {
      message: `Keep it under ${MAX_DESCRIPTION} characters`,
    });
  });

  protected readonly descriptionCount = computed(() => this.model().description.length);

  // The single document-link entry (separate from the saved list).
  protected readonly docTitle = signal('');
  protected readonly docLink = signal('');
  protected readonly canAddLink = computed(() => URL_RE.test(this.docLink().trim()));

  private readonly sync = effect(() => {
    this.dispatch.draftPatched({ description: this.model() });
  });

  protected setTags(tags: string[]): void {
    this.model.update((m) => ({ ...m, tags }));
  }

  protected addLink(): void {
    if (!this.canAddLink()) {
      return;
    }
    this.model.update((m) => ({
      ...m,
      documents: [...m.documents, { title: this.docTitle().trim(), link: this.docLink().trim() }],
    }));
    this.docTitle.set('');
    this.docLink.set('');
  }

  protected removeDocument(index: number): void {
    this.model.update((m) => ({
      ...m,
      documents: m.documents.filter((_, i) => i !== index),
    }));
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
