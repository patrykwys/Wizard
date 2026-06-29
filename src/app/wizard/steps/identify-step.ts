import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { form, FormField, submit, validate } from '@angular/forms/signals';
import { injectDispatch } from '@ngrx/signals/events';
import { ProductHit, TaxonomySelection } from '../../models/product.model';
import { LookupStore } from '../../store/lookup.store';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { FieldError } from '../../shared/field-error';
import { TaxonomyPicker } from '../../shared/taxonomy-picker';
import { ICONS } from '../../shared/icons';
import { LucideAngularModule } from 'lucide-angular';

interface SearchKey {
  appId: string;
  ids: string[];
}

@Component({
  selector: 'app-identify-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldError, TaxonomyPicker, LucideAngularModule],
  templateUrl: './identify-step.html',
  styles: [
    `
      .identify-bar {
        display: flex;
        align-items: flex-end;
        flex-wrap: wrap;
        gap: var(--space-6);
      }
      .identify-field { display: flex; flex-direction: column; }
      .identify-appid { width: 220px; }
      .identify-grow { flex: 1; min-width: 260px; }
      .identify-or {
        padding-bottom: var(--space-4);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-secondary);
      }
      .identify-actions { display: flex; align-items: flex-end; gap: var(--space-3); }
      .identify-tip {
        margin: var(--space-7) 0;
        padding: var(--space-5) var(--space-6);
        background: var(--color-surface-muted);
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
      }
      .results { margin-top: var(--space-7); }
      .results-count { font-weight: var(--font-weight-semibold); margin-bottom: var(--space-5); }
      .result-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: var(--space-6) var(--space-7);
        margin-bottom: var(--space-4);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-inner);
        text-align: left;
        transition: var(--transition-quick);
      }
      .result-row:hover { border-color: var(--color-primary); }
      .result-row.is-selected { border-color: var(--color-primary); background: var(--color-action-tint); }
      .result-main { display: flex; flex-direction: column; gap: var(--space-1); }
      .result-name { font-weight: var(--font-weight-semibold); }
      .result-meta { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
      .result-select { color: var(--color-primary); font-weight: var(--font-weight-medium); }
      .results-create {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-6);
        margin-top: var(--space-5);
        padding: var(--space-7);
        border: 1px dashed var(--color-border-dashed);
        border-radius: var(--radius-inner);
      }
      .picker-empty { padding: var(--space-6); color: var(--color-text-secondary); font-size: var(--font-size-sm); }
    `,
  ],
})
export class IdentifyStep {
  protected readonly icons = ICONS;
  private readonly store = inject(ProductDraftStore);
  private readonly lookups = inject(LookupStore);
  private readonly dispatch = injectDispatch(wizardEvents);

  protected readonly model = linkedSignal(() => this.store.draft().identify);

  protected readonly identifyForm = form(this.model, (p) => {
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

  private readonly searchKey = signal<SearchKey | undefined>(undefined);

  protected readonly results = rxResource<ProductHit[], SearchKey | undefined>({
    defaultValue: [],
    params: () => this.searchKey(),
    stream: ({ params }) => this.lookups.searchProducts(params.appId, params.ids),
  });

  protected readonly searched = computed(() => this.searchKey() !== undefined);

  private readonly sync = effect(() => {
    this.dispatch.draftPatched({ identify: this.model() });
  });

  protected setCategories(categories: TaxonomySelection[]): void {
    this.model.update((m) => ({ ...m, categories }));
  }

  protected search(): void {
    this.searchKey.set({
      appId: this.model().appId,
      ids: this.model().categories.map((c) => c.id),
    });
  }

  protected clear(): void {
    this.model.set({ appId: '', categories: [] });
    this.searchKey.set(undefined);
  }

  protected selectProduct(product: ProductHit): void {
    this.model.update((m) => ({ ...m, appId: product.appId }));
  }

  protected createNew(): void {
    this.dispatch.pageCompleted('identify');
    this.store.next();
  }

  protected next(): void {
    submit(this.identifyForm, async () => {
      this.dispatch.pageCompleted('identify');
      this.store.next();
    });
  }
}
