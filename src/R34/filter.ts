import type { BooruPost } from "./models";

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
