# Register a Data Product — PR-by-PR build

This document breaks the wizard into independently reviewable commits. **Commit 0
(scaffold)** is the stock Angular CLI output — take the config files shipped
alongside this doc and skip to Commit 1.

Each later commit lists its files, the actual code, and **why** the pattern is
used. The commits are ordered by dependency: the foundation (1–7) must land in
order; the step commits (8–13) each stack on the foundation but are independent
of each other, so you can reorder or parallelise them. The only shared edit
between step commits is a one-line entry in the shell's `@switch`, called out
where it happens.

Stack model: branch each commit off the previous one (`git checkout -b feat/x`),
open it as its own PR, and merge in order. The app compiles at every commit from
Commit 7 onward.

| # | Branch | Title |
|---|--------|-------|
| 0 | — | scaffold (skipped — use shipped configs) |
| 1 | `feat/design-tokens` | Design tokens + universal control styles |
| 2 | `feat/model-events` | Domain model + wizard events |
| 3 | `feat/store-features` | Navigation + persistence store features |
| 4 | `feat/draft-store` | ProductDraftStore (reducer, entities, autosave) |
| 5 | `feat/lookup-store` | LookupStore (reference data + async resources) |
| 6 | `feat/shared-ui` | Shared dumb components (field error, tag input) |
| 7 | `feat/wizard-shell` | Wizard shell: stepper + progress + routing |
| 8 | `feat/identify` | Identify step + taxonomy multiselect picker |
| 9 | `feat/basic-info` | Basic info step + people picker |
| 10 | `feat/description` | Description & details step |
| 11 | `feat/sources` | Sources & assets step |
| 12 | `feat/access` | Access & classification step |
| 13 | `feat/review` | Review & submit step |

---

## The three state owners (read this first)

The whole app has exactly three places state lives. Every commit slots into one
of them, so it's worth holding the map in your head:

1. **`ProductDraftStore`** — the single source of truth for the product being
   built (the draft + the list of sources + which pages are done + where we are
   in the flow). It is an NgRx Signal Store. Components never mutate it directly;
   they **dispatch events** and the store reacts.
2. **`LookupStore`** — read-only reference data for dropdowns and pickers
   (product types, the taxonomy tree, the people directory). Loaded with
   `rxResource`. Swapping the mocks for real HTTP happens only here.
3. **Signal Forms** — per-step, throwaway form state. Each step keeps a local
   working copy of its slice of the draft, validates it, and syncs accepted
   changes back to the store through one event.

The seam between them is deliberately tiny: a step reads its slice from the
store into a `linkedSignal`, the form edits that copy, and an `effect` dispatches
the change back. That is the only wiring you need to understand to read any step.

---

## Commit 1 — Design tokens + universal control styles

**Branch** `feat/design-tokens` · **Message** `feat(design): token layer + universal control styles`

**Files** (full contents shipped separately as `tokens.css` / `base.css`):
`src/styles/tokens.css`, `src/styles/reset.css`, `src/styles/base.css`,
`src/styles/index.css`, and the one-line `styles` entry in `angular.json`.

**What it does.** `tokens.css` is one `:root` block of CSS custom properties —
colour, type scale, 4px spacing scale, control heights, radii, shadows, motion,
z-index. `reset.css` is a minimal normalize. `base.css` styles every *shared*
control class (`.btn-*`, `.field-*`, `.tag`, `.option-card`, `.card`, `.popover`,
…) entirely in terms of those tokens. `index.css` imports the three in order and
is the single stylesheet `angular.json` references; esbuild inlines the imports
into one sheet at build time.

**Why this shape.**
- **Tokens-only rule.** Components author CSS with `var(--token)` and never
  hard-code a hex or a pixel. That is what makes the styling "universal": change
  `--color-primary` once and every button, focus ring, and active step moves
  together. A stylelint `declaration-property-value-disallowed-list` rule can
  enforce it on `color`/`background`/`padding`/`margin`/`border-radius`/etc.
- **One global sheet, everything else scoped.** Global selectors live only in
  `reset.css`/`base.css`. Component styles use Angular's emulated encapsulation,
  so they can't leak. This is the "no global selectors outside reset/base" rule.
- **Single `:root`.** Authoring tokens as one block leaves room to add a
  `@media (prefers-color-scheme: dark)` override later without touching a single
  component.

`index.css`:

```css
/* Single global stylesheet entry (referenced once from angular.json).
   Order matters: tokens -> reset -> base. */
@import "./tokens.css";
@import "./reset.css";
@import "./base.css";

```

---

## Commit 2 — Domain model + wizard events

**Branch** `feat/model-events` · **Message** `feat(model): domain model + wizard event group`

**Files:** `src/app/models/product.model.ts`, `src/app/store/wizard.events.ts`

**What the model is.** Plain TypeScript types for the draft and its parts, the
ordered list of `PAGES`, which pages are `REQUIRED`, and the lookup shapes
(`TaxonomyNode`, `Person`, `ProductHit`). `INITIAL_DRAFT` seeds every field with
a non-null empty value (`''`, `[]`) — a hard requirement of Signal Forms, which
never allows `null`/`undefined` in a model.

**What events are — and why the whole app is built on them.** An *event* is a
typed message that says *"this happened"* — `draftPatched`, `sourcesChanged`,
`pageCompleted`, `saveRequested`, `cleared`. It carries data but changes nothing
on its own.

- `eventGroup({ source, events: { name: type<Payload>() } })` declares a named
  set of events. `type<T>()` fixes the payload type; `type<void>()` means no
  payload.
- A component gets a typed dispatcher with `injectDispatch(wizardEvents)` and
  calls e.g. `dispatch.draftPatched({ identify })`. That puts the event on the
  store's bus (the `Dispatcher`).
- `provideDispatcher()` provides that bus for a scope. We scope it to the wizard
  route, not the root, so the bus and store are created when you enter the
  wizard and torn down when you leave.

**Why events instead of calling store methods directly.** This gives one-way
data flow. Components never reach into the store to mutate it; they *announce
facts*. The store alone decides how state changes (in its reducer, Commit 4) and
what side effects run (its event handlers, Commit 4). The payoff: the UI is
decoupled from the state shape, every state change is traceable to a named event
(trivial to log/audit), components stay "dumb", and state transitions become
pure functions you can unit-test by dispatching an event and asserting the
resulting state. It is the Redux/NgRx mental model, co-located inside the Signal
Store.

`wizard.events.ts`:

```ts
import { type } from '@ngrx/signals';
import { eventGroup } from '@ngrx/signals/events';
import {
  AccessData,
  BasicInfoData,
  DescriptionData,
  IdentifyData,
  ProductPage,
  SourceItem,
} from '../models/product.model';

// A single, readable inventory of everything that can happen in the wizard.
// Pages dispatch these; the store decides what each one does.
export const wizardEvents = eventGroup({
  source: 'Product Wizard',
  events: {
    // Fired continuously as a page is edited (drives autosave). Pass-through
    // section refs keep the store/linkedSignal round-trip stable.
    draftPatched: type<Partial<{
      identify: IdentifyData;
      basic: BasicInfoData;
      description: DescriptionData;
      access: AccessData;
    }>>(),

    // Sources are an entity collection; committed as a whole array.
    sourcesChanged: type<SourceItem[]>(),

    // Marks a page valid + done (gates navigation / submit).
    pageCompleted: type<ProductPage>(),

    // Explicit "Save draft" button.
    saveRequested: type<void>(),

    // Final submit succeeded -> clear everything.
    cleared: type<void>(),
  },
});

```

`product.model.ts`:

