export interface PracticeFunction {
  id: number;
  title: string;
  risks: string[];
  sops: string[];
  controls: string[];
  metrics: string[];
}

export interface PracticeSection {
  id: number;
  title: string;
  text: string;
}

export interface PracticeSearchResult {
  id: number;
  title: string;
  excerpt: string;
}
