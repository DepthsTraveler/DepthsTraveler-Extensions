import { PaperbackInterceptor, type Request, type Response } from "@paperback/types";

/**
 * Image downloads get a browser user agent and the site's own page as the
 * referer, the way a browser loads them, so image servers don't refuse them.
 * Original files are always used: resizing services keep only a GIF's first
 * frame. API requests keep the extension's own user agent, which e621 requires.
 */
const IMAGE_HOSTS: [RegExp, string][] = [
  [/(^|\.)e621\.net$|(^|\.)e926\.net$/i, "https://e621.net/"],
  [/(^|\.)donmai\.us$/i, "https://danbooru.donmai.us/"],
  [/(^|\.)gelbooru\.com$/i, "https://gelbooru.com/"],
  [/(^|\.)rule34\.xxx$/i, "https://rule34.xxx/"],
  [/(^|\.)paheal(-cdn)?\.net$/i, "https://rule34.paheal.net/"],
];

const API_PATHS = /(\/posts(\/\d+)?\.json|page=dapi|\/api\/danbooru\/)/i;

const BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

export class R34Interceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    if (API_PATHS.test(request.url)) return request;
    const host = request.url.match(/^https?:\/\/([^/:?#]+)/i)?.[1] ?? "";
    const referer = IMAGE_HOSTS.find(([pattern]) => pattern.test(host))?.[1];
    if (!referer) return request;
    return {
      ...request,
      headers: {
        ...request.headers,
        "user-agent": BROWSER_UA,
        referer,
        accept: "image/avif,image/webp,image/png,image/gif,image/jpeg,*/*",
      },
    };
  }

  override async interceptResponse(_request: Request, _response: Response, data: ArrayBuffer): Promise<ArrayBuffer> {
    return data;
  }
}