```ts
export type ProductPage =
  | 'identify'
  | 'basic'
  | 'description'
  | 'sources'
  | 'access'
  | 'review';

export interface PageMeta {
  readonly id: ProductPage;
  readonly label: string;
}

// Order is the single source of truth for navigation + progress.
export const PAGES: readonly PageMeta[] = [
  { id: 'identify', label: 'Identify' },
  { id: 'basic', label: 'Basic info' },
  { id: 'description', label: 'Description' },
  { id: 'sources', label: 'Sources' },
  { id: 'access', label: 'Access' },
  { id: 'review', label: 'Review' },
] as const;

// Pages the user must complete before submitting (review excluded).
export const REQUIRED_PAGES: readonly ProductPage[] = [
  'identify',
  'basic',
  'description',
  'sources',
  'access',
];

export interface IdentifyData {
  appId: string;
  categories: TaxonomySelection[];
}

export interface BasicInfoData {
  name: string;
  type: string;
  creator: string;
  ownership: string;
}

export interface DescriptionData {
  description: string;
  url: string;
  tags: string[];
}

export interface AccessData {
  visibility: Visibility;
  classification: Classification;
  tags: string[];
}

export type Visibility = 'private' | 'internal' | 'public';
export type Classification =
  | 'public'
  | 'internal'
  | 'confidential'
  | 'restricted';

// Sources are managed as a keyed entity collection, not as part of the draft.
export interface SourceItem {
  id: string;
  kind: string;
  location: string;
  note: string;
}

// The serializable, per-page draft. Sources live in the entity collection.
export interface ProductDraft {
  identify: IdentifyData;
  basic: BasicInfoData;
  description: DescriptionData;
  access: AccessData;
}

// Initial values: never null/undefined (Signal Forms requirement).
export const INITIAL_DRAFT: ProductDraft = {
  identify: { appId: '', categories: [] },
  basic: { name: '', type: '', creator: '', ownership: '' },
  description: { description: '', url: '', tags: [] },
  access: { visibility: 'internal', classification: 'internal', tags: [] },
};

// A node in the Enterprise Data Taxonomy tree (loaded from the API).
export interface TaxonomyNode {
  id: string;
  label: string;
  children?: TaxonomyNode[];
}

// A chosen taxonomy leaf, carrying its full label path for display.
export interface TaxonomySelection {
  id: string;
  path: string[];
}

// A company user returned by the people-search API.
export interface Person {
  id: string;
  name: string;
  role: string;
}

// A product returned by the "Search products" lookup on the identify step.
export interface ProductHit {
  appId: string;
  name: string;
  taxonomy: string;
}

```

---

## Commit 3 — Navigation + persistence store features

**Branch** `feat/store-features` · **Message** `feat(store): navigation + persistence features`

**Files:** `src/app/store/features/with-wizard-navigation.ts`,
`src/app/store/features/with-draft-persistence.ts`

**What a feature is.** `signalStoreFeature(...)` packages a reusable slice of
state + computed + methods + hooks that any store can pull in. It is how you keep
the main store declaration thin and split concerns into testable units. The
primitives a feature composes:
- `withState(initial)` — adds state signals.
- `withComputed(store => ({ … }))` — derived signals.
- `withMethods(store => ({ … }))` — imperative API on the store.
- `withProps` / `withHooks({ onInit })` — extra members / lifecycle.
- `patchState(store, updater)` applies an immutable update; `getState(store)`
  snapshots the whole state.

**Navigation feature.** Holds `currentPage` and `completedPages`; derives
`currentIndex`, `isFirst`, `isLast`, and `progress`; exposes `goTo/next/prev`.
`progress` is **current-step based** — `(currentIndex + 1) / pages.length` — so
on first load step 1 already reads as active and the bar shows ~17%, advancing as
you move. (Earlier it was completed-count based, which left the bar empty on load.)

**Persistence feature.** Holds `lastSavedAt`; `persistNow` snapshots state with
`getState` and writes it to `localStorage`; `clearStorage` wipes it; an
`onInit` hook hydrates from storage on creation (guarded so it is SSR-safe).
Keeping this as a feature means the store just *includes* persistence rather than
knowing how it works.

`with-wizard-navigation.ts`:

```ts
import { computed } from '@angular/core';
import {
  patchState,
  signalStoreFeature,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { PageMeta, ProductPage } from '../../models/product.model';

interface NavState {
  currentPage: ProductPage;
  completedPages: ProductPage[];
}

/**
 * Reusable wizard navigation. Owns the current step, the set of completed
 * steps, and derived progress. `completedPages` is updated by the store's
 * reducer (via the `pageCompleted` event) and read here for progress + gating.
 */
export function withWizardNavigation(pages: readonly PageMeta[]) {
  const order = pages.map((p) => p.id);

  return signalStoreFeature(
    withState<NavState>({ currentPage: order[0], completedPages: [] }),
    withComputed((store) => ({
      currentIndex: computed(() => order.indexOf(store.currentPage())),
      isFirst: computed(() => order.indexOf(store.currentPage()) === 0),
      isLast: computed(
        () => order.indexOf(store.currentPage()) === order.length - 1,
      ),
      progress: computed(() =>
        Math.round(
          ((order.indexOf(store.currentPage()) + 1) / order.length) * 100,
        ),
      ),
    })),
    withMethods((store) => ({
      goTo(page: ProductPage): void {
        patchState(store, { currentPage: page });
      },
      next(): void {
        const i = order.indexOf(store.currentPage());
        if (i < order.length - 1) {
          patchState(store, { currentPage: order[i + 1] });
        }
      },
      prev(): void {
        const i = order.indexOf(store.currentPage());
        if (i > 0) {
          patchState(store, { currentPage: order[i - 1] });
        }
      },
    })),
  );
}

```

`with-draft-persistence.ts`:

```ts
import {
  getState,
  patchState,
  signalStoreFeature,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

interface PersistenceState {
  lastSavedAt: string | null;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

/**
 * Reusable persistence mechanism. The store decides *when* to persist (which
 * events trigger it); this feature owns *how*: serialize the whole state to
 * localStorage, rehydrate it on init, and clear it.
 *
 * `lastSavedAt` doubles as the autosave indicator for the UI.
 */
export function withDraftPersistence(storageKey: string) {
  return signalStoreFeature(
    withState<PersistenceState>({ lastSavedAt: null }),
    withMethods((store) => ({
      persistNow(): void {
        if (!canUseStorage()) {
          return;
        }
        const snapshot = getState(store);
        window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
        patchState(store, { lastSavedAt: new Date().toISOString() });
      },
      clearStorage(): void {
        if (canUseStorage()) {
          window.localStorage.removeItem(storageKey);
        }
        patchState(store, { lastSavedAt: null });
      },
    })),
    withHooks({
      onInit(store) {
        if (!canUseStorage()) {
          return;
        }
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
          return;
        }
        try {
          // Keys match the store's state shape (draft, entity keys, nav, etc.),
          // so a single patch rehydrates everything including sources entities.
          patchState(store, JSON.parse(raw));
        } catch {
          window.localStorage.removeItem(storageKey);
        }
      },
    }),
  );
}

```

---

## Commit 4 — ProductDraftStore (reducer, entities, autosave)

**Branch** `feat/draft-store` · **Message** `feat(store): ProductDraftStore with reducer, entities, autosave`
**Also edits** `src/app/app.routes.ts` to add `provideDispatcher()` + the store
to the wizard route's providers (shown in Commit 7).

**Files:** `src/app/store/product-draft.store.ts`

This is the heart of the app. It assembles the two features, the draft state, the
sources collection, the reducer, persistence, and the autosave effect.

**`withReducer(...cases)` — what it does and why.** The reducer is the *single
place every state change happens*, and each change is tied to an event. A case is
`on(event, (event, state) => update)` where `update` is a `Partial<State>`, a
partial-state-updater (like the entity updaters), or an array of them.

- `on(draftPatched, (e, state) => ({ draft: { ...state.draft, ...e.payload } }))`
  merges a step's slice into the draft.
- `on(sourcesChanged, (e) => setAllEntities(e.payload, sourceConfig))` replaces
  the sources collection.
- `on(pageCompleted, …)` adds the page to `completedPages` (de-duplicated).
- `on(cleared, …)` returns an **array** of updaters — reset draft *and*
  `removeAllEntities` — because one event legitimately drives several updates.

