# Product registration wizard

A 6-page wizard built on **Angular 22**, **NgRx Signal Store v21** (state,
entities, custom features, and the events plugin) and the experimental
**Signal Forms** API. Compiles clean under `strict` + `strictTemplates`.

```bash
npm install --legacy-peer-deps   # NgRx 21 has no Angular 22 peer entry yet
ng serve
```

---

## The mental model

Three things own state, and they are kept deliberately separate:

| Owner | Owns | Lives in |
| --- | --- | --- |
| **Signal Forms** | per-field value, validity, touched/dirty, errors | each step component |
| **`ProductDraftStore`** | the merged draft, navigation, sources, persistence | the wizard route (scoped) |
| **`LookupStore`** | dropdown options fetched from the API | root (app-wide cache) |

They meet at exactly **one seam**: the `model` signal that each page binds its
`form()` to. Everything below explains the two halves of that seam — the store
half first, then the forms half.

---

# Part 1 — The store, with NgRx Signal Store

NgRx Signal Store is not a global Redux singleton. It is a **factory** that
builds an ordinary Angular injectable out of small composable pieces called
*features*. `signalStore(...features)` returns a class you provide and `inject`
like any service. Each feature adds signals, computed values, methods, or
lifecycle behaviour, and every later feature can see what earlier ones added.

