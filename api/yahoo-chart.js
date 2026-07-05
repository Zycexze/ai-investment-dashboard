const { fetchYahooChart, sendJson } = require("./_market-utils");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const symbol = request.query?.symbol || "";
    const payload = await fetchYahooChart(symbol);
    sendJson(response, 200, payload);
  } catch {
    sendJson(response, 502, { error: "Yahoo chart proxy failed" });
  }
};
