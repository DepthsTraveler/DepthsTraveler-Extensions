import {
  type Chapter,
  type ChapterDetails,
  ContentRating,
  type DiscoverSection,
  type DiscoverSectionItem,
  DiscoverSectionType,
  type ExtensionImpl,
  type Form,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SortingOption,
  type SourceManga,
  type TagSection,
} from "@paperback/types";
import {
  type Album,
  albumId,
  albumTitle,
  fetchAlbumPosts,
  formatDay,
  groupByDay,
  isAlbumId,
  loadAlbumDay,
  parseAlbumId,
  saveAlbumDays,
} from "./album";
import { isAllowed, parseTagList, searchAsksForExcluded } from "./filter";
import type { BooruPost, R34Metadata } from "./models";
import type pbconfig from "./pbconfig";
import { getCredentials, getHiddenTagsText, getHomeSites, R34SettingsForm } from "./settings";
import { R34Interceptor } from "./interceptor";
import { getSite, SITES, type Site, type SortOrder } from "./sites";

const SORT_LABELS: Record<SortOrder, string> = { new: "Newest", score: "Popular", gif: "GIFs" };
/** Home rows per site, in this order. */
const HOME_ORDER: SortOrder[] = ["score", "new", "gif"];
const HOME_TITLES: Record<SortOrder, string> = { score: "Popular", new: "Latest", gif: "GIFs" };

/** Paperback IDs allow letters, digits and ._-@()[]%?#+=/&: only. */
function sortId(site: Site, sort: SortOrder): string {
  return `${site.id}-${sort}`;
}

function parseSortId(id: string): [string, SortOrder] {
  const [siteId, sort] = id.split("-");
  return [siteId ?? "", (sort ?? "new") as SortOrder];
}

function isUsable(site: Site): boolean {
  return !site.needsKey || !!getCredentials(site.id as "rule34xxx" | "gelbooru");
}

function pretty(tag: string): string {
  return tag.replace(/_/g, " ").trim();
}

function tagId(value: string): string {
  return value.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._\-@()[\]%?#+=/&:]/g, "") || "tag";
}

function postTitle(post: BooruPost, siteName: string): string {
  const characters = post.characters.slice(0, 2).map(pretty);
  const series = post.copyrights[0] ? pretty(post.copyrights[0]) : "";
  const artist = post.artists[0] ? pretty(post.artists[0]) : "";
  let title = characters.join(", ");
  if (series && !title) title = series;
  else if (series) title += ` (${series})`;
  if (artist) title = title ? `${title} by ${artist}` : `by ${artist}`;
  return title || `${siteName} #${post.id}`;
}

function encodeId(post: BooruPost): string {
  return `${post.site}:${post.id}`;
}

function decodeId(mangaId: string): { site: Site; postId: string } {
  const [siteId, postId] = mangaId.split(":");
  if (!siteId || !postId) throw new Error("This post link isn't valid.");
  return { site: getSite(siteId), postId };
}

export class R34Extension implements ExtensionImpl<typeof pbconfig> {
  private interceptor = new R34Interceptor("r34-images");

  async initialise(): Promise<void> {
    this.interceptor.registerInterceptor();
  }

  private hiddenTags(): Set<string> {
    return parseTagList(getHiddenTagsText());
  }

  private visible(posts: BooruPost[]): BooruPost[] {
    const hidden = this.hiddenTags();
    return posts.filter((post) => isAllowed(post, hidden));
  }

  /** A single post, or an error if it doesn't exist or isn't allowed. */
  private async loadPost(mangaId: string): Promise<{ site: Site; post: BooruPost }> {
    const { site, postId } = decodeId(mangaId);
    const post = await site.getPost(postId);
    if (!post || !isAllowed(post, this.hiddenTags())) {
      throw new Error("This post isn't available.");
    }
    return { site, post };
  }