Why `withReducer` rather than plain `withMethods` mutators: it binds mutations to
events (decoupled + auditable), keeps every transition a pure, side-effect-free
function (dispatch event → assert next state in a unit test), and removes the
temptation for components to poke state directly. Methods are for imperative
helpers; the reducer is for event-driven state.

**`withEntities` + `entityConfig` — why for sources.** Sources are a dynamic
list, so they use NgRx's normalized collection.
`entityConfig({ entity: type<SourceItem>(), collection: 'sources', selectId })`
names the collection and its id. `withEntities(config)` adds `sourcesEntityMap`,
`sourcesIds`, and a derived `sourcesEntities()` array. Updaters like
`setAllEntities` / `removeAllEntities` give O(1), id-keyed updates with a free
derived array — the standard pattern for collections, versus hand-managing an
array in state.

**`withEventHandlers` — where side effects live (autosave).** Pure reducers must
not do I/O, so side effects go here.
`withEventHandlers((store, events = inject(Events)) => ({ … }))` registers RxJS
streams keyed off events; `events.on(a, b, c)` is an Observable of those events.
The autosave stream merges `draftPatched`/`sourcesChanged`/`pageCompleted`/
`saveRequested`, `debounceTime(400)`s them, and calls `persistNow` — so rapid
typing collapses into one write. A second stream clears storage on `cleared`.
This keeps side effects explicit, debounced, and cancellable, fully separated
from the pure state transitions in the reducer.

`product-draft.store.ts`:

```ts
import { computed, inject } from '@angular/core';
import {
  signalStore,
  type,
  withComputed,
  withState,
} from '@ngrx/signals';
import {
  entityConfig,
  removeAllEntities,
  setAllEntities,
  withEntities,
} from '@ngrx/signals/entities';
import { Events, on, withEventHandlers, withReducer } from '@ngrx/signals/events';
import { debounceTime, merge, tap } from 'rxjs';
import {
  INITIAL_DRAFT,
  PAGES,
  ProductDraft,
  REQUIRED_PAGES,
  SourceItem,
} from '../models/product.model';
import { withDraftPersistence } from './features/with-draft-persistence';
import { withWizardNavigation } from './features/with-wizard-navigation';
import { wizardEvents } from './wizard.events';

const STORAGE_KEY = 'product-wizard-draft-v1';

export const sourceConfig = entityConfig({
  entity: type<SourceItem>(),
  collection: 'sources',
  selectId: (s) => s.id,
});

export const ProductDraftStore = signalStore(
  // 1. Navigation: currentPage, completedPages, progress, next/prev/goTo.
  withWizardNavigation(PAGES),

  // 2. The serializable draft (sources live in the entity collection below).
  withState<{ draft: ProductDraft }>({ draft: INITIAL_DRAFT }),

  // 3. Repeatable sub-collection -> entities (keyed add/remove/reorder).
  withEntities(sourceConfig),

  // 4. Derived state for gating + review.
  withComputed((store) => ({
    allRequiredComplete: computed(() =>
      REQUIRED_PAGES.every((p) => store.completedPages().includes(p)),
    ),
  })),

  // 5. Events -> state transitions. Pages never mutate state directly.
  withReducer(
    // Merge a page's section into the draft. `payload` carries the same object
    // refs the page holds, so the store/linkedSignal round-trip stays stable.
    on(wizardEvents.draftPatched, ({ payload }, state) => ({
      draft: { ...state.draft, ...payload },
    })),

    // Sources committed as a whole array.
    on(wizardEvents.sourcesChanged, ({ payload }) =>
      setAllEntities(payload, sourceConfig),
    ),

    // Mark a page complete (dedup).
    on(wizardEvents.pageCompleted, ({ payload }, state) => ({
      completedPages: state.completedPages.includes(payload)
        ? state.completedPages
        : [...state.completedPages, payload],
    })),

    // Reset everything after a successful submit.
    on(wizardEvents.cleared, () => [
      { draft: INITIAL_DRAFT, completedPages: [], currentPage: PAGES[0].id },
      removeAllEntities(sourceConfig),
    ]),
  ),

  // 6. Persistence mechanism (hydrate on init, persistNow, clearStorage).
  withDraftPersistence(STORAGE_KEY),

  // 7. The autosave side effect: persist after any meaningful change, debounced.
  //    This is where the "save in case of emergency" guarantee lives.
  withEventHandlers((store, events = inject(Events)) => ({
    autosave$: merge(
      events.on(
        wizardEvents.draftPatched,
        wizardEvents.sourcesChanged,
        wizardEvents.pageCompleted,
        wizardEvents.saveRequested,
      ),
    ).pipe(
      debounceTime(400),
      tap(() => store.persistNow()),
    ),
    clearOnReset$: events.on(wizardEvents.cleared).pipe(
      tap(() => store.clearStorage()),
    ),
  })),
);

```

---

## Commit 5 — LookupStore (reference data + async resources)

**Branch** `feat/lookup-store` · **Message** `feat(data): LookupStore reference data + resources`

**Files:** `src/app/store/lookup.store.ts`

**What it is.** A `providedIn: 'root'` store holding read-only reference data:
product types, ownership options, source kinds, the taxonomy tree, plus
`searchPeople` and `searchProducts`. It is the *only* file that touches the data
source, so going live is a one-file change.

**`rxResource` — why, and how it behaves.** `rxResource({ params, stream,
defaultValue })` is Angular's declarative async primitive.
- `params()` returns a request value, or `undefined` to mean "idle, don't
  fetch". `stream({ params })` returns an Observable for that request. The
  resource exposes `value()`, `isLoading()`, and `error()` and re-runs whenever
  `params` changes, cancelling the previous run.
- Reference lists use `params: void` (load once). The pickers in later commits
  pass a *typed query* as params, so they refetch reactively as the user types —
  with no manual `subscribe`, no leak, and no race condition (a newer query
  supersedes an older in-flight one).

**Going live.** Replace each `of(MOCK).pipe(delay())` with an `HttpClient` call,
or swap `rxResource` for `httpResource(() => '/api/...')`. No component changes —
they only depend on `value()`/`isLoading()`.

`lookup.store.ts`:

