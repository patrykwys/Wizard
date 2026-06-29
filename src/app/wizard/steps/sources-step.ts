import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { applyEach, form, FormField, required, submit } from '@angular/forms/signals';
import { LucideAngularModule } from 'lucide-angular';
import { injectDispatch } from '@ngrx/signals/events';
import { INITIAL_DELIVERY, SourceItem } from '../../models/product.model';
import { LookupStore } from '../../store/lookup.store';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { FieldError } from '../../shared/field-error';
import { ICONS } from '../../shared/icons';

function blankSource(): SourceItem {
  return { id: crypto.randomUUID(), name: '', kind: '', platform: '', location: '', note: '' };
}

@Component({
  selector: 'app-sources-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldError, LucideAngularModule],
  templateUrl: './sources-step.html',
  styles: [
    `
      .asset-card {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-inner);
        margin-bottom: var(--space-6);
        overflow: hidden;
      }
      .asset-head {
        display: flex;
        align-items: center;
        gap: var(--space-5);
        padding: var(--space-5) var(--space-7);
        background: var(--color-surface-muted);
        border-bottom: 1px solid var(--color-border);
        cursor: pointer;
        user-select: none;
      }
      .asset-caret {
        display: inline-flex;
        color: var(--color-text-secondary);
        transition: transform var(--duration-quick) var(--ease-standard);
      }
      .asset-caret.is-open { transform: rotate(90deg); }
      .asset-num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--size-icon-lg);
        height: var(--size-icon-lg);
        border-radius: var(--radius-circle);
        background: var(--color-primary);
        color: var(--color-text-on-dark);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        flex: none;
      }
      .asset-title { font-weight: var(--font-weight-semibold); }
      .asset-pill {
        padding: var(--space-2) var(--space-5);
        background: var(--color-card-bg);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-pill);
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
      }
      .asset-remove {
        margin-left: auto;
        color: var(--color-text-muted);
        font-size: var(--font-size-lg);
        line-height: 1;
      }
      .asset-remove:hover { color: var(--color-danger); }
      .asset-body { padding: var(--space-7); }

      .delivery {
        margin-top: var(--space-10);
        padding-top: var(--space-9);
        border-top: 1px solid var(--color-divider);
      }
      .delivery-title {
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-semibold);
        margin-bottom: var(--space-2);
      }
      .delivery-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: var(--space-6);
        margin-top: var(--space-6);
      }
    `,
  ],
})
export class SourcesStep {
  private readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);
  protected readonly lookups = inject(LookupStore);
  protected readonly icons = ICONS;

  // Always start with at least one open asset (no click-to-add for the first).
  protected readonly model = signal<{ items: SourceItem[] }>({
    items: this.store.sourcesEntities().length
      ? this.store.sourcesEntities()
      : [blankSource()],
  });

  // Collapsible state: ids of expanded cards (everything open by default).
  protected readonly expanded = signal<string[]>(this.model().items.map((i) => i.id));

  protected isOpen(id: string): boolean {
    return this.expanded().includes(id);
  }

  protected toggleOpen(id: string): void {
    this.expanded.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  protected readonly sourcesForm = form(this.model, (p) => {
    applyEach(p.items, (item) => {
      required(item.kind, { message: 'Pick an asset type' });
      required(item.platform, { message: 'Pick a platform / tool' });
    });
  });

  private readonly syncSources = effect(() => {
    this.dispatch.sourcesChanged(this.model().items);
  });

  // --- Page-level delivery / refresh (NOT part of the collection) ------------
  protected readonly delivery = linkedSignal(
    () => this.store.draft().delivery ?? INITIAL_DELIVERY,
  );
  protected readonly deliveryForm = form(this.delivery);
  protected readonly isScheduled = computed(
    () => this.delivery().refreshFrequency === 'Scheduled',
  );

  protected readonly refreshFrequencies = [
    'Real-time', 'Hourly', 'Daily', 'Weekly', 'Monthly', 'Scheduled', 'On-demand',
  ];
  protected readonly refreshMethods = [
    'Full load', 'Incremental', 'Change data capture (CDC)', 'Snapshot', 'Append',
  ];
  protected readonly slaTargets = ['99.9%', '99.5%', '99.0%', '95.0%', 'Best effort', 'None'];
  protected readonly dataLags = [
    'None (real-time)', 'Under 1 hour', '1–4 hours', 'Up to 24 hours', '1–2 days', 'Over 2 days',
  ];

  private readonly syncDelivery = effect(() => {
    this.dispatch.draftPatched({ delivery: this.delivery() });
  });

  // --- Collection actions ----------------------------------------------------
  protected add(): void {
    const item = blankSource();
    this.model.update((m) => ({ items: [...m.items, item] }));
    this.expanded.update((ids) => [...ids, item.id]); // new card opens
  }

  protected remove(index: number): void {
    const removed = this.model().items[index];
    this.model.update((m) => ({ items: m.items.filter((_, i) => i !== index) }));
    this.expanded.update((ids) => ids.filter((id) => id !== removed.id));
  }

  protected resetPlatform(index: number): void {
    this.model.update((m) => ({
      items: m.items.map((it, i) => (i === index ? { ...it, platform: '' } : it)),
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
