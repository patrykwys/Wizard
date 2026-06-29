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
const SOURCE_KINDS = [
  'Database / Table',
  'API',
  'File',
  'Dashboard',
  'Report',
  'Published Dataset',
];

// Platform/Tool options per asset type — the dependent dropdown's source.
const PLATFORMS_BY_TYPE: Record<string, string[]> = {
  'Database / Table': ['Snowflake', 'Oracle', 'SQL Server', 'PostgreSQL', 'BigQuery'],
  API: ['REST', 'GraphQL', 'gRPC', 'SOAP'],
  File: ['Amazon S3', 'Azure Blob', 'Google Cloud Storage', 'SFTP', 'Local'],
  Dashboard: ['Tableau', 'Power BI', 'Looker', 'Qlik'],
  Report: ['Tableau', 'Power BI', 'SSRS', 'Cognos'],
  'Published Dataset': ['Tableau', 'Power BI', 'Collibra', 'Snowflake'],
};

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

// Mock Active Directory groups for the access-request typeahead.
const AD_GROUPS: string[] = [
  'APP-BI-Reports-Consumer-View',
  'APP-BI-Reports-Production-Support',
  'APP-BI-Reports-Data-Admin',
  'APP-BI-Reports-Read-Only',
  'APP-BI-Reports-Power-Users',
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
    // Platform/Tool options for a given asset type (empty until a type is set).
    platformsFor(type: string): string[] {
      return PLATFORMS_BY_TYPE[type] ?? [];
    },
    // Active Directory group typeahead (empty query -> no results).
    searchAdGroups(query: string): Observable<string[]> {
      const needle = query.trim().toLowerCase();
      const matches = needle
        ? AD_GROUPS.filter((g) => g.toLowerCase().includes(needle))
        : [];
      return of(matches).pipe(delay(LATENCY));
    },
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