```ts
import { signalStore, withMethods, withProps } from '@ngrx/signals';
import { rxResource } from '@angular/core/rxjs-interop';
import { delay, Observable, of } from 'rxjs';
import { Person, ProductHit, TaxonomyNode } from '../models/product.model';

/**
 * App-wide reference data for dropdowns and pickers. Loaded once and cached
 * for the lifetime of the app. Mock data lives here so the demo runs offline;
 * to go live, replace each `of(...)` with an HttpClient call (or swap
 * `rxResource` for `httpResource(() => '/api/...')`) — no component changes.
 */

const PRODUCT_TYPES = ['Dashboard', 'Report', 'Dataset', 'Model'];
const OWNERSHIP_OPTIONS = ['Team', 'Department', 'Individual', 'Shared'];
const SOURCE_KINDS = ['Tableau', 'PowerBI', 'ServiceNow', 'Collibra', 'Snowflake', 'Other'];

const LATENCY = 250;

// Enterprise Data Taxonomy — a single tree the picker walks level by level.
const TAXONOMY_TREE: TaxonomyNode[] = [
  {
    id: 'bos',
    label: 'Business Operations & Support',
    children: [
      {
        id: 'bos-process',
        label: 'Business Process & Workflow Operations',
        children: [
          { id: 'bos-process-intake', label: 'Case Intake' },
          { id: 'bos-process-routing', label: 'Workflow Routing' },
        ],
      },
      {
        id: 'bos-banking',
        label: 'Corporate Banking Operations',
        children: [
          { id: 'bos-banking-accounts', label: 'Bank Account Management' },
          { id: 'bos-banking-filings', label: 'Bank Regulatory Filings' },
        ],
      },
      {
        id: 'bos-data',
        label: 'Data Management, Operations & Governance',
        children: [
          { id: 'bos-data-quality', label: 'Data Quality' },
          { id: 'bos-data-catalog', label: 'Cataloguing' },
        ],
      },
      {
        id: 'bos-marketing',
        label: 'Marketing Operations',
        children: [{ id: 'bos-marketing-campaigns', label: 'Campaign Management' }],
      },
    ],
  },
  {
    id: 'fin',
    label: 'Financials & Accounting',
    children: [
      {
        id: 'fin-gl',
        label: 'General Ledger',
        children: [
          {
            id: 'fin-gl-journal',
            label: 'Journal Entries',
            children: [
              { id: 'fin-gl-journal-ap', label: 'Accounts Payable' },
              { id: 'fin-gl-journal-ar', label: 'Accounts Receivable' },
            ],
          },
          { id: 'fin-gl-recon', label: 'Reconciliations' },
        ],
      },
      {
        id: 'fin-reg',
        label: 'Regulatory Reporting',
        children: [{ id: 'fin-reg-filings', label: 'Statutory Filings' }],
      },
    ],
  },
];

// Mock corporate directory. Search matches corporate id (e.g. g100231) or name.
const PEOPLE: Person[] = [
  { id: 'g100231', name: 'Sarah Chen', role: 'Senior Data Analyst' },
  { id: 'g100412', name: 'James Park', role: 'Technical Lead' },
  { id: 'g100876', name: 'Maria Garcia', role: 'Business Owner' },
  { id: 'g101245', name: 'Amy Manning', role: 'Data Engineer' },
  { id: 'g101888', name: 'Rishi de Klerk', role: 'Product Manager' },
  { id: 'g102004', name: 'Tom Whelan', role: 'Data Steward' },
  { id: 'g102119', name: 'Niamh Byrne', role: 'BI Developer' },
];

// Mock catalogue of already-registered products for the identify search.
const PRODUCTS: ProductHit[] = [
  { appId: 'APP-411231', name: 'Financials & Accounting — Core Dataset', taxonomy: 'Financials & Accounting' },
  { appId: 'APP-494477', name: 'Financials & Accounting — Reporting Feed', taxonomy: 'Financials & Accounting' },
  { appId: 'APP-202310', name: 'Corporate Banking — Account Master', taxonomy: 'Business Operations & Support' },
];

export const LookupStore = signalStore(
  { providedIn: 'root' },
  withProps(() => ({
    productTypes: rxResource<string[], void>({
      defaultValue: [],
      stream: () => of(PRODUCT_TYPES).pipe(delay(LATENCY)),
    }),
    ownership: rxResource<string[], void>({
      defaultValue: [],
      stream: () => of(OWNERSHIP_OPTIONS).pipe(delay(LATENCY)),
    }),
    sourceKinds: rxResource<string[], void>({
      defaultValue: [],
      stream: () => of(SOURCE_KINDS).pipe(delay(LATENCY)),
    }),
    // The whole taxonomy tree, fetched once; the picker walks it client-side.
    taxonomy: rxResource<TaxonomyNode[], void>({
      defaultValue: [],
      stream: () => of(TAXONOMY_TREE).pipe(delay(LATENCY)),
    }),
  })),
  withMethods(() => ({
    // Corporate id or name -> matching users. Parameterised, so the people
    // picker drives this through its own rxResource keyed off the query.
    searchPeople(query: string): Observable<Person[]> {
      const needle = query.trim().toLowerCase();
      const matches = needle
        ? PEOPLE.filter(
            (p) =>
              p.id.toLowerCase().includes(needle) ||
              p.name.toLowerCase().includes(needle),
          )
        : [];
      return of(matches).pipe(delay(LATENCY));
    },
    // Find existing products by Application ID and/or taxonomy category ids.
    searchProducts(appId: string, categoryIds: string[]): Observable<ProductHit[]> {
      const id = appId.trim().toLowerCase();
      const matches = PRODUCTS.filter((p) => {
        const byId = id ? p.appId.toLowerCase().includes(id) : true;
        return byId;
      });
      // categoryIds reserved for the real API; the mock matches on id only.
      void categoryIds;
      return of(matches).pipe(delay(LATENCY));
    },
  })),
);

```

---

## Commit 6 — Shared dumb components

**Branch** `feat/shared-ui` · **Message** `feat(ui): shared field-error + tag-input`

**Files:** `src/app/shared/field-error.ts`, `src/app/shared/tag-input.ts`

**Smart vs dumb.** These own no app state. They take `input()`s and emit
`output()`s; the parent step owns the data. That separation keeps steps testable
and these widgets reusable.

**`FieldError`.** Renders the first validation message for a Signal Forms field.
The one gotcha it encodes: a `Field<T>` is itself a function. The `field` input
holds the *accessor*, so the template calls it twice — `field()()` — to reach the
`FieldState`, then reads `touched()` and `errors()`.

**`TagInput`.** A presentational chip editor. It keeps only a local draft string
for the textbox and emits a brand-new array on add/remove via `(tagsChange)`. It
never mutates the array it's given — the parent re-feeds the updated `tags`
input.

`field-error.ts`:

```ts
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

```

`tag-input.ts`:

```ts
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

```

---

## Commit 7 — Wizard shell: stepper + progress + routing

**Branch** `feat/wizard-shell` · **Message** `feat(wizard): shell, stepper, progress bar, route`

**Files:** `src/app/wizard/wizard.ts`, `wizard.html`, `wizard.scss`; and the
route wiring in `src/app/app.routes.ts` (below). After this commit the app boots.

**What it does.** The shell renders the title + "POC — Manual Entry" badge, the
Save-draft button (dispatches `saveRequested`, shows a "saved" label), the
current-step progress bar (width bound to `store.progress()`), the numbered
stepper (green for active/done, ✓ on completed, click to `goTo`), and a
`@switch(store.currentPage())` that mounts exactly one step component. It is a
thin smart component: it reads the store and translates clicks into store calls.

**Route wiring.** The wizard route provides `provideDispatcher()` and
`ProductDraftStore`, so the event bus and store are scoped to the wizard (created
on enter, destroyed on leave) rather than living at the root.

`app.routes.ts`:

```ts
import { Routes } from '@angular/router';
import { provideDispatcher } from '@ngrx/signals/events';
import { Wizard } from './wizard/wizard';
import { ProductDraftStore } from './store/product-draft.store';

export const routes: Routes = [
  {
    path: '',
    component: Wizard,
    // Store + event scope live and die with the wizard route (not root).
    providers: [provideDispatcher(), ProductDraftStore],
  },
];

```

`wizard.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { injectDispatch } from '@ngrx/signals/events';
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

```

`wizard.html`:

```html
<header class="wizard-header">
  <p class="wizard-crumb">Register a New Data Product</p>

  <div class="wizard-titlebar">
    <div class="wizard-title-group">
      <h1>Register a Data Product</h1>
      <span class="wizard-badge">POC — Manual Entry</span>
    </div>
    <div class="wizard-save">
      <span class="wizard-saved">{{ savedLabel() }}</span>
      <button type="button" class="btn-secondary" (click)="save()">Save draft</button>
    </div>
  </div>

  <div
    class="wizard-progress"
    role="progressbar"
    [attr.aria-valuenow]="store.progress()"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div class="wizard-progress-fill" [style.width.%]="store.progress()"></div>
  </div>

  <nav class="stepper" aria-label="Registration steps">
    @for (page of pages; track page.id; let i = $index) {
      <button
        type="button"
        class="stepper-step"
        [class.is-active]="store.currentPage() === page.id"
        [class.is-done]="store.completedPages().includes(page.id)"
        (click)="goTo(page.id)"
      >
        <span class="stepper-circle">
          @if (store.completedPages().includes(page.id)) {
            <span aria-hidden="true">✓</span>
          } @else {
            {{ i + 1 }}
          }
        </span>
        <span class="stepper-label">{{ page.label }}</span>
      </button>
    }
  </nav>
</header>

<main class="card">
  @switch (store.currentPage()) {
    @case ('identify') {
      <app-identify-step />
    }
    @case ('basic') {
      <app-basic-step />
    }
    @case ('description') {
      <app-description-step />
    }
    @case ('sources') {
      <app-sources-step />
    }
    @case ('access') {
      <app-access-step />
    }
    @case ('review') {
      <app-review-step />
    }
  }
</main>

```

