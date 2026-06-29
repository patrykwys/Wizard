import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { ICONS } from './icons';
import { LookupStore } from '../store/lookup.store';

/**
 * Typeahead over Active Directory groups. Type to search; pick a group. Reads
 * from LookupStore.searchAdGroups (swap the mock for the real API there). The
 * selected group string is owned by the parent via `value` in / `valueChange`.
 *
 * Same declarative close model as the people picker: Escape, select, or focus
 * leaving the widget. No document listener, no injected ElementRef.
 */
@Component({
  selector: 'app-ad-group-picker',
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
          (focus)="open.set(true)"
          [placeholder]="placeholder()"
        />
        <span class="picker-caret" aria-hidden="true">
          <lucide-icon [img]="icons.ChevronDown" [size]="16" />
        </span>
      </div>

      @if (open()) {
        <ul class="popover" role="listbox">
          @if (!searchTerm()) {
            <li class="picker-empty">Type to search AD groups…</li>
          } @else if (results.isLoading()) {
            <li class="picker-empty">Searching…</li>
          } @else if (results.value().length) {
            @for (group of results.value(); track group) {
              <li>
                <button type="button" class="picker-option" role="option" (mousedown)="$event.preventDefault()" (click)="pick(group)">
                  <span class="picker-option-primary">{{ group }}</span>
                </button>
              </li>
            }
          } @else {
            <li class="picker-empty">No matching groups.</li>
          }
        </ul>
      }
    </div>
  `,
})
export class AdGroupPicker {
  protected readonly icons = ICONS;
  private readonly lookups = inject(LookupStore);

  readonly value = input<string>('');
  readonly placeholder = input('Search AD group…');
  readonly valueChange = output<string>();

  protected readonly open = signal(false);
  protected readonly query = linkedSignal(() => this.value());

  // Only a new search term — reopening on a selected group is not a search.
  protected readonly searchTerm = computed(() => {
    const q = this.query().trim();
    return this.open() && q && q !== this.value().trim() ? q : undefined;
  });

  protected readonly results = rxResource<string[], string | undefined>({
    defaultValue: [],
    params: () => this.searchTerm(),
    stream: ({ params }) => this.lookups.searchAdGroups(params),
  });

  protected onInput(text: string): void {
    this.query.set(text);
    this.open.set(true);
  }

  protected pick(group: string): void {
    this.valueChange.emit(group);
    this.open.set(false);
  }

  protected close(): void {
    this.open.set(false);
    this.query.set(this.value());
  }

  protected onFocusOut(event: FocusEvent, root: HTMLElement): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !root.contains(next)) {
      this.close();
    }
  }
}