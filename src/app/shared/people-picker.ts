import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { LookupStore } from '../store/lookup.store';
import { Person } from '../models/product.model';

/**
 * Typeahead over the corporate directory. Type a corporate id (e.g. g100231)
 * or a name; the dropdown shows the matching user and their role. Reads from
 * LookupStore.searchPeople (swap the mock for the real API there). The selected
 * display name is owned by the parent via `value` in / `valueChange` out.
 */
@Component({
  selector: 'app-people-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="picker">
      <div class="picker-field" (click)="openPanel()">
        @if (value() && !open()) {
          <span class="picker-value">{{ value() }}</span>
        } @else {
          <input
            class="picker-input"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            (focus)="openPanel()"
            [placeholder]="placeholder()"
          />
        }
        <span class="picker-caret" aria-hidden="true">▾</span>
      </div>

      @if (open()) {
        <div class="popover">
          @if (results.isLoading()) {
            <p class="picker-empty">Searching…</p>
          } @else if (results.value().length) {
            @for (person of results.value(); track person.id) {
              <button type="button" class="person-row" (click)="pick(person)">
                <span class="person-name">{{ person.name }}</span>
                <span class="person-role">{{ person.role }}</span>
              </button>
            }
          } @else {
            <p class="picker-empty">No matching users.</p>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .picker { position: relative; display: block; }
      .picker-field {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        width: 100%;
        min-height: var(--size-control-lg);
        padding: 0 var(--space-6);
        background: var(--color-field-bg);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-field);
        cursor: text;
        transition: var(--transition-quick);
      }
      .picker-field:focus-within { background: var(--color-card-bg); border-color: var(--color-primary); box-shadow: var(--shadow-focus-ring); }
      .picker-value { flex: 1; }
      .picker-input { flex: 1; min-height: var(--size-control-md); border: none; background: none; outline: none; }
      .picker-input::placeholder { color: var(--color-text-placeholder); }
      .picker-caret { color: var(--color-text-secondary); }
      .person-row {
        display: flex;
        align-items: baseline;
        gap: var(--space-5);
        width: 100%;
        padding: var(--space-5) var(--space-6);
        border-bottom: 1px solid var(--color-divider);
        text-align: left;
        transition: var(--transition-quick);
      }
      .person-row:last-child { border-bottom: none; }
      .person-row:hover { background: var(--color-action-tint); }
      .person-name { font-weight: var(--font-weight-medium); }
      .person-role { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
      .picker-empty { padding: var(--space-6); color: var(--color-text-secondary); font-size: var(--font-size-sm); }
    `,
  ],
})
export class PeoplePicker {
  private readonly host = inject(ElementRef);
  private readonly lookups = inject(LookupStore);

  readonly value = input<string>('');
  readonly placeholder = input('Search by name or corporate id…');
  readonly valueChange = output<Person>();

  protected readonly open = signal(false);
  protected readonly query = signal('');

  // Searches only while the panel is open; '' returns the full directory.
  protected readonly results = rxResource<Person[], string | undefined>({
    defaultValue: [],
    params: () => (this.open() ? this.query() : undefined),
    stream: ({ params }) => this.lookups.searchPeople(params),
  });

  protected openPanel(): void {
    this.open.set(true);
  }

  protected pick(person: Person): void {
    this.valueChange.emit(person);
    this.query.set('');
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target)) {
      this.open.set(false);
    }
  }
}
