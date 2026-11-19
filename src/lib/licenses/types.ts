export interface LicenseSource {
  url: string;
  label: string;
}

export type LicenseBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "blockquote"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export interface LicenseReference {
  id: string;
  tabLabel: string;
  license?: string;
  title: string;
  status: string;
  last_verified: string;
  review_days: number;
  sources: LicenseSource[];
  blocks: LicenseBlock[];
}
