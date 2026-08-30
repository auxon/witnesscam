/**
 * Strip the /witnesscam prefix so static assets in dist/ map onto the
 * entangleit.com/witnesscam* route without colliding with the portfolio SPA.
 */
import { handleBilling } from "./worker/stripe.ts";

const PREFIX = "/witnesscam";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === PREFIX) {
      url.pathname = `${PREFIX}/`;
      return Response.redirect(url.toString(), 308);
    }

    if (!url.pathname.startsWith(`${PREFIX}/`)) {
      return new Response("Not found", { status: 404 });
    }

    const stripped = url.pathname.slice(PREFIX.length) || "/";
    const billed = await handleBilling(request, env, stripped);
    if (billed) return billed;

    const assetUrl = new URL(stripped + url.search, url.origin);
    const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (asset.status !== 404) return asset;

    if (/\.[a-z0-9]+$/i.test(stripped)) {
      return new Response("Not found", { status: 404 });
    }

    return env.ASSETS.fetch(
      new Request(new URL("/index.html", url.origin), request),
    );
  },
};