`wizard.scss`:

```scss
.wizard-header {
  display: block;
  margin-bottom: var(--space-9);
}

.wizard-crumb {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-4);
}

.wizard-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-7);
  margin-bottom: var(--space-8);
}

.wizard-title-group {
  display: flex;
  align-items: center;
  gap: var(--space-6);
}

.wizard-title-group h1 {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-tight);
}

.wizard-badge {
  padding: var(--space-2) var(--space-5);
  background: var(--color-surface-muted);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.wizard-save {
  display: flex;
  align-items: center;
  gap: var(--space-6);
}

.wizard-saved {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.wizard-progress {
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-muted);
  overflow: hidden;
  margin-bottom: var(--space-8);
}

.wizard-progress-fill {
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  transition: width var(--duration-progress) var(--ease-standard);
}

.stepper {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
}

.stepper-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  flex: 1;
  text-align: center;
}

.stepper-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--size-control-sm);
  height: var(--size-control-sm);
  border-radius: var(--radius-circle);
  border: 1px solid var(--color-border);
  background: var(--color-card-bg);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  transition: var(--transition-quick);
}

.stepper-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  transition: var(--transition-quick);
}

.stepper-step.is-done .stepper-circle {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-text-on-dark);
}

.stepper-step.is-active .stepper-circle {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-text-on-dark);
  box-shadow: var(--shadow-step-active);
}

.stepper-step.is-active .stepper-label {
  color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
}

.stepper-step.is-done .stepper-label {
  color: var(--color-text-primary);
}

```

---

## Commit 8 — Identify step + taxonomy multiselect picker

**Branch** `feat/identify` · **Message** `feat(identify): identify step + taxonomy multiselect`
**Shell edit:** add `@case ('identify') { <app-identify-step /> }` to `wizard.html`.

**Files:** `src/app/wizard/steps/identify-step.ts`, `identify-step.html`,
`src/app/shared/taxonomy-picker.ts`

**The per-step pattern, first appearance.** Three lines do the work:
1. `model = linkedSignal(() => store.draft().identify)` — a writable working copy
   seeded from the store that **re-seeds when the source changes**.
2. `form(model, schema)` — validation over that copy.
3. an `effect` that dispatches `draftPatched({ identify: model() })` on change.

**Why `linkedSignal` and why it's loop-safe.** The form needs a mutable local
copy, but it must also reflect external resets (e.g. `cleared`). `linkedSignal`
gives both. The effect writes changes to the store; the reducer passes the
`identify` slice *reference through unchanged* on `draftPatched`, so when the
store updates, `linkedSignal`'s recomputed source is the same object it already
holds — no infinite recompute. (Sources will need a different approach for
exactly this reason — see Commit 11.)

**Validation on the form root.** Instead of a per-field rule, a single
`validate(p, ({ value }) => …)` requires *either* an Application ID *or* at least
one taxonomy category. `submit(form, cb)` marks everything touched and only runs
`cb` (advance) when valid; the root error renders via `<app-field-error
[field]="identifyForm" />`.

**Product search.** "Search products" sets a `searchKey` signal; an `rxResource`
keyed off it calls `searchProducts` and the results render as selectable rows
(plus a "Create new product" path). Keying a resource off a signal is the same
declarative-async pattern as the lookups — no manual subscription.

**The taxonomy picker (`taxonomy-picker.ts`).** One dropdown that walks the whole
tree and multi-selects leaves across branches. Internals worth knowing:
- The tree is read from `LookupStore.taxonomy`; the component flattens it to
  visible `rows` with `buildRows`, respecting an `expanded` `Set` signal, so
  branches collapse/expand in place.
- Typing in the filter switches to a flat list of matching leaves (`matchLeaves`)
  so search ignores expansion state.
- `L1…L4` badges come straight from depth (`row.depth + 1` / `path.length`).
- Selection is owned by the parent via `selection` in / `selectionChange` out;
  the field shows chosen leaves as chips.
- `@HostListener('document:click')` closes the popover on an outside click
  (clicks inside the host are ignored so multiselect stays open).

`identify-step.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { form, FormField, submit, validate } from '@angular/forms/signals';
import { injectDispatch } from '@ngrx/signals/events';
import { ProductHit, TaxonomySelection } from '../../models/product.model';
import { LookupStore } from '../../store/lookup.store';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { FieldError } from '../../shared/field-error';
import { TaxonomyPicker } from '../../shared/taxonomy-picker';

interface SearchKey {
  appId: string;
  ids: string[];
}

@Component({
  selector: 'app-identify-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldError, TaxonomyPicker],
  templateUrl: './identify-step.html',
  styles: [
    `
      .identify-bar {
        display: flex;
        align-items: flex-end;
        flex-wrap: wrap;
        gap: var(--space-6);
      }
      .identify-field { display: flex; flex-direction: column; }
      .identify-appid { width: 220px; }
      .identify-grow { flex: 1; min-width: 260px; }
      .identify-or {
        padding-bottom: var(--space-4);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-secondary);
      }
      .identify-actions { display: flex; align-items: flex-end; gap: var(--space-3); }
      .identify-tip {
        margin: var(--space-7) 0;
        padding: var(--space-5) var(--space-6);
        background: var(--color-surface-muted);
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
      }
      .results { margin-top: var(--space-7); }
      .results-count { font-weight: var(--font-weight-semibold); margin-bottom: var(--space-5); }
      .result-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: var(--space-6) var(--space-7);
        margin-bottom: var(--space-4);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-inner);
        text-align: left;
        transition: var(--transition-quick);
      }
      .result-row:hover { border-color: var(--color-primary); }
      .result-row.is-selected { border-color: var(--color-primary); background: var(--color-action-tint); }
      .result-main { display: flex; flex-direction: column; gap: var(--space-1); }
      .result-name { font-weight: var(--font-weight-semibold); }
      .result-meta { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
      .result-select { color: var(--color-primary); font-weight: var(--font-weight-medium); }
      .results-create {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-6);
        margin-top: var(--space-5);
        padding: var(--space-7);
        border: 1px dashed var(--color-border-dashed);
        border-radius: var(--radius-inner);
      }
      .picker-empty { padding: var(--space-6); color: var(--color-text-secondary); font-size: var(--font-size-sm); }
    `,
  ],
})
export class IdentifyStep {
  private readonly store = inject(ProductDraftStore);
  private readonly lookups = inject(LookupStore);
  private readonly dispatch = injectDispatch(wizardEvents);

  protected readonly model = linkedSignal(() => this.store.draft().identify);

  protected readonly identifyForm = form(this.model, (p) => {
    validate(p, ({ value }) => {
      const v = value();
      return v.appId.trim().length || v.categories.length
        ? undefined
        : {
            kind: 'required',
            message:
              'Enter an Application ID or choose at least one taxonomy category',
          };
    });
  });

  private readonly searchKey = signal<SearchKey | undefined>(undefined);

  protected readonly results = rxResource<ProductHit[], SearchKey | undefined>({
    defaultValue: [],
    params: () => this.searchKey(),
    stream: ({ params }) => this.lookups.searchProducts(params.appId, params.ids),
  });

  protected readonly searched = computed(() => this.searchKey() !== undefined);

  private readonly sync = effect(() => {
    this.dispatch.draftPatched({ identify: this.model() });
  });

  protected setCategories(categories: TaxonomySelection[]): void {
    this.model.update((m) => ({ ...m, categories }));
  }

  protected search(): void {
    this.searchKey.set({
      appId: this.model().appId,
      ids: this.model().categories.map((c) => c.id),
    });
  }

  protected clear(): void {
    this.model.set({ appId: '', categories: [] });
    this.searchKey.set(undefined);
  }

  protected selectProduct(product: ProductHit): void {
    this.model.update((m) => ({ ...m, appId: product.appId }));
  }

  protected createNew(): void {
    this.dispatch.pageCompleted('identify');
    this.store.next();
  }

  protected next(): void {
    submit(this.identifyForm, async () => {
      this.dispatch.pageCompleted('identify');
      this.store.next();
    });
  }
}

```

