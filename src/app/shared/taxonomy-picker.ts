import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { LookupStore } from '../store/lookup.store';
import { TaxonomyNode, TaxonomySelection } from '../models/product.model';

interface Row {
  id: string;
  label: string;
  depth: number;
  isLeaf: boolean;
  path: string[];
}

// Flatten the tree into the rows currently visible given the expanded set.
function buildRows(
  nodes: readonly TaxonomyNode[],
  depth: number,
  path: string[],
  expanded: ReadonlySet<string>,
): Row[] {
  const rows: Row[] = [];
  for (const node of nodes) {
    const nodePath = [...path, node.label];
    const isLeaf = !node.children?.length;
    rows.push({ id: node.id, label: node.label, depth, isLeaf, path: nodePath });
    if (!isLeaf && expanded.has(node.id)) {
      rows.push(...buildRows(node.children!, depth + 1, nodePath, expanded));
    }
  }
  return rows;
}

// Collect every leaf whose label/path matches the filter.
function matchLeaves(
  nodes: readonly TaxonomyNode[],
  path: string[],
  needle: string,
): TaxonomySelection[] {
  const out: TaxonomySelection[] = [];
  for (const node of nodes) {
    const nodePath = [...path, node.label];
    if (node.children?.length) {
      out.push(...matchLeaves(node.children, nodePath, needle));
    } else if (nodePath.join(' ').toLowerCase().includes(needle)) {
      out.push({ id: node.id, path: nodePath });
    }
  }
  return out;
}

/**
 * Enterprise Data Taxonomy picker: one dropdown that walks the whole tree and
 * lets the user multi-select leaves across any branch. Reads the tree from
 * LookupStore (swap the mock for the real API there). Selection is owned by the
 * parent (the form model) via `selection` in / `selectionChange` out.
 */
@Component({
  selector: 'app-taxonomy-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="picker">
      <button type="button" class="picker-field" (click)="toggle()">
        @if (selection().length) {
          <span class="picker-chips">
            @for (s of selection(); track s.id) {
              <span class="tag">
                {{ s.path[s.path.length - 1] }}
                <button
                  type="button"
                  (click)="remove(s.id); $event.stopPropagation()"
                  aria-label="Remove category"
                >×</button>
              </span>
            }
          </span>
        } @else {
          <span class="picker-placeholder">Select taxonomy categories…</span>
        }
        <span class="picker-caret" aria-hidden="true">▾</span>
      </button>

      @if (open()) {
        <div class="popover taxonomy-popover">
          <div class="taxonomy-filter">
            <input
              class="field-input"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
              placeholder="Filter taxonomy…"
            />
          </div>
          <div class="taxonomy-list">
            @if (tree.isLoading()) {
              <p class="picker-empty">Loading…</p>
            } @else if (query()) {
              @for (leaf of leafMatches(); track leaf.id) {
                <button
                  type="button"
                  class="tree-row is-leaf"
                  [class.is-selected]="isSelected(leaf.id)"
                  (click)="toggleSelect(leaf)"
                >
                  <span class="tree-check" aria-hidden="true">{{ isSelected(leaf.id) ? '☑' : '☐' }}</span>
                  <span>{{ leaf.path.join(' › ') }}</span>
                </button>
              } @empty {
                <p class="picker-empty">No matches.</p>
              }
            } @else {
              @for (row of rows(); track row.id) {
                <button
                  type="button"
                  class="tree-row"
                  [class.is-leaf]="row.isLeaf"
                  [class.is-selected]="row.isLeaf && isSelected(row.id)"
                  [style.padding-left.px]="12 + row.depth * 18"
                  (click)="row.isLeaf ? toggleSelect({ id: row.id, path: row.path }) : toggleExpand(row.id)"
                >
                  @if (row.isLeaf) {
                    <span class="tree-check" aria-hidden="true">{{ isSelected(row.id) ? '☑' : '☐' }}</span>
                    <span class="tree-label">{{ row.label }}</span>
                  } @else {
                    <span class="tree-caret" [class.is-open]="isExpanded(row.id)" aria-hidden="true">▸</span>
                    <span class="tree-label is-branch">{{ row.label }}</span>
                  }
                </button>
              }
            }
          </div>
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
        padding: var(--space-3) var(--space-6);
        background: var(--color-field-bg);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-field);
        cursor: pointer;
        transition: var(--transition-quick);
      }
      .picker-field:hover { border-color: var(--color-text-muted); }
      .picker-chips { display: flex; flex-wrap: wrap; gap: var(--space-3); flex: 1; }
      .picker-placeholder { flex: 1; text-align: left; color: var(--color-text-placeholder); }
      .picker-caret { color: var(--color-text-secondary); }
      .taxonomy-filter { padding: var(--space-5); border-bottom: 1px solid var(--color-divider); }
      .taxonomy-list { max-height: 280px; overflow-y: auto; padding: var(--space-3); }
      .tree-row {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        width: 100%;
        padding: var(--space-4) var(--space-5);
        border-radius: var(--radius-sm);
        text-align: left;
        transition: var(--transition-quick);
      }
      .tree-row:hover { background: var(--color-surface-muted); }
      .tree-row.is-selected { background: var(--color-action-tint); color: var(--color-primary); }
      .tree-caret { display: inline-block; transition: transform var(--duration-quick) var(--ease-standard); color: var(--color-text-secondary); }
      .tree-caret.is-open { transform: rotate(90deg); }
      .tree-check { color: var(--color-primary); }
      .tree-label.is-branch { font-weight: var(--font-weight-semibold); }
      .picker-empty { padding: var(--space-6); color: var(--color-text-secondary); font-size: var(--font-size-sm); }
    `,
  ],
})
export class TaxonomyPicker {
  private readonly host = inject(ElementRef);
  private readonly lookups = inject(LookupStore);

  readonly selection = input<TaxonomySelection[]>([]);
  readonly selectionChange = output<TaxonomySelection[]>();

  protected readonly tree = this.lookups.taxonomy;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly rows = computed(() =>
    buildRows(this.tree.value(), 0, [], this.expanded()),
  );

  protected readonly leafMatches = computed(() => {
    const needle = this.query().trim().toLowerCase();
    return needle ? matchLeaves(this.tree.value(), [], needle) : [];
  });

  protected toggle(): void {
    this.open.update((o) => !o);
  }

  protected isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  protected toggleExpand(id: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  protected isSelected(id: string): boolean {
    return this.selection().some((s) => s.id === id);
  }

  protected toggleSelect(sel: TaxonomySelection): void {
    const exists = this.selection().some((s) => s.id === sel.id);
    this.selectionChange.emit(
      exists
        ? this.selection().filter((s) => s.id !== sel.id)
        : [...this.selection(), sel],
    );
  }

  protected remove(id: string): void {
    this.selectionChange.emit(this.selection().filter((s) => s.id !== id));
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target)) {
      this.open.set(false);
    }
  }
}
