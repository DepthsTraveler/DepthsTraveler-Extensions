import { ContentRating, type Request } from "@paperback/types";
import * as cheerio from "cheerio";
import { SERVER_EXCLUSIONS } from "./filter";
import type { BooruPost, PostPage, SiteId } from "./models";
import { getCredentials } from "./settings";

export const PAGE_SIZE = 30;

const USER_AGENT = "R34-Paperback/1.0 (by DepthsTraveler on GitHub)";
const IMAGE_FILE = /\.(jpe?g|png|gif|webp|avif)(\?|$)/i;

export type SortOrder = "new" | "score" | "gif";

export interface Site {
  id: SiteId;
  name: string;
  /** Most tags one search accepts, counting sort and exclusion tags. */
  tagLimit: number;
  sorts: SortOrder[];
  /** Credentials needed before the site can be used. */
  needsKey: boolean;
  search(tags: string[], page: number, sort: SortOrder): Promise<PostPage>;
  getPost(id: string): Promise<BooruPost | undefined>;
}

async function get(url: string): Promise<{ status: number; body: string }> {
  const request: Request = { url, method: "GET", headers: { "user-agent": USER_AGENT } };
  const [response, data] = await Application.scheduleRequest(request);
  return { status: response.status, body: Application.arrayBufferToUTF8String(data) };
}

function parseJson<T>(body: string, site: string): T | undefined {
  const text = body.trim();
  if (!text) return undefined;
  if (!text.startsWith("{") && !text.startsWith("[")) {
    throw new Error(`${site}: ${text.slice(0, 160)}`);
  }
  return JSON.parse(text) as T;
}

/** Adds exclusion tags while the site's tag limit allows. */
function withExclusions(tags: string[], extra: string[], limit: number): string[] {
  const result = [...tags, ...extra];
  for (const tag of SERVER_EXCLUSIONS) {
    if (result.length >= limit) break;
    const negated = `-${tag}`;
    if (!result.includes(negated)) result.push(negated);
  }
  return result;
}

function checkTagLimit(site: Site, tags: string[], extra: string[]): void {
  if (tags.length + extra.length > site.tagLimit) {
    const room = site.tagLimit - extra.length;
    throw new Error(
      `${site.name} allows ${room} search tag${room === 1 ? "" : "s"}${extra.length ? " with this sort" : ""}. Remove some tags and try again.`,
    );
  }
}

function isImage(url: string | null | undefined): url is string {
  return !!url && IMAGE_FILE.test(url);
}

const GIF_FILE = /\.gif(\?|$)/i;

/** For the GIFs sort: keep only real GIF files, since some sites' GIF tags are loose. */
function onlyGifs(posts: BooruPost[], sort: SortOrder): BooruPost[] {
  return sort === "gif" ? posts.filter((p) => p.isGif) : posts;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Parses the dates the sites send: ISO (e621, Danbooru), "Mon Oct 19 10:47:25 +0200 2026"
 * (rule34.xxx, Gelbooru) and "2016-07-13 14:57:58.370539" in UTC (paheal).
 */
export function parseDate(text: string | null | undefined): number | undefined {
  const value = (text ?? "").trim();
  if (!value) return undefined;
  const dapi = value.match(/^\w{3} (\w{3}) (\d{1,2}) (\d\d):(\d\d):(\d\d) ([+-])(\d\d)(\d\d) (\d{4})$/);
  if (dapi) {
    const [, mon, day, h, m, sec, sign, oh, om, year] = dapi;
    const month = MONTHS.indexOf((mon ?? "").toLowerCase());
    if (month < 0) return undefined;
    const offset = (Number(oh) * 60 + Number(om)) * (sign === "-" ? -1 : 1);
    return Date.UTC(Number(year), month, Number(day), Number(h), Number(m), Number(sec)) - offset * 60000;
  }
  const plain = value.match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)(?:\.\d+)?(Z|[+-]\d\d:?\d\d)?$/);
  if (plain) {
    const [, y, mo, d, h, m, sec, zone] = plain;
    let time = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(m), Number(sec));
    if (zone && zone !== "Z") {
      const z = zone.replace(":", "");
      const offset = (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5))) * (z[0] === "-" ? -1 : 1);
      time -= offset * 60000;
    }
    return time;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function splitTags(text: string | null | undefined): string[] {
  return (text ?? "").split(/\s+/).filter(Boolean);
}

