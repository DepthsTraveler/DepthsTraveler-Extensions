import type { ContentRating } from "@paperback/types";

export type SiteId = "rule34xxx" | "e621" | "danbooru" | "gelbooru" | "paheal";

export interface BooruPost {
  site: SiteId;
  id: string;
  /** Full-size image. */
  fileUrl: string;
  previewUrl: string;
  /** All tags, flat. */
  tags: string[];
  artists: string[];
  characters: string[];
  copyrights: string[];
  score: number;
  rating: ContentRating;
  /** True for GIF files. */
  isGif: boolean;
  /** Upload time in ms since 1970, when the site gives one. */
  createdAt?: number;
}

export interface PostPage {
  posts: BooruPost[];
  /** False when the site returned fewer posts than asked for. */
  hasMore: boolean;
}

export type R34Metadata = {
  page: number;
};
