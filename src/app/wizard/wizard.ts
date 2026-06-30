import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { injectDispatch, provideDispatcher } from '@ngrx/signals/events';
import { PAGES } from '../models/product.model';
import { ProductDraftStore } from '../store/product-draft.store';
import { wizardEvents } from '../store/wizard.events';
import { IdentifyStep } from './steps/identify-step';
import { BasicStep } from './steps/basic-step';
import { DescriptionStep } from './steps/description-step';
import { SourcesStep } from './steps/sources-step';
import { AccessStep } from './steps/access-step';
import { ReviewStep } from './steps/review-step';

@Component({
  selector: 'app-wizard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IdentifyStep,
    BasicStep,
    DescriptionStep,
    SourcesStep,
    AccessStep,
    ReviewStep,
  ],
  templateUrl: './wizard.html',
  styleUrl: './wizard.scss',
})
export class Wizard {
  protected readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);

  protected readonly pages = PAGES;

  protected readonly savedLabel = computed(() => {
    const at = this.store.lastSavedAt();
    if (!at) {
      return 'Not saved yet';
    }
    return `Saved ${new Date(at).toLocaleTimeString()}`;
  });

  protected goTo(page: (typeof PAGES)[number]['id']): void {
    this.store.goTo(page);
  }

  protected save(): void {
    this.dispatch.saveRequested();
  }
}
