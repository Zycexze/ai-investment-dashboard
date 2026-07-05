const { fetchStooqCsv, sendJson, sendText } = require("../lib/market-utils");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const symbol = request.query?.symbol || "";
    const csv = await fetchStooqCsv(symbol);
    sendText(response, 200, "text/csv; charset=utf-8", csv);
  } catch {
    sendJson(response, 502, { error: "Stooq daily proxy failed" });
  }
};
