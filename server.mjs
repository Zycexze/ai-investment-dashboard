import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8766);
const host = "127.0.0.1";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8"
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${host}:${port}`);

    if (url.pathname === "/api/tradingview-scan" && request.method === "POST") {
      await proxyTradingViewScan(request, response);
      return;
    }

    if (url.pathname === "/api/market-data" && request.method === "GET") {
      await proxyMarketData(url, response);
      return;
    }

    if (url.pathname === "/api/yahoo-chart" && request.method === "GET") {
      await proxyYahooChart(url, response);
      return;
    }

    if (url.pathname === "/api/stooq-daily" && request.method === "GET") {
      await proxyStooqDaily(url, response);
      return;
    }

    const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.resolve(__dirname, `.${decodeURIComponent(requestedPath)}`);
    if (filePath !== __dirname && !filePath.startsWith(`${__dirname}${path.sep}`)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

async function proxyTradingViewScan(request, response) {
  let upstream;
  try {
    const body = await readRequestBody(request);
    const payload = JSON.parse(body || "{}");
    const market = typeof payload.market === "string" ? payload.market : "america";
    const scanBody = JSON.stringify(payload.scan || {});
    upstream = await fetch(`https://scanner.tradingview.com/${market}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: scanBody
    });
  } catch {
    response.writeHead(502, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(JSON.stringify({ error: "TradingView scanner proxy failed" }));
    return;
  }

  const data = await upstream.text();

  response.writeHead(upstream.status, {
    "Content-Type": upstream.headers.get("content-type") || "application/json",
    "Cache-Control": "no-store"
  });
  response.end(data);
}

async function proxyMarketData(url, response) {
  const symbol = normalizeServerSymbol(url.searchParams.get("symbol") || "");
  if (!symbol) {
    writeJson(response, 400, { error: "Missing symbol" });
    return;
  }

  const yahooSymbol = toYahooServerSymbol(symbol);
  const result = {
    symbol,
    yahooSymbol,
    source: "",
    snapshot: null,
    candles: []
  };

  try {
    result.snapshot = await fetchTradingViewSnapshotServer(symbol);
    result.source = "TradingView scanner";
  } catch {
    result.snapshot = null;
  }

  try {
    const yahooPayload = await fetchYahooChartServer(yahooSymbol);
    result.candles = parseYahooCandlesServer(yahooPayload);
    if (!result.source) result.source = "Yahoo Finance";
  } catch {
    result.candles = [];
  }

  if (!result.snapshot && !result.candles.length) {
    writeJson(response, 502, {
      error: "No public market data source returned usable data",
      symbol,
      yahooSymbol
    });
    return;
  }

  writeJson(response, 200, result);
}

async function fetchTradingViewSnapshotServer(symbol) {
  const scan = {
    symbols: {
      tickers: [symbol],
      query: { types: [] }
    },
    columns: ["close", "open", "high", "low", "volume", "change", "RSI", "ATR", "EMA12", "EMA26", "SMA20"]
  };
  const upstream = await fetch(`https://scanner.tradingview.com/${scannerMarketServer(symbol)}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scan)
  });

  if (!upstream.ok) {
    throw new Error(`TradingView scanner failed: ${upstream.status}`);
  }

  const payload = await upstream.json();
  const row = payload?.data?.[0]?.d;
  if (!Array.isArray(row) || row.some((value) => value == null)) {
    throw new Error("TradingView scanner response is incomplete");
  }

  return {
    close: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    volume: Number(row[4]),
    changePercent: Number(row[5]),
    rsi: Number(row[6]),
    atr: Number(row[7]),
    ema12: Number(row[8]),
    ema26: Number(row[9]),
    sma20: Number(row[10])
  };
}

async function fetchYahooChartServer(symbol) {
  const upstream = await fetchFirstOk([
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d&includePrePost=false`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d&includePrePost=false`
  ]);

  if (!upstream.ok) {
    throw new Error(`Yahoo chart failed: ${upstream.status}`);
  }

  return upstream.json();
}

function parseYahooCandlesServer(payload) {
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp;
  if (!result || !quote || !Array.isArray(timestamps)) {
    throw new Error("Yahoo chart response is missing candles");
  }

  const candles = timestamps.map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString(),
    open: quote.open?.[index],
    high: quote.high?.[index],
    low: quote.low?.[index],
    close: quote.close?.[index],
    volume: quote.volume?.[index]
  })).filter((candle) => (
    Number.isFinite(candle.open) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low) &&
    Number.isFinite(candle.close) &&
    Number.isFinite(candle.volume)
  )).map((candle) => ({
    ...candle,
    open: roundServer(candle.open),
    high: roundServer(candle.high),
    low: roundServer(candle.low),
    close: roundServer(candle.close),
    volume: Math.round(candle.volume)
  }));

  if (candles.length < 30) {
    throw new Error("Not enough Yahoo candles");
  }

  return candles;
}

async function proxyYahooChart(url, response) {
  const symbol = url.searchParams.get("symbol") || "";
  if (!symbol) {
    writeJson(response, 400, { error: "Missing symbol" });
    return;
  }

  try {
    const upstream = await fetchFirstOk([
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d&includePrePost=false`,
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d&includePrePost=false`
    ]);
    const data = await upstream.text();
    response.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store"
    });
    response.end(data);
  } catch {
    writeJson(response, 502, { error: "Yahoo chart proxy failed" });
  }
}

async function proxyStooqDaily(url, response) {
  const symbol = url.searchParams.get("symbol") || "";
  if (!symbol) {
    writeJson(response, 400, { error: "Missing symbol" });
    return;
  }

  try {
    const endpoint = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
    const upstream = await fetch(endpoint, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const data = await upstream.text();
    if (!data.trim().startsWith("Date,")) {
      writeJson(response, 502, { error: "Stooq did not return CSV data" });
      return;
    }
    response.writeHead(upstream.status, {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(data);
  } catch {
    writeJson(response, 502, { error: "Stooq daily proxy failed" });
  }
}

async function fetchFirstOk(endpoints) {
  let lastResponse;
  for (const endpoint of endpoints) {
    lastResponse = await fetch(endpoint, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (lastResponse.ok) return lastResponse;
  }
  return lastResponse;
}

function writeJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function normalizeServerSymbol(input) {
  const raw = String(input || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return "";
  if (raw.includes(":")) return raw;
  if (/^\d{4}$/.test(raw)) return `TWSE:${raw}`;
  return `NASDAQ:${raw.replace(/[^A-Z0-9._-]/g, "")}`;
}

function scannerMarketServer(symbol) {
  const exchange = normalizeServerSymbol(symbol).split(":")[0];
  if (exchange === "TWSE" || exchange === "TPEX") return "taiwan";
  return "america";
}

function toYahooServerSymbol(symbol) {
  const [exchange, ticker] = normalizeServerSymbol(symbol).split(":");
  if (exchange === "TWSE") return `${ticker}.TW`;
  if (exchange === "TPEX") return `${ticker}.TWO`;
  return ticker;
}

function roundServer(value) {
  return Math.round(Number(value) * 100) / 100;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

server.listen(port, host, () => {
  console.log(`AI dashboard running at http://${host}:${port}/`);
});
