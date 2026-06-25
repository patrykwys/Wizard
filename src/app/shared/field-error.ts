import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Field } from '@angular/forms/signals';

/**
 * Shows the first validation error for a Signal Forms field, once touched.
 * Replaces the repeated `@if (f().touched() && f().errors().length)` markup.
 * Generic over the field's value type so it stays fully type-checked.
 */
@Component({
  selector: 'app-field-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let state = field()();
    @if (state.touched() && state.errors().length) {
      <span class="field-error">{{ state.errors()[0]?.message }}</span>
    }
  `,
})
export class FieldError<T> {
  readonly field = input.required<Field<T>>();
}