`identify-step.html`:

```html
<section class="step">
  <h2>Identify product</h2>
  <p class="step-hint">
    Find your product by Application ID or Enterprise Data Taxonomy, then select
    it from the results — or create a new one.
  </p>

  <div class="identify-bar">
    <label class="identify-field identify-appid">
      <span class="field-label">Application ID</span>
      <input class="field-input" [formField]="identifyForm.appId" placeholder="e.g. APP-555555" />
    </label>

    <span class="identify-or">OR</span>

    <div class="identify-field identify-grow">
      <span class="field-label">Enterprise Data Taxonomy</span>
      <app-taxonomy-picker
        [selection]="model().categories"
        (selectionChange)="setCategories($event)"
      />
    </div>

    <div class="identify-actions">
      <button type="button" class="btn-primary" (click)="search()">Search products</button>
      <button type="button" class="btn-ghost" (click)="clear()">Clear</button>
    </div>
  </div>

  <p class="identify-tip">
    Tip: enter at least one search criterion. If your product doesn’t exist yet,
    use “Create new product” after searching.
  </p>

  <app-field-error [field]="identifyForm" />

  @if (searched()) {
    <div class="results">
      @if (results.isLoading()) {
        <p class="picker-empty">Searching…</p>
      } @else {
        <p class="results-count">{{ results.value().length }} product(s) found</p>

        @for (product of results.value(); track product.appId) {
          <button
            type="button"
            class="result-row"
            [class.is-selected]="model().appId === product.appId"
            (click)="selectProduct(product)"
          >
            <span class="result-main">
              <span class="result-name">{{ product.name }}</span>
              <span class="result-meta">{{ product.appId }} · {{ product.taxonomy }}</span>
            </span>
            <span class="result-select">
              {{ model().appId === product.appId ? 'Selected' : 'Select' }}
            </span>
          </button>
        }

        <div class="results-create">
          <div>
            <strong>Can’t find your product?</strong>
            <p class="result-meta">If it doesn’t exist yet, register a new one from scratch.</p>
          </div>
          <button type="button" class="btn-secondary" (click)="createNew()">+ Create new product</button>
        </div>
      }
    </div>
  }

  <div class="step-actions">
    <span></span>
    <button type="button" class="btn-primary" (click)="next()">Next</button>
  </div>
</section>

```

`taxonomy-picker.ts`:

```ts
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
                  <span class="tree-badge">L{{ leaf.path.length }}</span>
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
                    <span class="tree-badge">L{{ row.depth + 1 }}</span>
                    <span class="tree-label">{{ row.label }}</span>
                  } @else {
                    <span class="tree-caret" [class.is-open]="isExpanded(row.id)" aria-hidden="true">▸</span>
                    <span class="tree-badge">L{{ row.depth + 1 }}</span>
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
      .tree-badge {
        flex: none;
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-semibold);
        color: var(--color-info);
        background: var(--color-info-tint);
        padding: var(--space-1) var(--space-3);
        border-radius: var(--radius-sm);
      }
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

```

---

## Commit 9 — Basic info step + people picker

**Branch** `feat/basic-info` · **Message** `feat(basic): basic info step + people picker`
**Shell edit:** add `@case ('basic') { <app-basic-step /> }`.

**Files:** `src/app/wizard/steps/basic-step.ts`, `basic-step.html`,
`src/app/shared/people-picker.ts`

**Signal Forms in full here.** `form(model, schema)` with `required` on
name/type/creator/ownership. Inputs bind with `[formField]="basicForm.name"`;
`basicForm.name()` is the `FieldState` (`value()/valid()/touched()/errors()`).
`submit` is the gate before advancing.

Two constraints the step works around:
- `[formField]` forbids `[disabled]`/`[value]`. The product-type and ownership
  selects are fed by `rxResource`, so while loading they show a "Loading…"
  placeholder rather than a bound `[disabled]`.
- The creator field is the **people picker**, not a text box, and it writes
  through `model.update` (same channel tags use) rather than `[formField]`,
  because it emits a chosen object, not raw input.

**The people picker (`people-picker.ts`).** Type a corporate id (`g100231`) or a
name; an `rxResource` keyed off the query hits `searchPeople` and the dropdown
shows name + role. Notes:
- It only searches on a **non-empty** query — empty/focused shows a hint, never
  the whole directory (`params` returns `undefined` to stay idle).
- The visible focus ring is on the *container* via `:focus-within`; the inner
  `<input>` has its own ring suppressed (otherwise the global focus ring clips to
  thin slivers on the left/right).

`basic-step.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  linkedSignal,
} from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { injectDispatch } from '@ngrx/signals/events';
import { Person } from '../../models/product.model';
import { LookupStore } from '../../store/lookup.store';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { FieldError } from '../../shared/field-error';
import { PeoplePicker } from '../../shared/people-picker';

@Component({
  selector: 'app-basic-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldError, PeoplePicker],
  templateUrl: './basic-step.html',
})
export class BasicStep {
  private readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);
  protected readonly lookups = inject(LookupStore);

  // Writable working copy. linkedSignal re-seeds if the store changes underneath
  // (hydrate completing, or jumping back here from Review).
  protected readonly model = linkedSignal(() => this.store.draft().basic);

  protected readonly basicForm = form(this.model, (p) => {
    required(p.name, { message: 'Name is required' });
    required(p.type, { message: 'Type is required' });
    required(p.creator, { message: 'Creator is required' });
    required(p.ownership, { message: 'Ownership is required' });
  });

  // Autosave: push edits into the store on every change (pass-through ref).
  private readonly sync = effect(() => {
    this.dispatch.draftPatched({ basic: this.model() });
  });

  protected next(): void {
    submit(this.basicForm, async () => {
      this.dispatch.pageCompleted('basic');
      this.store.next();
    });
  }

  protected setCreator(person: Person): void {
    this.model.update((m) => ({ ...m, creator: person.name }));
  }

  protected back(): void {
    this.store.prev();
  }
}

```

`basic-step.html`:

```html
<section class="step">
  <h2>Basic info</h2>
  <p class="step-hint">Core details about the product.</p>

  <label class="field">
    <span class="field-label">Name</span>
    <input class="field-input" [formField]="basicForm.name" />
    <app-field-error [field]="basicForm.name" />
  </label>

  <label class="field">
    <span class="field-label">Type</span>
    <select class="field-select" [formField]="basicForm.type">
      <option value="">{{ lookups.productTypes.isLoading() ? 'Loading…' : 'Select a type…' }}</option>
      @for (t of lookups.productTypes.value(); track t) {
        <option [value]="t">{{ t }}</option>
      }
    </select>
    <app-field-error [field]="basicForm.type" />
  </label>

  <label class="field">
    <span class="field-label">Data product creator</span>
    <app-people-picker
      [value]="model().creator"
      (valueChange)="setCreator($event)"
    />
    <app-field-error [field]="basicForm.creator" />
  </label>

  <label class="field">
    <span class="field-label">Ownership</span>
    <select class="field-select" [formField]="basicForm.ownership">
      <option value="">{{ lookups.ownership.isLoading() ? 'Loading…' : 'Select ownership…' }}</option>
      @for (o of lookups.ownership.value(); track o) {
        <option [value]="o">{{ o }}</option>
      }
    </select>
    <app-field-error [field]="basicForm.ownership" />
  </label>

  <div class="step-actions">
    <button type="button" class="btn-secondary" (click)="back()">Back</button>
    <button type="button" class="btn-primary" (click)="next()">Next</button>
  </div>
</section>

```

`people-picker.ts`:

