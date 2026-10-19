import type { BooruPost } from "./models";
import { getAlbumPages } from "./settings";
import { getSite, type Site, type SortOrder } from "./sites";

/**
 * An album is a saved search: its manga ID holds the site, sort and tags, so
 * Paperback can add it to the library like a series. Its chapters are the
 * search's posts grouped by upload day, so a library update brings in new
 * posts as a new or longer chapter for today.
 */
export interface Album {
  site: Site;
  sort: SortOrder;
  tags: string[];
}

export interface AlbumDay {
  /** "2026-10-19" in the device's time zone. */
  day: string;
  time: number;
  /** Full-size files, oldest first. */
  pages: string[];
}

const PREFIX = "album:";

/** Paperback IDs allow only letters, digits and ._-@()[]%?#+=/&: */
function encodeTags(tags: string[]): string {
  return encodeURIComponent(tags.join(" ")).replace(
    /[!'()*~]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function albumId(site: Site, sort: SortOrder, tags: string[]): string {
  return `${PREFIX}${site.id}:${sort}:${encodeTags(tags)}`;
}

export function isAlbumId(mangaId: string): boolean {
  return mangaId.startsWith(PREFIX);
}

export function parseAlbumId(mangaId: string): Album {
  const [siteId, sort, encoded] = mangaId.slice(PREFIX.length).split(":");
  if (!siteId || !sort || encoded === undefined) throw new Error("This album link isn't valid.");
  const tags = decodeURIComponent(encoded).split(/\s+/).filter(Boolean);
  return { site: getSite(siteId), sort: sort as SortOrder, tags };
}

export function albumTitle(album: Album): string {
  const kind = album.sort === "gif" ? "GIFs" : "Album";
  return `${kind}: ${album.tags.join(" ")} (${album.site.name})`;
}

function dayKey(time: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fetches the newest posts (up to the album size in settings), newest first. */
export async function fetchAlbumPosts(
  album: Album,
  visible: (posts: BooruPost[]) => BooruPost[],
): Promise<BooruPost[]> {
  const posts: BooruPost[] = [];
  const seen = new Set<string>();
  const pages = getAlbumPages();
  for (let page = 1; page <= pages; page++) {
    // e621 asks for at most 2 requests a second; the others are fine with this too.
    if (page > 1) await Application.sleep(0.6);
    const result = await album.site.search(album.tags, page, album.sort);
    for (const post of visible(result.posts)) {
      if (!seen.has(post.id)) {
        seen.add(post.id);
        posts.push(post);
      }
    }
    if (!result.hasMore) break;
  }
  return posts;
}

/** Groups posts by upload day, oldest day first. */
export function groupByDay(posts: BooruPost[]): AlbumDay[] {
  const days = new Map<string, AlbumDay>();
  for (const post of posts) {
    // Posts without a date (rare) go with the newest day already seen.
    const last = [...days.values()].pop();
    const time = post.createdAt ?? last?.time ?? Date.now();
    const key = dayKey(time);
    let day = days.get(key);
    if (!day) {
      day = { day: key, time, pages: [] };
      days.set(key, day);
    }
    day.pages.push(post.fileUrl);
  }
  // Posts arrive newest first; read each day oldest first.
  return [...days.values()]
    .map((d) => ({ ...d, pages: d.pages.reverse() }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function cacheKey(mangaId: string): string {
  return `r34_album_${mangaId}`;
}

export function saveAlbumDays(mangaId: string, days: AlbumDay[]): void {
  const pages: Record<string, string[]> = {};
  for (const d of days) pages[d.day] = d.pages;
  Application.setState(pages, cacheKey(mangaId));
}

export function loadAlbumDay(mangaId: string, day: string): string[] | undefined {
  const stored = Application.getState(cacheKey(mangaId)) as Record<string, string[]> | undefined;
  return stored?.[day];
}

export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][(m ?? 1) - 1];
  return `${month} ${d}, ${y}`;
}

