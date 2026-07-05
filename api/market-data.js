const { buildMarketData, sendJson } = require("../lib/market-utils");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const symbol = request.query?.symbol || "";
    const data = await buildMarketData(symbol);
    sendJson(response, 200, data);
  } catch (error) {
    sendJson(response, error.statusCode || 502, error.payload || { error: error.message || "Market data request failed" });
  }
};