  // Home page -----------------------------------------------------------------

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const home = new Set(getHomeSites());
    return SITES.filter((site) => home.has(site.id) && isUsable(site)).flatMap((site) =>
      HOME_ORDER.filter((sort) => site.sorts.includes(sort)).map((sort) => ({
        id: sortId(site, sort),
        title: `${site.name}: ${HOME_TITLES[sort]}`,
        type: DiscoverSectionType.simpleCarousel,
      })),
    );
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: R34Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const [siteId, sort] = parseSortId(section.id);
    const site = getSite(siteId);
    const page = metadata?.page ?? 1;
    const result = await site.search([], page, sort);
    return {
      items: this.visible(result.posts).map((post) => ({
        type: "simpleCarouselItem",
        mangaId: encodeId(post),
        imageUrl: post.previewUrl,
        title: postTitle(post, site.name),
        subtitle: `★ ${post.score}`,
        contentRating: post.rating,
      })),
      metadata: result.hasMore ? { page: page + 1 } : undefined,
    };
  }

  // Search ----------------------------------------------------------------------

  async getSortingOptions(): Promise<SortingOption[]> {
    return SITES.filter(isUsable).flatMap((site) =>
      site.sorts.map((sort) => ({ id: sortId(site, sort), label: `${site.name}: ${SORT_LABELS[sort]}` })),
    );
  }

  async getSearchResults(
    query: SearchQuery<R34Metadata>,
    metadata: R34Metadata | undefined,
    sortingOption: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const fallback = SITES.find(isUsable) ?? getSite("e621");
    const [siteId, sort] = parseSortId(sortingOption?.id || sortId(fallback, "new"));
    const site = getSite(siteId);
    const tags = (query.title ?? "").trim().split(/\s+/).filter(Boolean);
    if (searchAsksForExcluded(tags)) return { items: [] };

    const page = metadata?.page ?? 1;
    const result = await site.search(tags, page, sort);
    const posts = this.visible(result.posts);
    const items: SearchResultItem[] = posts.map((post) => ({
      mangaId: encodeId(post),
      imageUrl: post.previewUrl,
      title: postTitle(post, site.name),
      subtitle: `★ ${post.score}`,
      contentRating: post.rating,
    }));
    // First result: the whole search as an album that can go in the library.
    if (page === 1 && tags.length > 0 && posts[0]) {
      const album: Album = { site, sort: sort === "gif" ? "gif" : "new", tags };
      items.unshift({
        mangaId: albumId(site, album.sort, tags),
        imageUrl: posts[0].previewUrl,
        title: albumTitle(album),
        subtitle: "Every post in one place",
        contentRating: ContentRating.ADULT,
      });
    }
    return { items, metadata: result.hasMore ? { page: page + 1 } : undefined };
  }

  // Albums ----------------------------------------------------------------------

  private async albumDetails(mangaId: string): Promise<SourceManga> {
    const album = parseAlbumId(mangaId);
    if (searchAsksForExcluded(album.tags)) throw new Error("This album isn't available.");
    const first = this.visible((await album.site.search(album.tags, 1, album.sort)).posts)[0];
    return {
      mangaId,
      mangaInfo: {
        primaryTitle: albumTitle(album),
        secondaryTitles: [],
        thumbnailUrl: first?.previewUrl ?? "",
        synopsis: `Posts from ${album.site.name} tagged ${album.tags.join(" ")}${album.sort === "gif" ? ", GIFs only" : ""}. One chapter per upload day. Add it to your library and library updates bring in new posts.`,
        contentRating: ContentRating.ADULT,
        status: "Ongoing",
        tagGroups: [
          {
            id: "search",
            title: "Search",
            tags: album.tags.map((t) => ({ id: tagId(t), title: pretty(t) })),
          },
        ],
      },
    };
  }

  private async albumChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const album = parseAlbumId(sourceManga.mangaId);
    if (searchAsksForExcluded(album.tags)) return [];
    const days = groupByDay(await fetchAlbumPosts(album, (p) => this.visible(p)));
    saveAlbumDays(sourceManga.mangaId, days);
    return days.map((d, i) => ({
      chapterId: d.day,
      sourceManga,
      title: `${formatDay(d.day)} (${d.pages.length} post${d.pages.length === 1 ? "" : "s"})`,
      chapNum: i + 1,
      langCode: "en",
      publishDate: new Date(d.time),
      sortingIndex: i,
    }));
  }

  private async albumChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const mangaId = chapter.sourceManga.mangaId;
    let pages = loadAlbumDay(mangaId, chapter.chapterId);
    if (!pages) {
      await this.albumChapters(chapter.sourceManga);
      pages = loadAlbumDay(mangaId, chapter.chapterId);
    }
    if (!pages?.length) throw new Error("This day's posts are no longer in the album. Refresh the album.");
    return { id: chapter.chapterId, mangaId, pages };
  }

  // Posts -----------------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    if (isAlbumId(mangaId)) return this.albumDetails(mangaId);
    const { site, post } = await this.loadPost(mangaId);
    const named = new Set([...post.artists, ...post.characters, ...post.copyrights]);
    const groups: [string, string, string[]][] = [
      ["artists", "Artists", post.artists],
      ["characters", "Characters", post.characters],
      ["copyrights", "Series", post.copyrights],
      ["tags", "Tags", post.tags.filter((t) => !named.has(t)).slice(0, 80)],
    ];
    const tagGroups: TagSection[] = groups
      .filter(([, , tags]) => tags.length > 0)
      .map(([id, title, tags]) => ({
        id,
        title,
        tags: tags.map((t) => ({ id: tagId(t), title: pretty(t) })),
      }));

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: postTitle(post, site.name),
        secondaryTitles: [`${site.name} #${post.id}`],
        thumbnailUrl: post.previewUrl,
        synopsis: `${site.name} post #${post.id}. Score ${post.score}.`,
        author: post.artists.map(pretty).join(", ") || undefined,
        rating: undefined,
        contentRating: post.rating === ContentRating.EVERYONE ? ContentRating.EVERYONE : post.rating,
        status: "Completed",
        tagGroups,
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    if (isAlbumId(sourceManga.mangaId)) return this.albumChapters(sourceManga);
    const { postId } = decodeId(sourceManga.mangaId);
    return [
      {
        chapterId: postId,
        sourceManga,
        title: "Image",
        chapNum: 1,
        langCode: "en",
      },
    ];
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    if (isAlbumId(chapter.sourceManga.mangaId)) return this.albumChapterDetails(chapter);
    const { post } = await this.loadPost(chapter.sourceManga.mangaId);
    return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages: [post.fileUrl] };
  }

  // Settings ----------------------------------------------------------------------

  async getSettingsForm(): Promise<Form> {
    return new R34SettingsForm();
  }
}

export const R34 = new R34Extension();
