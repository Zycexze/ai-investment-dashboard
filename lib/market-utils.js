const TRADINGVIEW_COLUMNS = ["close", "open", "high", "low", "volume", "change", "RSI", "ATR", "EMA12", "EMA26", "SMA20"];

function normalizeSymbol(input) {
  const raw = String(input || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return "";
  if (raw.includes(":")) return raw;
  if (/^\d{4}$/.test(raw)) return `TWSE:${raw}`;
  return `NASDAQ:${raw.replace(/[^A-Z0-9._-]/g, "")}`;
}

function scannerMarket(symbol) {
  const exchange = normalizeSymbol(symbol).split(":")[0];
  if (exchange === "TWSE" || exchange === "TPEX") return "taiwan";
  return "america";
}

function toYahooSymbol(symbol) {
  const [exchange, ticker] = normalizeSymbol(symbol).split(":");
  if (exchange === "TWSE") return `${ticker}.TW`;
  if (exchange === "TPEX") return `${ticker}.TWO`;
  return ticker;
}

function toStooqSymbol(symbol) {
  const yahooSymbol = toYahooSymbol(symbol).toLowerCase();
  if (!yahooSymbol) return "";
  if (yahooSymbol.endsWith(".tw")) return yahooSymbol;
  if (yahooSymbol.endsWith(".two")) return yahooSymbol.replace(".two", ".tw");
  if (yahooSymbol.includes(".")) return yahooSymbol;
  return `${yahooSymbol}.us`;
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function sendText(response, status, contentType, text) {
  response.statusCode = status;
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-store");
  response.end(text);
}

function readBody(request) {
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

async function fetchTradingViewSnapshot(symbol) {
  const normalized = normalizeSymbol(symbol);
  const scan = {
    symbols: {
      tickers: [normalized],
      query: { types: [] }
    },
    columns: TRADINGVIEW_COLUMNS
  };

  const upstream = await fetch(`https://scanner.tradingview.com/${scannerMarket(normalized)}/scan`, {
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

async function fetchYahooChart(symbol) {
  const yahooSymbol = toYahooSymbol(symbol);
  const upstream = await fetchFirstOk([
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=6mo&interval=1d&includePrePost=false`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=6mo&interval=1d&includePrePost=false`
  ]);

  if (!upstream.ok) {
    throw new Error(`Yahoo chart failed: ${upstream.status}`);
  }

  return upstream.json();
}

function parseYahooCandles(payload) {
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
    open: round(candle.open),
    high: round(candle.high),
    low: round(candle.low),
    close: round(candle.close),
    volume: Math.round(candle.volume)
  }));

  if (candles.length < 30) {
    throw new Error("Not enough Yahoo candles");
  }

  return candles;
}

async function fetchStooqCsv(symbol) {
  const stooqSymbol = toStooqSymbol(symbol);
  const upstream = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const text = await upstream.text();

  if (!upstream.ok || !text.trim().startsWith("Date,")) {
    throw new Error("Stooq did not return CSV data");
  }

  return text;
}

async function buildMarketData(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) {
    const error = new Error("Missing symbol");
    error.statusCode = 400;
    throw error;
  }

  const result = {
    symbol: normalized,
    yahooSymbol: toYahooSymbol(normalized),
    source: "",
    snapshot: null,
    candles: []
  };

  try {
    result.snapshot = await fetchTradingViewSnapshot(normalized);
    result.source = "TradingView scanner";
  } catch {
    result.snapshot = null;
  }

  try {
    result.candles = parseYahooCandles(await fetchYahooChart(normalized));
    if (!result.source) result.source = "Yahoo Finance";
  } catch {
    result.candles = [];
  }

  if (!result.snapshot && !result.candles.length) {
    const error = new Error("No public market data source returned usable data");
    error.statusCode = 502;
    error.payload = {
      error: error.message,
      symbol: normalized,
      yahooSymbol: result.yahooSymbol
    };
    throw error;
  }

  return result;
}

module.exports = {
  buildMarketData,
  fetchStooqCsv,
  fetchTradingViewSnapshot,
  fetchYahooChart,
  normalizeSymbol,
  readBody,
  scannerMarket,
  sendJson,
  sendText,
  toYahooSymbol
};
