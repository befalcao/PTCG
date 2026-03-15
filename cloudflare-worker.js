/**
 * Cloudflare Worker: CORS proxy for Pokemon TCG API v2
 *
 * 목적: GitHub Pages (ou qualquer front-end) consiga chamar a API sem erros de CORS.
 *
 * Deploy:
 * - wrangler init
 * - wrangler deploy
 *
 * Config:
 * - (opcional) defina um secret API_KEY no worker:
 *   wrangler secret put API_KEY
 *
 * Uso:
 * - Frontend chama: https://<seu-worker>.workers.dev/v2/cards?q=...
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    // Preserve path+query but force upstream host.
    const upstream = new URL(`https://api.pokemontcg.io${url.pathname}${url.search}`);

    const headers = new Headers(request.headers);
    headers.delete("Host");

    // Prefer secret API_KEY, but allow passing X-Api-Key from the client.
    if (env.API_KEY && !headers.get("X-Api-Key")) {
      headers.set("X-Api-Key", env.API_KEY);
    }

    const upstreamResponse = await fetch(upstream.toString(), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? null : request.body,
    });

    const responseHeaders = new Headers(upstreamResponse.headers);
    // Ensure CORS is always present.
    Object.entries(corsHeaders).forEach(([key, value]) => responseHeaders.set(key, value));
    // Avoid caching surprises while iterating; can be relaxed later.
    responseHeaders.set("Cache-Control", "no-store");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
};

