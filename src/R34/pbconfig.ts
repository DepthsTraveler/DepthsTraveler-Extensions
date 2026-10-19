import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";

export default {
  name: "R34",
  description: "Booru image sites from r34.app: rule34.xxx, e621, Danbooru, Gelbooru and rule34.paheal.net.",
  version: "1.2.1",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.ADULT,
  capabilities: [
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.SETTINGS_FORM_PROVIDING,
  ],
  badges: [{ label: "18+", textColor: "#FFFFFF", backgroundColor: "#B00020" }],
  developers: [{ name: "DepthsTraveler", github: "https://github.com/DepthsTraveler" }],
} satisfies ExtensionInfo;
