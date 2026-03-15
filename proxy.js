const http = require("http");
const https = require("https");
const { URL } = require("url");

const PORT = process.env.PORT || 8787;
const UPSTREAM = "https://api.pokemontcg.io";
const API_KEY = process.env.POKEMON_TCG_API_KEY || "";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");
  res.setHeader("Access-Control-Max-Age", "86400");
}

http
  .createServer((req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, UPSTREAM);
    const headers = {
      ...req.headers,
      host: url.host,
    };
    if (API_KEY && !headers["x-api-key"]) {
      headers["x-api-key"] = API_KEY;
    }

    const upstreamReq = https.request(
      url,
      {
        method: req.method,
        headers,
      },
      (upstreamRes) => {
        setCors(res);
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      }
    );

    upstreamReq.on("error", () => {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Bad Gateway");
    });

    if (req.method === "GET" || req.method === "HEAD") {
      upstreamReq.end();
      return;
    }
    req.pipe(upstreamReq);
  })
  .listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Proxy running on http://localhost:${PORT}`);
  });
