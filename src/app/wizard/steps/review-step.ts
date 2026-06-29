import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { injectDispatch } from '@ngrx/signals/events';
import { LucideAngularModule } from 'lucide-angular';
import {
  ProductDraft,
  ProductPage,
  SourceItem,
} from '../../models/product.model';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { ICONS } from '../../shared/icons';

// Exactly what gets submitted: the whole draft plus the sources collection.
type ProductSubmission = ProductDraft & { sources: SourceItem[] };

@Component({
  selector: 'app-review-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './review-step.html',
  styles: [
    `
      .btn-edit {
        display: inline-flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-2) var(--space-5);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-button);
        background: var(--color-card-bg);
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        transition: var(--transition-quick);
      }
      .btn-edit:hover { border-color: var(--color-primary); color: var(--color-primary); }

      .review-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-5) var(--space-7);
      }
      .review-cell { display: flex; flex-direction: column; gap: var(--space-1); }

      .review-assets { display: flex; flex-direction: column; gap: var(--space-5); }
      .review-asset {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-inner);
        padding: var(--space-6);
        background: var(--color-surface-muted);
      }
      .review-asset-head {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        margin-bottom: var(--space-4);
      }
      .review-asset-num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--size-icon-md);
        height: var(--size-icon-md);
        border-radius: var(--radius-circle);
        background: var(--color-primary);
        color: var(--color-text-on-dark);
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-semibold);
        flex: none;
      }
      .review-asset-kind { font-weight: var(--font-weight-semibold); }
      .review-asset-meta { color: var(--color-text-secondary); font-size: var(--font-size-sm); }

      .submission {
        margin-top: var(--space-9);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-inner);
        overflow: hidden;
      }
      .submission-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-5) var(--space-7);
        background: var(--color-action-tint);
        border-bottom: 1px solid var(--color-border);
      }
      .submission-title { font-weight: var(--font-weight-semibold); color: var(--color-primary); }
      .submission-json {
        margin: 0;
        padding: var(--space-7);
        max-height: 420px;
        overflow: auto;
        background: var(--color-text-primary);
        color: #e6f4ea;
        font-family: var(--font-family-mono);
        font-size: var(--font-size-sm);
        line-height: var(--line-height-normal);
        white-space: pre;
      }
      .ack {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        margin-top: var(--space-9);
        padding: var(--space-6) var(--space-7);
        background: var(--color-action-tint);
        border: 1px solid var(--color-primary);
        border-radius: var(--radius-md);
        font-weight: var(--font-weight-medium);
      }
      .ack input { width: var(--size-icon-sm); height: var(--size-icon-sm); accent-color: var(--color-primary); }
    `,
  ],
})
export class ReviewStep {
  protected readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);
  protected readonly icons = ICONS;

  protected readonly identifyCategoryLabels = computed(() =>
    this.store
      .draft()
      .identify.categories.map((c) => c.path[c.path.length - 1])
      .join(', '),
  );

  protected readonly documentTitles = computed(() =>
    this.store
      .draft()
      .description.documents.map((d) => d.title || d.link)
      .join(', '),
  );

  // Null until Submit is pressed; then holds the exact payload, shown as JSON.
  protected readonly submitted = signal<ProductSubmission | null>(null);
  protected readonly acknowledged = signal(false);
  protected readonly submittedJson = computed(() => {
    const payload = this.submitted();
    return payload ? JSON.stringify(payload, null, 2) : '';
  });

  protected edit(page: ProductPage): void {
    this.store.goTo(page);
  }

  // "kind · platform", skipping any empty part.
  protected assetMeta(s: SourceItem): string {
    return [s.kind, s.platform].filter((v) => v).join(' · ');
  }

  protected submit(): void {
    const draft = this.store.draft();
    const payload: ProductSubmission = {
      ...draft,
      description: {
        ...draft.description,
        documents: draft.description.documents.filter(
          (d) => d.title.trim() || d.link.trim(),
        ),
      },
      sources: this.store.sourcesEntities(),
    };
    // A real app would POST `payload` here. For the POC, surface it.
    console.log('Submitting product registration:', payload);
    this.submitted.set(payload);
  }

  protected async copyJson(): Promise<void> {
    await navigator.clipboard?.writeText(this.submittedJson());
  }

  protected startAnother(): void {
    this.submitted.set(null);
    this.acknowledged.set(false);
    this.dispatch.cleared();
  }
}
