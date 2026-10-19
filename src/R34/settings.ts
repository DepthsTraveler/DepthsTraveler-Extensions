import { Form, InputRow, LabelRow, Section, SelectRow, StepperRow, type ListSectionElement } from "@paperback/types";
import type { SiteId } from "./models";

const HOME_SITES_KEY = "r34_home_sites";
const HIDDEN_TAGS_KEY = "r34_hidden_tags";
const ALBUM_PAGES_KEY = "r34_album_pages";

/** Posts are fetched 30 at a time; an album holds this many batches. */
export const DEFAULT_ALBUM_PAGES = 10;

const SITE_NAMES: Record<SiteId, string> = {
  rule34xxx: "rule34.xxx",
  e621: "e621",
  danbooru: "Danbooru",
  gelbooru: "Gelbooru",
  paheal: "rule34.paheal.net",
};

const DEFAULT_HOME_SITES: SiteId[] = ["rule34xxx", "e621", "danbooru", "gelbooru", "paheal"];

export interface Credentials {
  userId: string;
  apiKey: string;
}

function credentialKey(site: SiteId, field: "user" | "key"): string {
  return `r34_${site}_${field}`;
}

export function getCredentials(site: SiteId): Credentials | undefined {
  const userId = (Application.getSecureState(credentialKey(site, "user")) as string | null) ?? "";
  const apiKey = (Application.getSecureState(credentialKey(site, "key")) as string | null) ?? "";
  return userId.trim() && apiKey.trim() ? { userId: userId.trim(), apiKey: apiKey.trim() } : undefined;
}

function setCredential(site: SiteId, field: "user" | "key", value: string): void {
  Application.setSecureState(value.trim() || null, credentialKey(site, field));
}

export function getHomeSites(): SiteId[] {
  const stored = Application.getState(HOME_SITES_KEY) as SiteId[] | undefined;
  return Array.isArray(stored) ? stored : DEFAULT_HOME_SITES;
}

export function getHiddenTagsText(): string {
  return (Application.getState(HIDDEN_TAGS_KEY) as string | undefined) ?? "";
}

export function getAlbumPages(): number {
  const stored = Number(Application.getState(ALBUM_PAGES_KEY));
  return stored >= 1 && stored <= 30 ? stored : DEFAULT_ALBUM_PAGES;
}

export class R34SettingsForm extends Form {
  override getSections(): ListSectionElement[] {
    return [
      Section(
        {
          id: "home",
          header: "Home Page",
          footer: "rule34.xxx and Gelbooru only show once their API key is added below.",
        },
        [
          SelectRow("home-sites", {
            title: "Sites on the home page",
            value: getHomeSites(),
            minItemCount: 0,
            maxItemCount: DEFAULT_HOME_SITES.length,
            options: DEFAULT_HOME_SITES.map((id) => ({ id, title: SITE_NAMES[id] })),
            onValueChange: Application.Selector(this as R34SettingsForm, "onHomeSitesChange"),
          }),
        ],
      ),
      this.keySection(
        "rule34xxx",
        "rule34.xxx: log in, open My Account, then Options, and generate an API key under API Access Credentials. Copy the user ID and key it shows.",
      ),
      this.keySection(
        "gelbooru",
        "Gelbooru: log in, open My Account, then Options, and copy the user ID and API key under API Access Credentials.",
      ),
      Section(
        {
          id: "hidden",
          header: "Hidden Tags",
          footer: "Posts with any of these tags are never shown. Separate tags with spaces.",
        },
        [
          InputRow("hidden-tags", {
            title: "Tags",
            value: getHiddenTagsText(),
            onValueChange: Application.Selector(this as R34SettingsForm, "onHiddenTagsChange"),
          }),
        ],
      ),
      Section(
        {
          id: "albums",
          header: "Albums",
          footer:
            "Searching tags shows an Album entry first. Add it to your library and library updates add new posts, one chapter per day. Bigger albums take longer to update.",
        },
        [
          StepperRow("album-pages", {
            title: "Newest posts kept",
            subtitle: `${getAlbumPages() * 30} posts`,
            value: getAlbumPages(),
            minValue: 1,
            maxValue: 30,
            stepValue: 1,
            loopOver: false,
            onValueChange: Application.Selector(this as R34SettingsForm, "onAlbumPagesChange"),
          }),
        ],
      ),
      Section("about", [
        LabelRow("about", {
          title: "Videos are skipped",
          subtitle: "Paperback can only show images, so video posts don't appear.",
        }),
      ]),
    ];
  }

  private keySection(site: "rule34xxx" | "gelbooru", footer: string): ListSectionElement {
    const saved = getCredentials(site);
    return Section({ id: `${site}-keys`, header: `${SITE_NAMES[site]} API Key`, footer }, [
      InputRow(`${site}-user`, {
        title: "User ID",
        value: saved?.userId ?? "",
        onValueChange: Application.Selector(
          this as R34SettingsForm,
          site === "rule34xxx" ? "onRule34UserChange" : "onGelbooruUserChange",
        ),
      }),
      InputRow(`${site}-key`, {
        title: "API key",
        value: saved?.apiKey ?? "",
        isSecureEntry: true,
        onValueChange: Application.Selector(
          this as R34SettingsForm,
          site === "rule34xxx" ? "onRule34KeyChange" : "onGelbooruKeyChange",
        ),
      }),
    ]);
  }

  async onHomeSitesChange(value: string[]): Promise<void> {
    Application.setState(value, HOME_SITES_KEY);
  }

  async onAlbumPagesChange(value: number): Promise<void> {
    Application.setState(value, ALBUM_PAGES_KEY);
    this.reloadForm();
  }

  async onHiddenTagsChange(value: string): Promise<void> {
    Application.setState(value, HIDDEN_TAGS_KEY);
  }

  async onRule34UserChange(value: string): Promise<void> {
    setCredential("rule34xxx", "user", value);
  }

  async onRule34KeyChange(value: string): Promise<void> {
    setCredential("rule34xxx", "key", value);
  }

  async onGelbooruUserChange(value: string): Promise<void> {
    setCredential("gelbooru", "user", value);
  }

  async onGelbooruKeyChange(value: string): Promise<void> {
    setCredential("gelbooru", "key", value);
  }
}
