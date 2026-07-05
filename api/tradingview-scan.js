const { readBody, sendJson, sendText } = require("./_market-utils");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readBody(request);
    const payload = JSON.parse(body || "{}");
    const market = typeof payload.market === "string" ? payload.market : "america";
    const upstream = await fetch(`https://scanner.tradingview.com/${market}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload.scan || {})
    });
    sendText(response, upstream.status, upstream.headers.get("content-type") || "application/json", await upstream.text());
  } catch {
    sendJson(response, 502, { error: "TradingView scanner proxy failed" });
  }
};