function ratingFromLetter(rating: string | null | undefined): ContentRating {
  switch ((rating ?? "").toLowerCase()) {
    case "g":
    case "s":
    case "safe":
    case "general":
      return ContentRating.EVERYONE;
    case "q":
    case "questionable":
    case "sensitive":
      return ContentRating.MATURE;
    default:
      return ContentRating.ADULT;
  }
}

// ---------------------------------------------------------------------------
// rule34.xxx and Gelbooru: the Gelbooru "dapi" format, API key required.

interface DapiPost {
  id: number | string;
  file_url?: string;
  preview_url?: string;
  sample_url?: string;
  tags?: string;
  rating?: string;
  score?: number | string | null;
  created_at?: string;
}

function dapiPost(site: SiteId, post: DapiPost): BooruPost | undefined {
  if (!isImage(post.file_url)) return undefined;
  return {
    site,
    id: String(post.id),
    fileUrl: post.file_url,
    previewUrl: post.preview_url || post.sample_url || post.file_url,
    tags: splitTags(post.tags),
    artists: [],
    characters: [],
    copyrights: [],
    score: Number(post.score) || 0,
    rating: ratingFromLetter(post.rating),
    isGif: GIF_FILE.test(post.file_url),
    createdAt: parseDate(post.created_at),
  };
}

/** rule34.xxx's JSON leaves out the upload date, so it is read as XML. */
function dapiXmlPosts(xml: string, name: string): DapiPost[] {
  const text = xml.trim();
  if (!text) return [];
  if (text.startsWith("[") || text.startsWith("{")) {
    const json = JSON.parse(text) as DapiPost[] | { post?: DapiPost[] };
    return Array.isArray(json) ? json : (json.post ?? []);
  }
  if (!text.startsWith("<")) throw new Error(`${name}: ${text.slice(0, 160)}`);
  const $ = cheerio.load(text, { xmlMode: true });
  const failure = $("response[success='false']").attr("reason");
  if (failure) throw new Error(`${name}: ${failure}`);
  return $("post")
    .toArray()
    .map((el) => $(el).attr() as unknown as DapiPost);
}

function dapiSite(id: "rule34xxx" | "gelbooru", name: string, base: string, gifTags: string[]): Site {
  const site: Site = {
    id,
    name,
    tagLimit: 40,
    sorts: ["new", "score", "gif"],
    needsKey: true,
    async search(tags, page, sort) {
      const extra = sort === "score" ? ["sort:score:desc", "-video"] : sort === "gif" ? gifTags : [];
      checkTagLimit(site, tags, extra);
      const query = withExclusions(tags, extra, site.tagLimit);
      const posts = await dapiRequest(`limit=${PAGE_SIZE}&pid=${page - 1}&tags=${encodeURIComponent(query.join(" "))}`);
      return {
        posts: onlyGifs(
          posts.map((p) => dapiPost(id, p)).filter((p): p is BooruPost => !!p),
          sort,
        ),
        hasMore: posts.length >= PAGE_SIZE,
      };
    },
    async getPost(postId) {
      const posts = await dapiRequest(`id=${encodeURIComponent(postId)}`);
      return posts[0] ? dapiPost(id, posts[0]) : undefined;
    },
  };

  async function dapiRequest(params: string): Promise<DapiPost[]> {
    const credentials = getCredentials(id);
    if (!credentials) {
      throw new Error(`${name} needs your user ID and API key. Add them in the R34 extension settings.`);
    }
    const auth = `&user_id=${encodeURIComponent(credentials.userId)}&api_key=${encodeURIComponent(credentials.apiKey)}`;
    const json1 = id === "rule34xxx" ? "" : "json=1&";
    const { status, body } = await get(`${base}/index.php?page=dapi&s=post&q=index&${json1}${params}${auth}`);
    if (status === 401 || status === 403) {
      throw new Error(`${name} rejected the user ID or API key. Check them in the R34 extension settings.`);
    }
    if (id === "rule34xxx") return dapiXmlPosts(body, name);
    const json = parseJson<DapiPost[] | { post?: DapiPost[] }>(body, name);
    if (!json) return [];
    return Array.isArray(json) ? json : (json.post ?? []);
  }

  return site;
}

