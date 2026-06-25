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
  productName: string;
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
  identify: { appId: '', categories: [],productName:''},
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