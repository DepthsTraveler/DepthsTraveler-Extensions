import type { BooruPost } from "./models";

/**
 * Content that sexualizes minors is never shown. These tags are sent as
 * exclusions on sites that accept them, checked on every post before it is
 * displayed, and searches for them return nothing. There is no setting for this.
 */
const EXCLUDED_TAGS = new Set([
  "loli",
  "lolicon",
  "shota",
  "shotacon",
  "toddlercon",
  "toddler",
  "child",
  "children",
  "kid",
  "young",
  "younger",
  "cub",
  "underage",
  "minor",
  "preteen",
  "teenager",
  "infant",
  "baby",
  "aged_down",
  "age_regression",
  "school_uniform_child",
]);

/** Tags most likely to match, sent as exclusions where a site's tag limit allows. */
export const SERVER_EXCLUSIONS = [
  "loli",
  "shota",
  "lolicon",
  "shotacon",
  "toddlercon",
  "young",
  "child",
  "cub",
  "underage",
  "aged_down",
];

function normalize(tag: string): string {
  return tag.trim().toLowerCase().replace(/^-/, "").replace(/\s+/g, "_");
}

export function isExcludedTag(tag: string): boolean {
  return EXCLUDED_TAGS.has(normalize(tag));
}

/** True when a search asks for excluded content (negated tags are fine). */
export function searchAsksForExcluded(tags: string[]): boolean {
  return tags.some((tag) => !tag.startsWith("-") && isExcludedTag(tag));
}

export function isAllowed(post: BooruPost, hiddenTags: Set<string>): boolean {
  return !post.tags.some((tag) => isExcludedTag(tag) || hiddenTags.has(normalize(tag)));
}

export function parseTagList(text: string): Set<string> {
  return new Set(text.split(/[\s,]+/).map(normalize).filter(Boolean));
}