// ---------------------------------------------------------------------------
// e621

interface E621Post {
  id: number;
  file: { url: string | null };
  preview: { url: string | null };
  sample: { url: string | null };
  tags: Record<string, string[]>;
  score: { total: number };
  rating: string;
  created_at?: string;
}

function e621Post(post: E621Post): BooruPost | undefined {
  if (!isImage(post.file.url)) return undefined;
  const tags = post.tags ?? {};
  return {
    site: "e621",
    id: String(post.id),
    fileUrl: post.file.url,
    previewUrl: post.preview.url || post.sample.url || post.file.url,
    tags: Object.values(tags).flat(),
    artists: (tags.artist ?? []).filter((a) => !["conditional_dnp", "sound_warning", "unknown_artist"].includes(a)),
    characters: tags.character ?? [],
    copyrights: tags.copyright ?? [],
    score: post.score?.total ?? 0,
    rating: ratingFromLetter(post.rating),
    isGif: GIF_FILE.test(post.file.url),
    createdAt: parseDate(post.created_at),
  };
}

const e621: Site = {
  id: "e621",
  name: "e621",
  tagLimit: 40,
  sorts: ["new", "score", "gif"],
  needsKey: false,
  async search(tags, page, sort) {
    // Top-scored posts are mostly videos, which Paperback can't show, so
    // videos are left out on e621's side. With no search tags (the home
    // page), Popular means this week's top posts.
    const extra =
      sort === "score"
        ? ["order:score", ...(tags.length === 0 ? ["date:week"] : [])]
        : sort === "gif"
          ? ["type:gif"]
          : [];
    checkTagLimit(e621, tags, extra);
    const query = withExclusions(tags, [...extra, "-type:webm", "-type:mp4", "-type:swf"], e621.tagLimit);
    const { body } = await get(
      `https://e621.net/posts.json?limit=${PAGE_SIZE}&page=${page}&tags=${encodeURIComponent(query.join(" "))}`,
    );
    const posts = parseJson<{ posts: E621Post[] }>(body, "e621")?.posts ?? [];
    return {
      posts: onlyGifs(posts.map(e621Post).filter((p): p is BooruPost => !!p), sort),
      hasMore: posts.length >= PAGE_SIZE,
    };
  },
  async getPost(id) {
    const { status, body } = await get(`https://e621.net/posts/${encodeURIComponent(id)}.json`);
    if (status === 404) return undefined;
    const post = parseJson<{ post: E621Post }>(body, "e621")?.post;
    return post ? e621Post(post) : undefined;
  },
};

// ---------------------------------------------------------------------------
// Danbooru: 2 tags per search without an account, so exclusions are checked
// on each post instead of sent with the search.

interface DanbooruPost {
  id: number;
  file_url?: string;
  large_file_url?: string;
  preview_file_url?: string;
  tag_string?: string;
  tag_string_artist?: string;
  tag_string_character?: string;
  tag_string_copyright?: string;
  score?: number;
  rating?: string;
  created_at?: string;
}

function danbooruPost(post: DanbooruPost): BooruPost | undefined {
  if (!isImage(post.file_url)) return undefined;
  return {
    site: "danbooru",
    id: String(post.id),
    fileUrl: post.file_url,
    previewUrl: post.preview_file_url || post.large_file_url || post.file_url,
    tags: splitTags(post.tag_string),
    artists: splitTags(post.tag_string_artist),
    characters: splitTags(post.tag_string_character),
    copyrights: splitTags(post.tag_string_copyright),
    score: post.score ?? 0,
    rating: ratingFromLetter(post.rating),
    isGif: GIF_FILE.test(post.file_url),
    createdAt: parseDate(post.created_at),
  };
}

