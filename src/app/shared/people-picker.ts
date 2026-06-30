import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { inject } from '@angular/core';
import { debounceTime } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { ICONS } from './icons';
import { LookupStore } from '../store/lookup.store';
import { AssociateDto } from '../models/product.model';

/**
 * Typeahead over the corporate directory. Type a corporate id (e.g. g100231)
 * or a name; the dropdown shows the matching user and their role. Reads from
 * LookupStore.searchPeople (swap the mock for the real API there). The selected
 * display name is owned by the parent via `value` in / `valueChange` out.
 *
 * Closing is handled declaratively — Escape, selecting an option, or focus
 * leaving the widget (which covers both tabbing away and clicking another
 * control). No global document listener and no injected ElementRef.
 */
@Component({
  selector: 'app-people-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <div
      #root
      class="picker"
      [class.is-open]="open()"
      (keydown.escape)="close()"
      (focusout)="onFocusOut($event, root)"
    >
      <div class="picker-field">
        <input
          class="picker-input"
          role="combobox"
          aria-autocomplete="list"
          [attr.aria-expanded]="open()"
          [value]="query()"
          (input)="onInput($any($event.target).value)"
          (focus)="onFocus($event)"
          [placeholder]="placeholder()"
        />
        <span class="picker-caret" aria-hidden="true">
          <lucide-icon [img]="icons.ChevronDown" [size]="16" />
        </span>
      </div>

      @if (open()) {
        <ul class="popover" role="listbox">
          @if (!searchTerm()) {
            <li class="picker-empty">Type a name or corporate id…</li>
          } @else if (pending() || results.isLoading()) {
            <li class="picker-empty">Searching…</li>
          } @else if (results.error()) {
            <li class="picker-empty">Couldn’t reach the directory — try again.</li>
          } @else if (results.value().length) {
            @for (associate of results.value(); track associate.corpId) {
              <li>
                <button type="button" class="picker-option" role="option" (mousedown)="$event.preventDefault()" (click)="pick(associate)">
                  <span class="picker-option-primary">{{ associate.fullName }}</span>
                  <span class="picker-option-secondary">{{ associate.jobTitle }}</span>
                </button>
              </li>
            }
          } @else {
            <li class="picker-empty">No matching users.</li>
          }
        </ul>
      }
    </div>
  `,
})
export class PeoplePicker {
  protected readonly icons = ICONS;
  private readonly lookups = inject(LookupStore);

  readonly value = input<string>('');
  readonly placeholder = input('Search by name or corporate id…');
  readonly valueChange = output<AssociateDto>();

  protected readonly open = signal(false);

  // The input text. Mirrors the selected value, but is freely editable while
  // searching — so reopening the picker shows the chosen name, not a blank.
  protected readonly query = linkedSignal(() => this.value());

  // Only an actual, *new* search term (open + typed + different from what's
  // already selected). Reopening on a selected value is not a search.
  protected readonly searchTerm = computed(() => {
    const q = this.query().trim();
    return this.open() && q && q !== this.value().trim() ? q : undefined;
  });

  // Debounce keystrokes before hitting the API (one request per pause, not per
  // key) — important against a 117k-row table.
  private readonly debouncedTerm = toSignal(
    toObservable(this.searchTerm).pipe(debounceTime(250)),
    { initialValue: undefined as string | undefined },
  );

  // True while the user has typed but the debounce hasn't fired yet — lets us
  // show "Searching…" immediately instead of a flash of "No matching users".
  protected readonly pending = computed(
    () => !!this.searchTerm() && this.debouncedTerm() !== this.searchTerm(),
  );

  protected readonly results = rxResource<AssociateDto[], string | undefined>({
    defaultValue: [],
    params: () => this.debouncedTerm(),
    stream: ({ params }) => this.lookups.searchPeople(params),
  });

  // Selecting all text on focus lets the user replace the chosen value by just
  // typing — no manual highlight-and-delete.
  protected onFocus(event: FocusEvent): void {
    this.open.set(true);
    const el = event.target;
    if (el instanceof HTMLInputElement) {
      el.select();
    }
  }

  protected onInput(text: string): void {
    this.query.set(text);
    this.open.set(true);
  }

  protected pick(associate: AssociateDto): void {
    this.valueChange.emit(associate); // parent updates value -> query re-syncs
    this.open.set(false);
  }

  protected close(): void {
    this.open.set(false);
    this.query.set(this.value()); // discard any unsubmitted typing
  }

  // Close when focus leaves the widget — to another control, or to empty
  // space (relatedTarget null) — while staying open between the input and the
  // option buttons.
  protected onFocusOut(event: FocusEvent, root: HTMLElement): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !root.contains(next)) {
      this.close();
    }
  }
}