This project has two stores: `ProductDraftStore` (the wizard's working state)
and `LookupStore` (cached reference data).

## The state primitives

These are the building blocks every feature is made of.

### `withState` — the source signals

`withState` declares state. Each top-level key becomes a **readonly signal** on
the store.

```ts
withState<{ draft: ProductDraft }>({ draft: INITIAL_DRAFT })
// -> store.draft() is a Signal<ProductDraft>
```

State is never mutated in place. You update it with **`patchState`**, which
takes either a partial object or updater functions and produces a new immutable
value:

```ts
patchState(store, { currentPage: page });
```

`getState(store)` returns a plain snapshot of *all* state at once — used here to
serialize everything to localStorage.

### `withComputed` — derived signals

`withComputed` adds memoized `computed()` signals derived from state. They
recompute only when their inputs change.

```ts
withComputed((store) => ({
  allRequiredComplete: computed(() =>
    REQUIRED_PAGES.every((p) => store.completedPages().includes(p)),
  ),
}))
```

`allRequiredComplete()` is what gates the Submit button on the review page.

### `withMethods` — behaviour

`withMethods` adds methods that read signals and call `patchState`. This is
where imperative actions live (navigation, persistence).

```ts
withMethods((store) => ({
  goTo(page: ProductPage) { patchState(store, { currentPage: page }); },
}))
```

### `withProps` — attaching non-state members

`withProps` attaches arbitrary properties to the store that are **not** patchable
state — here, the `rxResource` instances in `LookupStore` (see below). Use it
when you want something on the store that manages its own lifecycle.

### `withHooks` — lifecycle

`withHooks` runs code on `onInit` / `onDestroy`. The persistence feature uses
`onInit` to rehydrate from localStorage the moment the store is created:

```ts
withHooks({
  onInit(store) {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) patchState(store, JSON.parse(raw)); // keys match the state shape
  },
})
```

## `withEntities` — the repeatable collection (sources)

Sources are a list the user adds to, so they are modelled as a **normalized
entity collection** rather than a plain array. `entityConfig` describes the
collection; `withEntities` adds the machinery.

```ts
export const sourceConfig = entityConfig({
  entity: type<SourceItem>(),   // the row type (type<T>() is a compile-time marker)
  collection: 'sources',        // names the state keys
  selectId: (s) => s.id,        // the primary key
});

withEntities(sourceConfig)
```

That single line gives the store, for the `sources` collection:

- `sourcesEntityMap` and `sourcesIds` — the normalized storage (a map + an
  ordered id list),
- `sourcesEntities()` — a **computed array** rebuilt from the map/ids,

plus updater helpers used inside the reducer: `setAllEntities(items, config)`
replaces the whole collection, `removeAllEntities(config)` clears it. (The full
toolkit also has `addEntity`, `updateEntity`, `removeEntity`, etc.) Because the
storage is just more signals, it serializes and rehydrates with everything else.

## Custom features — `signalStoreFeature`

`signalStoreFeature` bundles the primitives above into a **reusable feature** you
can drop into any store. This project has two, which is what keeps the main store
readable.

**`withWizardNavigation(pages)`** — owns `currentPage` + `completedPages`
(`withState`), derives `currentIndex` / `isFirst` / `isLast` / `progress`
(`withComputed`), and exposes `goTo` / `next` / `prev` (`withMethods`). Pure UI
state with no side effects, so it is plain methods, not events.

**`withDraftPersistence(storageKey)`** — owns `lastSavedAt`, and the *mechanism*
of persistence: `persistNow()` writes `getState` to localStorage, `clearStorage()`
removes it, and `onInit` rehydrates. It does **not** decide *when* to save — the
main store wires that to events. "Mechanism here, policy there" is the reason it
is a separate, reusable feature.

## The events plugin — one-way data flow

The interesting part. Instead of components calling store methods to mutate
state, components **dispatch events**, and the store decides what each event
does. This keeps a single, readable inventory of everything that can happen.

### `eventGroup` — the typed inventory

```ts
export const wizardEvents = eventGroup({
  source: 'Product Wizard',
  events: {
    draftPatched: type<Partial<{ identify; basic; description; access }>>(),
    sourcesChanged: type<SourceItem[]>(),
    pageCompleted: type<ProductPage>(),
    saveRequested: type<void>(),
    cleared: type<void>(),
  },
});
```

Each entry is an **event creator**; `type<Payload>()` carries the payload type
(no runtime value — `type<void>()` means no payload).

### `injectDispatch` — how components fire events

```ts
private readonly dispatch = injectDispatch(wizardEvents);
// ...
this.dispatch.pageCompleted('basic');     // fully typed
```

### `on` + `withReducer` — how events become state

A **reducer** turns events into state. `on(event, (event, state) => …)` is a case
reducer; its return can be a partial state object, an entity updater, or an array
mixing both. `withReducer` registers the cases.

```ts
withReducer(
  on(wizardEvents.draftPatched, ({ payload }, state) => ({
    draft: { ...state.draft, ...payload },          // partial state
  })),
  on(wizardEvents.sourcesChanged, ({ payload }) =>
    setAllEntities(payload, sourceConfig),          // entity updater
  ),
  on(wizardEvents.cleared, () => [
    { draft: INITIAL_DRAFT, completedPages: [], currentPage: PAGES[0].id },
    removeAllEntities(sourceConfig),                // array of both
  ]),
)
```

Reducers are the **only** place draft/entity state changes. Components can't
reach in and mutate.

### `Events` + `withEventHandlers` — side effects

Reducers are pure (event in, state out). Anything with a side effect — saving to
localStorage, an HTTP call — goes through `withEventHandlers`, which subscribes
to the `Events` bus. `events.on(...)` returns an Observable of dispatched events,
so you get the full RxJS toolbox (here, debouncing the autosave):

```ts
withEventHandlers((store, events = inject(Events)) => ({
  autosave$: events
    .on(wizardEvents.draftPatched, wizardEvents.sourcesChanged,
        wizardEvents.pageCompleted, wizardEvents.saveRequested)
    .pipe(debounceTime(400), tap(() => store.persistNow())),
  clearOnReset$: events
    .on(wizardEvents.cleared)
    .pipe(tap(() => store.clearStorage())),
}))
```

This is the autosave/"save in case of emergency" guarantee: every meaningful
event nudges a debounced write; the reducer keeps state correct; the handler
keeps localStorage in sync.

### Scoping with `provideDispatcher`

The store and its event bus are provided at the **wizard route**, not in root:

```ts
{ path: '', component: Wizard, providers: [provideDispatcher(), ProductDraftStore] }
```

`provideDispatcher()` creates a scoped event bus so dispatches stay local to the
wizard, and both the store and the draft die when you leave the route — exactly
what you want for a "start fresh next time" form.

## `LookupStore` — `rxResource` for API data

Dropdown options are *server data*, not draft state, so they live in a separate
root store built from resources. A **resource** is a reactive async read: it
exposes `.value()`, `.isLoading()`, and `.error()` as signals and refetches when
its inputs change.

```ts
export const LookupStore = signalStore(
  { providedIn: 'root' },
  withProps(() => ({
    productTypes: rxResource<string[], void>({
      defaultValue: [],
      stream: () => of(PRODUCT_TYPES).pipe(delay(LATENCY)),  // swap for HttpClient
    }),
    // ownership, sourceKinds, categoryRoots ...
  })),
  withMethods(() => {
    const childrenCache = new Map<string, CategoryOption[]>();
    return {
      categoryChildren(parentId: string) { /* cached -> instant on return */ },
      searchCategories(query: string) { /* ... */ },
    };
  }),
);
```

Flat lists are `rxResource`s loaded once and cached app-wide. The cascade and
search are *parameterised*, so each step drives its own `rxResource` keyed off
the selected parent (see Part 2). Going live = replace `of(...)` with an HTTP
call, or swap `rxResource` for `httpResource(() => '/api/...')`; nothing in the
components changes.

## How the whole store is assembled

Order matters — each feature sees the ones before it:

```ts
export const ProductDraftStore = signalStore(
  withWizardNavigation(PAGES),                 // 1 nav state + methods
  withState<{ draft: ProductDraft }>({ ... }), // 2 the draft
  withEntities(sourceConfig),                  // 3 sources collection
  withComputed(...),                           // 4 gating/derived
  withReducer(...),                            // 5 events -> state
  withDraftPersistence(STORAGE_KEY),           // 6 persistence mechanism
  withEventHandlers(...),                      // 7 autosave side effects
);
```

---

# Part 2 — Signal Forms

Signal Forms build a **field tree over a writable model signal**. You give
`form()` a signal holding your data and a schema describing validation; you get
back a tree whose nodes are bound to inputs with the `[formField]` directive, and
whose state (value/validity/touched/errors) is read as signals.

## The model bridge — `linkedSignal`

A form needs a *writable* signal to bind to, but the store's state is read-only
(`patchState` only). The bridge is a per-page **`linkedSignal`** seeded from a
store slice:

```ts
protected readonly model = linkedSignal(() => this.store.draft().basic);
protected readonly basicForm = form(this.model, (p) => { /* schema */ });
```

`linkedSignal` is a writable signal whose value is *derived* from a source, and
**re-seeds when that source changes**. So the form is editable, but if the store
changes underneath (hydrate completing, or the user jumping back from Review),
the working copy refreshes to match.

Edits flow back to the store through one autosave effect:

```ts
private readonly sync = effect(() => {
  this.dispatch.draftPatched({ basic: this.model() });
});
```

This is loop-safe because the reducer passes the section **reference straight
through** (`{ ...draft, ...payload }`), so the round-trip lands on the same object
identity and the `linkedSignal` doesn't re-emit.

> **The one exception — sources.** That page uses a plain `signal`, not
> `linkedSignal`, because `sourcesEntities()` returns a *new array reference*
> every read; a linkedSignal would re-seed → fire the effect → re-seed forever.
> The component is created on entry (after hydrate), so a one-time seed is
> correct.

## `form()` and the schema (validation)

The second argument to `form()` is a schema. Validators attach to field paths and
read like rules:

```ts
form(this.model, (p) => {
  required(p.description, { message: 'A description is required' });
  maxLength(p.description, 500, { message: 'Keep it under 500 characters' });
  pattern(p.url, /^https?:\/\/.+/, { message: 'Must start with http(s)://' });
});
```

For repeating rows, `applyEach` runs a sub-schema per array item — used on the
sources page:

```ts
form(this.model, (p) => {
  applyEach(p.items, (item) => {
    required(item.kind, { message: 'Pick a type' });
    required(item.location, { message: 'Location is required' });
  });
});
```

## Binding and reading field state

Two ways to touch a field:

- **`form.name`** is the *structural path* (a `FieldTree`). You pass it to the
  directive: `[formField]="basicForm.name"`. For arrays, `form.items` is the
  array path and `form.items.length` is its length (no parens — structural).
- **`form.name()`** *calls* the field and returns its **`FieldState`**, whose
  members are signals: `value()`, `valid()`, `invalid()`, `touched()`,
  `dirty()`, `errors()`.

```html
<input class="field-input" [formField]="basicForm.name" />
```

The directive owns the control's value and disabled state, so a few native
attributes (`[value]`, `[disabled]`, `min`/`max`) must **not** be combined with
`[formField]`.

### Arrays/tags are edited through the model, not the directive

`[formField]` binds scalar inputs. A tag list (`string[]`) is updated by writing
the model directly:

```ts
protected setTags(tags: string[]): void {
  this.model.update((m) => ({ ...m, tags }));
}
```

That's what `<app-tag-input>` does behind its `(tagsChange)` output.

## `submit()` — the validation gate

`submit(form, async cb)` marks every field touched (so errors show) and runs the
callback **only if the form is valid**. That's how "Next" both validates and
advances:

```ts
protected next(): void {
  submit(this.basicForm, async () => {
    this.dispatch.pageCompleted('basic');
    this.store.next();
  });
}
```

## The reusable error component

The repeated touched/errors markup is one generic component, typed over the
field's value type so it stays fully checked:

```ts
@Component({
  selector: 'app-field-error',
  template: `
    @let state = field()();
    @if (state.touched() && state.errors().length) {
      <span class="field-error">{{ state.errors()[0]?.message }}</span>
    }
  `,
})
export class FieldError<T> {
  readonly field = input.required<Field<T>>();   // Field<T> = () => FieldState<T>
}
```

`field()` reads the input (the field accessor); `field()()` calls the field to
get its state. Usage: `<app-field-error [field]="basicForm.name" />`.

---

## End to end: one keystroke

1. You type in **Name**. The `[formField]` directive writes the page's `model`
   (`linkedSignal`) — a new `BasicInfoData` object.
2. The page's `effect` reads `model()` and dispatches `draftPatched({ basic })`.
3. `withReducer`'s `on(draftPatched)` merges it into `draft` (same ref → no
   linkedSignal loop). The store's signals update; `progress` and the review
   page recompute.
4. `withEventHandlers`' `autosave$` sees the event, waits 400 ms, and calls
   `persistNow()` → `getState` → localStorage.
5. Reload the tab: the persistence `onInit` rehydrates the whole state; each
   page's `linkedSignal` re-seeds from it. You're exactly where you left off.

---

## File map

```
store/
  product-draft.store.ts        # assembles the wizard store (state + events + autosave)
  wizard.events.ts              # the eventGroup (typed event inventory)
  lookup.store.ts               # root store of rxResource dropdown data (+ children cache)
  features/
    with-wizard-navigation.ts   # custom feature: currentPage / completedPages / progress
    with-draft-persistence.ts   # custom feature: hydrate-on-init / persistNow / clear
wizard/
  wizard.ts/.html/.scss         # shell: progress bar, step tabs, @switch over steps
  steps/*.ts/.html              # one component per page (form + linkedSignal bridge)
shared/
  field-error.ts                # generic <app-field-error [field]>
  tag-input.ts                  # presentational <app-tag-input [tags] (tagsChange)>
models/
  product.model.ts              # types, page order, initial draft, category option types
```
