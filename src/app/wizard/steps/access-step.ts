import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  linkedSignal,
} from '@angular/core';
import { form, required, submit } from '@angular/forms/signals';
import { LucideAngularModule } from 'lucide-angular';
import { ICONS } from '../../shared/icons';
import { injectDispatch } from '@ngrx/signals/events';
import {
  Classification,
  COMPLIANCE_TAGS,
  Visibility,
} from '../../models/product.model';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { FieldError } from '../../shared/field-error';
import { TagInput } from '../../shared/tag-input';
import { AdGroupPicker } from '../../shared/ad-group-picker';

@Component({
  selector: 'app-access-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldError, TagInput, AdGroupPicker, LucideAngularModule],
  templateUrl: './access-step.html',
  styles: [
    `
      .classification-card .option-card-title { text-transform: capitalize; }

      .proc-list { display: flex; flex-direction: column; gap: var(--space-5); }
      .proc-card {
        display: flex;
        align-items: flex-start;
        gap: var(--space-5);
        width: 100%;
        padding: var(--space-6) var(--space-7);
        text-align: left;
        background: var(--color-card-bg);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-inner);
        transition: var(--transition-quick);
      }
      .proc-card:hover { border-color: var(--color-primary); }
      .proc-card.is-selected { border-color: var(--color-primary); box-shadow: var(--shadow-selected-ring); }
      .proc-card:focus-visible {
        outline: var(--focus-outline-width) solid var(--color-focus);
        outline-offset: var(--focus-outline-offset);
      }
      .proc-radio {
        flex: none;
        width: var(--size-icon-sm);
        height: var(--size-icon-sm);
        margin-top: 2px;
        border: 2px solid var(--color-border);
        border-radius: var(--radius-circle);
        transition: var(--transition-quick);
      }
      .proc-radio.is-on {
        border-color: var(--color-primary);
        background:
          radial-gradient(circle at center, var(--color-primary) 0 5px, transparent 6px);
      }
      .proc-text { display: flex; flex-direction: column; gap: var(--space-2); }
      .proc-title { font-weight: var(--font-weight-semibold); }
      .proc-desc { color: var(--color-text-secondary); font-size: var(--font-size-sm); }
      .proc-nested {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: 0 var(--space-2) var(--space-2) var(--space-9);
      }
    `,
  ],
})
export class AccessStep {
  protected readonly icons = ICONS;
  private readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);

  protected readonly model = linkedSignal(() => this.store.draft().access);

  protected readonly classifications = [
    'public',
    'internal',
    'confidential',
    'restricted',
  ] as const;

  protected readonly complianceTags = COMPLIANCE_TAGS;

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

  protected toggleCompliance(tag: string): void {
    this.model.update((m) => ({
      ...m,
      compliance: m.compliance.includes(tag)
        ? m.compliance.filter((t) => t !== tag)
        : [...m.compliance, tag],
    }));
  }

  protected setAccessProcess(accessProcess: 'approval' | 'auto'): void {
    this.model.update((m) => ({
      ...m,
      accessProcess,
      // Clear the AD group when approval isn't required.
      adGroup: accessProcess === 'approval' ? m.adGroup : '',
    }));
  }

  protected setAdGroup(adGroup: string): void {
    this.model.update((m) => ({ ...m, adGroup }));
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