const danbooru: Site = {
  id: "danbooru",
  name: "Danbooru",
  tagLimit: 2,
  sorts: ["new", "score", "gif"],
  needsKey: false,
  async search(tags, page, sort) {
    // order:rank is Danbooru's "popular right now"; order:score across the
    // whole site times out on their database.
    const extra = sort === "score" ? ["order:rank"] : sort === "gif" ? ["filetype:gif"] : [];
    checkTagLimit(danbooru, tags, extra);
    const query = [...tags, ...extra];
    const { body } = await get(
      `https://danbooru.donmai.us/posts.json?limit=${PAGE_SIZE}&page=${page}&tags=${encodeURIComponent(query.join(" "))}`,
    );
    const json = parseJson<DanbooruPost[] | { message?: string }>(body, "Danbooru");
    if (json && !Array.isArray(json)) throw new Error(`Danbooru: ${json.message ?? "search failed"}`);
    const posts = json ?? [];
    return {
      posts: onlyGifs(posts.map(danbooruPost).filter((p): p is BooruPost => !!p), sort),
      hasMore: posts.length >= PAGE_SIZE,
    };
  },
  async getPost(id) {
    const { status, body } = await get(`https://danbooru.donmai.us/posts/${encodeURIComponent(id)}.json`);
    if (status === 404) return undefined;
    const post = parseJson<DanbooruPost>(body, "Danbooru");
    return post ? danbooruPost(post) : undefined;
  },
};

// ---------------------------------------------------------------------------
// rule34.paheal.net: Danbooru-style XML API, 3 tags per search.

function pahealPosts(xml: string): BooruPost[] {
  if (!xml.trim().startsWith("<posts") && !xml.trim().startsWith("<?xml")) {
    throw new Error("rule34.paheal.net: search failed. It allows 3 tags per search.");
  }
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("post")
    .toArray()
    .map((el): BooruPost | undefined => {
      const a = $(el).attr();
      // Paheal's file links have no extension; the type is in file_name.
      if (!a?.file_url || !IMAGE_FILE.test(a.file_name ?? "")) return undefined;
      return {
        site: "paheal",
        id: a.id ?? "",
        fileUrl: a.file_url,
        previewUrl: a.preview_url || a.file_url,
        tags: splitTags(a.tags),
        artists: [],
        characters: [],
        copyrights: [],
        score: Number(a.score) || 0,
        rating: ContentRating.ADULT,
        isGif: GIF_FILE.test(a.file_name ?? ""),
        // Paheal's dates have no time zone; they are UTC.
        createdAt: parseDate(a.date ? `${a.date}Z` : undefined),
      };
    })
    .filter((p): p is BooruPost => !!p && !!p.id);
}

const paheal: Site = {
  id: "paheal",
  name: "rule34.paheal.net",
  tagLimit: 3,
  sorts: ["new", "gif"],
  needsKey: false,
  async search(tags, page, sort) {
    const extra = sort === "gif" ? ["gif"] : [];
    checkTagLimit(paheal, tags, extra);
    const query = withExclusions(tags, extra, paheal.tagLimit);
    const { body } = await get(
      `https://rule34.paheal.net/api/danbooru/find_posts?limit=${PAGE_SIZE}&page=${page}&tags=${encodeURIComponent(query.join(" "))}`,
    );
    const posts = onlyGifs(pahealPosts(body), sort);
    const count = Number(body.match(/<posts[^>]*count='(\d+)'/)?.[1] ?? 0);
    return { posts, hasMore: page * PAGE_SIZE < count };
  },
  async getPost(id) {
    const { body } = await get(`https://rule34.paheal.net/api/danbooru/find_posts?id=${encodeURIComponent(id)}`);
    return pahealPosts(body)[0];
  },
};

export const SITES: Site[] = [
  dapiSite("rule34xxx", "rule34.xxx", "https://api.rule34.xxx", ["gif", "-video"]),
  e621,
  danbooru,
  dapiSite("gelbooru", "Gelbooru", "https://gelbooru.com", ["animated_gif", "-video"]),
  paheal,
];

export function getSite(id: string): Site {
  const site = SITES.find((s) => s.id === id);
  if (!site) throw new Error(`Unknown site: ${id}`);
  return site;
}
