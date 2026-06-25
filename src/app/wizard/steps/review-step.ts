import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { injectDispatch } from '@ngrx/signals/events';
import { ProductPage } from '../../models/product.model';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';

@Component({
  selector: 'app-review-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './review-step.html',
})
export class ReviewStep {
  protected readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);

  protected readonly identifyCategoryLabels = computed(() =>
    this.store
      .draft()
      .identify.categories.map((c) => c.path[c.path.length - 1])
      .join(', '),
  );

  protected edit(page: ProductPage): void {
    this.store.goTo(page);
  }

  protected submit(): void {
    // A real app would POST here; on success, reset the wizard.
    this.dispatch.cleared();
  }
}
