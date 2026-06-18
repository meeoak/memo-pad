export type ArticlePurpose =
  | "product-review"
  | "korea-travel"
  | "place-review"
  | "k-beauty"
  | "k-news";

export type ImageRole = "featured" | "body" | "thumbnail";

export type ImageAsset = {
  id: string;
  name: string;
  role: ImageRole;
  width: number;
  height: number;
  alt: string;
  placement: string;
  previewUrl?: string;
};

export type ArticleInput = {
  topic: string;
  purpose: ArticlePurpose;
  koreanMemo: string;
  referenceLinks: string;
  experienceDate: string;
  placeOrProduct: string;
  category: string;
  tags: string;
  internalLinks: string;
  publishDate: string;
  images: ImageAsset[];
};

export type ChecklistItem = {
  label: string;
  status: "good" | "warning" | "danger";
  detail: string;
};

export type AdsenseScore = {
  originalExperience: number;
  thinContentRisk: number;
  aiToneRisk: number;
  policyRisk: number;
  mobileReadability: number;
  duplicateSentenceRatio: number;
  adLikeRisk: number;
  wordCount: number;
  checklist: ChecklistItem[];
};

export type PublishPackage = {
  wordpressTitle: string;
  seoTitle: string;
  metaDescription: string;
  slug: string;
  category: string;
  tags: string[];
  bodyHtml: string;
  imageAlts: Array<{ name: string; alt: string }>;
  archiveCardTitle: string;
  archiveCardDescription: string;
  prePublishChecklist: ChecklistItem[];
};
