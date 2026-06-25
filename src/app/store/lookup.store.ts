import { signalStore, withMethods, withProps } from '@ngrx/signals';
import { rxResource } from '@angular/core/rxjs-interop';
import { delay, Observable, of } from 'rxjs';
import { Person, TaxonomyNode } from '../models/product.model';

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
          { id: 'fin-gl-journal', label: 'Journal Entries' },
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
        : PEOPLE;
      return of(matches).pipe(delay(LATENCY));
    },
  })),
);