```ts
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
          @if (!query().trim()) {
            <p class="picker-empty">Type a name or corporate id…</p>
          } @else if (results.isLoading()) {
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
      .picker-input:focus, .picker-input:focus-visible { outline: none; box-shadow: none; }
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

  // Searches only while the panel is open and the user has typed something.
  protected readonly results = rxResource<Person[], string | undefined>({
    defaultValue: [],
    params: () => (this.open() && this.query().trim() ? this.query().trim() : undefined),
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

```

---

## Commit 10 — Description & details step

**Branch** `feat/description` · **Message** `feat(description): description & details step`
**Shell edit:** add `@case ('description') { <app-description-step /> }`.

**Files:** `src/app/wizard/steps/description-step.ts`, `description-step.html`

Same per-step pattern (`linkedSignal` + `form` + sync `effect`). A description
textarea and a URL field (validated with a `pattern` for `http(s)://…`), plus the
reusable `TagInput` wired through `model.update`. A focused, low-surface step that
shows the shared widgets composing cleanly.

`description-step.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  linkedSignal,
} from '@angular/core';
import {
  form,
  FormField,
  maxLength,
  pattern,
  required,
  submit,
} from '@angular/forms/signals';
import { injectDispatch } from '@ngrx/signals/events';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { FieldError } from '../../shared/field-error';
import { TagInput } from '../../shared/tag-input';

@Component({
  selector: 'app-description-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldError, TagInput],
  templateUrl: './description-step.html',
})
export class DescriptionStep {
  private readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);

  protected readonly model = linkedSignal(() => this.store.draft().description);

  protected readonly descForm = form(this.model, (p) => {
    required(p.description, { message: 'A description is required' });
    maxLength(p.description, 500, { message: 'Keep it under 500 characters' });
    pattern(p.url, /^https?:\/\/.+/, {
      message: 'Must start with http:// or https://',
    });
  });

  private readonly sync = effect(() => {
    this.dispatch.draftPatched({ description: this.model() });
  });

  protected setTags(tags: string[]): void {
    this.model.update((m) => ({ ...m, tags }));
  }

  protected next(): void {
    submit(this.descForm, async () => {
      this.dispatch.pageCompleted('description');
      this.store.next();
    });
  }

  protected back(): void {
    this.store.prev();
  }
}

```

`description-step.html`:

```html
<section class="step">
  <h2>Description &amp; details</h2>
  <p class="step-hint">Describe the product, add tags, and link a reference.</p>

  <label class="field">
    <span class="field-label">Description</span>
    <textarea class="field-textarea" [formField]="descForm.description"></textarea>
    <app-field-error [field]="descForm.description" />
  </label>

  <div class="field">
    <span class="field-label">Tags</span>
    <app-tag-input [tags]="model().tags" (tagsChange)="setTags($event)" />
  </div>

  <label class="field">
    <span class="field-label">URL</span>
    <input class="field-input" [formField]="descForm.url" placeholder="https://…" />
    <app-field-error [field]="descForm.url" />
  </label>

  <div class="step-actions">
    <button type="button" class="btn-secondary" (click)="back()">Back</button>
    <button type="button" class="btn-primary" (click)="next()">Next</button>
  </div>
</section>

```

---

## Commit 11 — Sources & assets step

**Branch** `feat/sources` · **Message** `feat(sources): sources & assets step`
**Shell edit:** add `@case ('sources') { <app-sources-step /> }`.

**Files:** `src/app/wizard/steps/sources-step.ts`, `sources-step.html`

**The one place that must NOT use `linkedSignal`.** The sources collection lives
in the store as entities, and `store.sourcesEntities()` returns a **new array
reference on every read**. A `linkedSignal` seeded from it would see a "changed"
source on every change and re-seed forever — an infinite loop. So this step seeds
a **plain `signal` once** from `sourcesEntities()` and from then on owns the list
locally, dispatching `sourcesChanged` on edits. This is the deliberate exception
to the per-step pattern, and the reason it exists is worth understanding:
referential identity, not value, drives signal recomputation.

**Form arrays.** The model is `{ items: SourceItem[] }`. Per-item validators come
from `applyEach(p.items, …)`; rows are added/removed via `model.update` with
`crypto.randomUUID()` ids (arrays are never edited through `[formField]`).
Collapsible cards track an `expanded` signal.

`sources-step.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  applyEach,
  form,
  FormField,
  required,
  submit,
} from '@angular/forms/signals';
import { injectDispatch } from '@ngrx/signals/events';
import { SourceItem } from '../../models/product.model';
import { LookupStore } from '../../store/lookup.store';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { FieldError } from '../../shared/field-error';

@Component({
  selector: 'app-sources-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldError],
  templateUrl: './sources-step.html',
})
export class SourcesStep {
  private readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);
  protected readonly lookups = inject(LookupStore);

  // Plain signal, NOT linkedSignal: `sourcesEntities()` returns a fresh array
  // reference on every read, so a linkedSignal working copy would re-seed and
  // feed the autosave effect forever. The component is created on entry (after
  // hydrate), so a one-time seed is correct.
  protected readonly model = signal<{ items: SourceItem[] }>({
    items: this.store.sourcesEntities(),
  });

  protected readonly expanded = signal<string[]>([]);

  protected readonly sourcesForm = form(this.model, (p) => {
    applyEach(p.items, (item) => {
      required(item.kind, { message: 'Pick a type' });
      required(item.location, { message: 'Location is required' });
    });
  });

  private readonly sync = effect(() => {
    this.dispatch.sourcesChanged(this.model().items);
  });

  protected isOpen(id: string): boolean {
    return this.expanded().includes(id);
  }

  protected toggle(id: string): void {
    this.expanded.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  protected add(): void {
    const id = crypto.randomUUID();
    this.model.update((m) => ({
      items: [...m.items, { id, kind: '', location: '', note: '' }],
    }));
    this.expanded.update((ids) => [...ids, id]);
  }

  protected remove(index: number): void {
    this.model.update((m) => ({
      items: m.items.filter((_, i) => i !== index),
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

```

`sources-step.html`:

```html
<section class="step">
  <h2>Sources</h2>
  <p class="step-hint">Add one or more upstream sources for this product.</p>

  @for (item of sourcesForm.items; track $index; let i = $index) {
    <div class="source-card">
      <div class="source-head" (click)="toggle(model().items[i].id)">
        <span class="source-head-title">
          {{ model().items[i].kind || 'New source' }}
          @if (model().items[i].location) {
            — {{ model().items[i].location }}
          }
        </span>
        <button type="button" class="btn-ghost" (click)="remove(i); $event.stopPropagation()">
          Remove
        </button>
      </div>

      @if (isOpen(model().items[i].id)) {
        <div class="source-body">
          <label class="field">
            <span class="field-label">Type</span>
            <select class="field-select" [formField]="item.kind">
              <option value="">{{ lookups.sourceKinds.isLoading() ? 'Loading…' : 'Select a type…' }}</option>
              @for (k of lookups.sourceKinds.value(); track k) {
                <option [value]="k">{{ k }}</option>
              }
            </select>
            <app-field-error [field]="item.kind" />
          </label>

          <label class="field">
            <span class="field-label">Location</span>
            <input class="field-input" [formField]="item.location" placeholder="URL or path" />
            <app-field-error [field]="item.location" />
          </label>

          <label class="field">
            <span class="field-label">Note</span>
            <input class="field-input" [formField]="item.note" />
          </label>
        </div>
      }
    </div>
  }

  <button type="button" class="btn-secondary" (click)="add()">+ Add source</button>

  <div class="step-actions">
    <button type="button" class="btn-secondary" (click)="back()">Back</button>
    <button type="button" class="btn-primary" (click)="next()">Next</button>
  </div>
</section>

```

---

## Commit 12 — Access & classification step

**Branch** `feat/access` · **Message** `feat(access): access & classification cards`
**Shell edit:** add `@case ('access') { <app-access-step /> }`.

**Files:** `src/app/wizard/steps/access-step.ts`, `access-step.html`

