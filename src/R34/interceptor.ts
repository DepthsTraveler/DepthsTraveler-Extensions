import { PaperbackInterceptor, type Request, type Response } from "@paperback/types";

/**
 * Image downloads get the extension's own user agent and the site's page as
 * the referer. A faked browser user agent gets blocked: Danbooru's image
 * server refuses clients that claim to be a browser but don't connect like
 * one. Original files are always used, since resizing services keep only a
 * GIF's first frame.
 */
const IMAGE_HOSTS: [RegExp, string][] = [
  [/(^|\.)e621\.net$|(^|\.)e926\.net$/i, "https://e621.net/"],
  [/(^|\.)donmai\.us$/i, "https://danbooru.donmai.us/"],
  [/(^|\.)gelbooru\.com$/i, "https://gelbooru.com/"],
  [/(^|\.)rule34\.xxx$/i, "https://rule34.xxx/"],
  [/(^|\.)paheal(-cdn)?\.net$/i, "https://rule34.paheal.net/"],
];

const API_PATHS = /(\/posts(\/\d+)?\.json|page=dapi|\/api\/danbooru\/)/i;

export const USER_AGENT = "R34-Paperback/1.0 (by DepthsTraveler on GitHub)";

/** Sets headers without leaving a second copy under different capitalization. */
function withHeaders(headers: Record<string, string> | undefined, overrides: Record<string, string>): Record<string, string> {
  const replaced = new Set(Object.keys(overrides).map((k) => k.toLowerCase()));
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (!replaced.has(key.toLowerCase())) result[key] = value;
  }
  return { ...result, ...overrides };
}

export class R34Interceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    const host = request.url.match(/^https?:\/\/([^/:?#]+)/i)?.[1] ?? "";
    const referer = IMAGE_HOSTS.find(([pattern]) => pattern.test(host))?.[1];
    if (!referer) return request;
    if (API_PATHS.test(request.url)) {
      return { ...request, headers: withHeaders(request.headers, { "user-agent": USER_AGENT }) };
    }
    return { ...request, headers: withHeaders(request.headers, { "user-agent": USER_AGENT, referer }) };
  }

  override async interceptResponse(_request: Request, _response: Response, data: ArrayBuffer): Promise<ArrayBuffer> {
    return data;
  }
}
