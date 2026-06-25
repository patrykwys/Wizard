import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * Presentational tag editor. Owns only its text-box draft; the tag list is
 * owned by the parent (the form model) and pushed back via `tagsChange`.
 */
@Component({
  selector: 'app-tag-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tags().length) {
      <div class="tag-list">
        @for (tag of tags(); track tag) {
          <span class="tag">
            {{ tag }}
            <button type="button" (click)="remove(tag)" aria-label="Remove tag">×</button>
          </span>
        }
      </div>
    }
    <div class="inline-add">
      <input
        class="field-input"
        [value]="draft()"
        (input)="draft.set($any($event.target).value)"
        (keydown.enter)="add()"
        [placeholder]="placeholder()"
      />
      <button type="button" class="btn-secondary" (click)="add()">Add</button>
    </div>
  `,
})
export class TagInput {
  readonly tags = input.required<string[]>();
  readonly placeholder = input('Type a tag and press Add');
  readonly tagsChange = output<string[]>();

  protected readonly draft = signal('');

  protected add(): void {
    const value = this.draft().trim();
    if (!value || this.tags().includes(value)) {
      return;
    }
    this.tagsChange.emit([...this.tags(), value]);
    this.draft.set('');
  }

  protected remove(tag: string): void {
    this.tagsChange.emit(this.tags().filter((t) => t !== tag));
  }
}