Visibility and classification are rendered as selectable **option cards**
(`.option-grid` / `.option-card.is-selected`) rather than raw radios — clicking a
card calls a setter that writes through `model.update`. The form still declares
`required` on both (they always have a default, so it passes, but the rule
documents intent and would catch a future empty default). Tags reuse `TagInput`.

`access-step.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  linkedSignal,
} from '@angular/core';
import { form, required, submit } from '@angular/forms/signals';
import { injectDispatch } from '@ngrx/signals/events';
import { Classification, Visibility } from '../../models/product.model';
import { ProductDraftStore } from '../../store/product-draft.store';
import { wizardEvents } from '../../store/wizard.events';
import { FieldError } from '../../shared/field-error';
import { TagInput } from '../../shared/tag-input';

@Component({
  selector: 'app-access-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldError, TagInput],
  templateUrl: './access-step.html',
  styles: [
    `
      .classification-card .option-card-title { text-transform: capitalize; }
    `,
  ],
})
export class AccessStep {
  private readonly store = inject(ProductDraftStore);
  private readonly dispatch = injectDispatch(wizardEvents);

  protected readonly model = linkedSignal(() => this.store.draft().access);

  protected readonly classifications = [
    'public',
    'internal',
    'confidential',
    'restricted',
  ] as const;

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

```

`access-step.html`:

```html
<section class="step">
  <h2>Access &amp; classification</h2>
  <p class="step-hint">
    Define who can discover and request access to this product, and how it is
    classified for compliance.
  </p>

  <div class="field">
    <span class="field-label">Visibility</span>
    <div class="option-grid">
      <button
        type="button"
        class="option-card"
        [class.is-selected]="model().visibility === 'internal'"
        (click)="setVisibility('internal')"
      >
        <span class="option-card-title">Organization-wide</span>
        <span class="option-card-desc">Anyone in the organization can discover this product and request access.</span>
      </button>
      <button
        type="button"
        class="option-card"
        [class.is-selected]="model().visibility === 'private'"
        (click)="setVisibility('private')"
      >
        <span class="option-card-title">Private</span>
        <span class="option-card-desc">Only explicitly invited users and groups can see and access this product.</span>
      </button>
      <button
        type="button"
        class="option-card"
        [class.is-selected]="model().visibility === 'public'"
        (click)="setVisibility('public')"
      >
        <span class="option-card-title">Public</span>
        <span class="option-card-desc">Discoverable outside the organization.</span>
      </button>
    </div>
    <app-field-error [field]="accessForm.visibility" />
  </div>

  <div class="field">
    <span class="field-label">Data classification</span>
    <div class="option-grid">
      @for (c of classifications; track c) {
        <button
          type="button"
          class="option-card classification-card"
          [class.is-selected]="model().classification === c"
          (click)="setClassification(c)"
        >
          <span class="option-card-title">{{ c }}</span>
        </button>
      }
    </div>
    <app-field-error [field]="accessForm.classification" />
  </div>

  <div class="field">
    <span class="field-label">Tags</span>
    <app-tag-input [tags]="model().tags" (tagsChange)="setTags($event)" />
  </div>

  <div class="step-actions">
    <button type="button" class="btn-secondary" (click)="back()">Back</button>
    <button type="button" class="btn-primary" (click)="next()">Next</button>
  </div>
</section>

```

---

## Commit 13 — Review & submit step

**Branch** `feat/review` · **Message** `feat(review): review & submit step`
**Shell edit:** add `@case ('review') { <app-review-step /> }`.

**Files:** `src/app/wizard/steps/review-step.ts`, `review-step.html`

A read-only summary built straight from `store.draft()` + `store.sourcesEntities()`,
with per-section **Edit** buttons that `goTo` the relevant page. Submit is
disabled until `allRequiredComplete()` and, on success, dispatches `cleared`
(which the reducer turns into "reset draft + remove all sources" and the event
handler turns into "wipe storage"). A `computed` joins the selected taxonomy leaf
labels for display.

`review-step.ts`:

```ts
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

```

`review-step.html`:

```html
<section class="step">
  <h2>Review &amp; submit</h2>
  <p class="step-hint">Check everything, edit any section, then submit.</p>

  <div class="review-block">
    <div class="review-block-head">
      <strong>Identify</strong>
      <button type="button" class="btn-ghost" (click)="edit('identify')">Edit</button>
    </div>
    <div class="review-row">
      <span class="review-key">Application ID</span>
      <span>{{ store.draft().identify.appId || '—' }}</span>
    </div>
    <div class="review-row">
      <span class="review-key">Categories</span>
      <span>
        @if (store.draft().identify.categories.length) {
          {{ identifyCategoryLabels() }}
        } @else {
          —
        }
      </span>
    </div>
  </div>

  <div class="review-block">
    <div class="review-block-head">
      <strong>Basic info</strong>
      <button type="button" class="btn-ghost" (click)="edit('basic')">Edit</button>
    </div>
    <div class="review-row"><span class="review-key">Name</span><span>{{ store.draft().basic.name || '—' }}</span></div>
    <div class="review-row"><span class="review-key">Type</span><span>{{ store.draft().basic.type || '—' }}</span></div>
    <div class="review-row"><span class="review-key">Creator</span><span>{{ store.draft().basic.creator || '—' }}</span></div>
    <div class="review-row"><span class="review-key">Ownership</span><span>{{ store.draft().basic.ownership || '—' }}</span></div>
  </div>

  <div class="review-block">
    <div class="review-block-head">
      <strong>Description</strong>
      <button type="button" class="btn-ghost" (click)="edit('description')">Edit</button>
    </div>
    <div class="review-row"><span class="review-key">Description</span><span>{{ store.draft().description.description || '—' }}</span></div>
    <div class="review-row"><span class="review-key">Tags</span><span>{{ store.draft().description.tags.join(', ') || '—' }}</span></div>
    <div class="review-row"><span class="review-key">URL</span><span>{{ store.draft().description.url || '—' }}</span></div>
  </div>

  <div class="review-block">
    <div class="review-block-head">
      <strong>Sources</strong>
      <button type="button" class="btn-ghost" (click)="edit('sources')">Edit</button>
    </div>
    @if (store.sourcesEntities().length) {
      @for (s of store.sourcesEntities(); track s.id) {
        <div class="review-row">
          <span class="review-key">{{ s.kind || '—' }}</span>
          <span>{{ s.location || '—' }}</span>
        </div>
      }
    } @else {
      <div class="review-row"><span>—</span></div>
    }
  </div>

  <div class="review-block">
    <div class="review-block-head">
      <strong>Access</strong>
      <button type="button" class="btn-ghost" (click)="edit('access')">Edit</button>
    </div>
    <div class="review-row"><span class="review-key">Visibility</span><span>{{ store.draft().access.visibility }}</span></div>
    <div class="review-row"><span class="review-key">Classification</span><span>{{ store.draft().access.classification }}</span></div>
    <div class="review-row"><span class="review-key">Tags</span><span>{{ store.draft().access.tags.join(', ') || '—' }}</span></div>
  </div>

  <div class="step-actions">
    <button type="button" class="btn-secondary" (click)="edit('access')">Back</button>
    <button
      type="button"
      class="btn-primary"
      [disabled]="!store.allRequiredComplete()"
      (click)="submit()"
    >
      Submit
    </button>
  </div>
</section>

```

---

## Applying it as commits

```bash
# from the scaffolded project (Commit 0 already in place)
git checkout -b feat/design-tokens
#  …add the Commit 1 files…  then:
git add -A && git commit -m "feat(design): token layer + universal control styles"

git checkout -b feat/model-events
#  …add the Commit 2 files…  then commit, and so on.
```

Foundation commits (1–7) are a linear stack. Step commits (8–13) each branch off
Commit 7 and touch only their own files plus one `@switch` line, so they don't
conflict and can land in any order or in parallel. Review 8 and 9 most carefully
— they introduce the two shared pickers; the rest reuse what's already proven.
