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
  appNumber: string;
  creator: string;
  productLink: string;
  version: string;
  ownership: string;
}

// A titled document link (multiple per product).
export interface DocumentLink {
  title: string;
  link: string;
}

export interface DescriptionData {
  description: string;
  documents: DocumentLink[];
  tags: string[];
}

export interface AccessData {
  visibility: Visibility;
  classification: Classification;
  compliance: string[]; // regulated-data tags: PII, GDPR, SOX, HIPAA, PCI-DSS
  accessProcess: 'approval' | 'auto';
  adGroup: string; // only when accessProcess === 'approval'
  tags: string[];
}

// Regulated-data options for the Access step (hardcoded).
export const COMPLIANCE_TAGS = ['PII', 'GDPR', 'SOX', 'HIPAA', 'PCI-DSS'];

export type Visibility = 'private' | 'internal' | 'public';
export type Classification =
  | 'public'
  | 'internal'
  | 'confidential'
  | 'restricted';

// Sources are managed as a keyed entity collection, not as part of the draft.
export interface SourceItem {
  id: string;
  name: string; // optional friendly name; falls back to "Unnamed Asset"
  kind: string; // asset type (category) — drives the platform options
  platform: string; // platform/tool, dependent on `kind`
  location: string;
  note: string;
}

// Page-level delivery/refresh metadata for the Sources step. One set per
// product (NOT per asset), with hardcoded option lists.
export interface DeliveryData {
  refreshFrequency: string;
  refreshMethod: string; // only meaningful when refreshFrequency === 'Scheduled'
  slaTarget: string;
  typicalDataLag: string;
}

export const INITIAL_DELIVERY: DeliveryData = {
  refreshFrequency: '',
  refreshMethod: '',
  slaTarget: '',
  typicalDataLag: '',
};

// The serializable, per-page draft. Sources live in the entity collection.
export interface ProductDraft {
  identify: IdentifyData;
  basic: BasicInfoData;
  description: DescriptionData;
  delivery: DeliveryData;
  access: AccessData;
}

// Initial values: never null/undefined (Signal Forms requirement).
export const INITIAL_DRAFT: ProductDraft = {
  identify: { appId: '', categories: [] },
  basic: { name: '', type: '', appNumber: '', creator: '', productLink: '', version: '', ownership: '' },
  description: { description: '', documents: [], tags: [] },
  delivery: INITIAL_DELIVERY,
  access: {
    visibility: 'internal',
    classification: 'internal',
    compliance: [],
    accessProcess: 'approval',
    adGroup: '',
    tags: [],
  },
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

// A directory associate, as returned by the search API. The four core fields
// are always present; the rest of the table's columns are optional in the UI
// (the API always returns them, but most screens don't need them).
export interface AssociateDto {
  corpId: string;
  fullName: string;
  jobTitle: string;
  preferredName: string;
  businessUnit?: string;
  groupName?: string;
  email?: string;
  // add any remaining associates columns here (optional in the UI)
}

// A product returned by the "Search products" lookup on the identify step.
export interface ProductHit {
  appId: string;
  name: string;
  taxonomy: string;
}
