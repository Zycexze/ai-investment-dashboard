const STORAGE_KEYS = {
  favorites: "quant-dashboard-favorites",
  watched: "quant-dashboard-watched",
  hiddenDefaults: "quant-dashboard-hidden-defaults"
};

const DEFAULT_SYMBOLS = ["NASDAQ:NVDA", "NASDAQ:TSLA", "NASDAQ:AAPL", "NYSE:TSM"];

const SYMBOL_ALIASES = {
  NVDA: "NASDAQ:NVDA",
  TSLA: "NASDAQ:TSLA",
  AAPL: "NASDAQ:AAPL",
  TSM: "NYSE:TSM",
  MSFT: "NASDAQ:MSFT",
  AMD: "NASDAQ:AMD",
  MU: "NASDAQ:MU",
  META: "NASDAQ:META",
  GOOGL: "NASDAQ:GOOGL",
  AMZN: "NASDAQ:AMZN",
  2330: "TWSE:2330",
  2317: "TWSE:2317",
  2454: "TWSE:2454"
};

const chartProfiles = {
  "NASDAQ:NVDA": createProfile({
    symbol: "NASDAQ:NVDA",
    name: "NVIDIA Corporation",
    close: 194.83,
    open: 197.14,
    high: 200.06,
    low: 192.35,
    visibleRsi: 41.16,
    basePrice: 214.2,
    seed: 7,
    trendBias: -0.18,
    finalVolume: 49200000
  }),
  "NASDAQ:TSLA": createProfile({
    symbol: "NASDAQ:TSLA",
    name: "Tesla Inc.",
    close: 315.35,
    open: 310.12,
    high: 318.2,
    low: 306.91,
    visibleRsi: 58.4,
    basePrice: 286.5,
    seed: 19,
    trendBias: 0.42,
    finalVolume: 80400000
  }),
  "NASDAQ:AAPL": createProfile({
    symbol: "NASDAQ:AAPL",
    name: "Apple Inc.",
    close: 213.55,
    open: 214.2,
    high: 216.05,
    low: 211.88,
    visibleRsi: 49.2,
    basePrice: 205.1,
    seed: 31,
    trendBias: 0.08,
    finalVolume: 41800000
  }),
  "NYSE:TSM": createProfile({
    symbol: "NYSE:TSM",
    name: "Taiwan Semiconductor",
    close: 226.4,
    open: 222.7,
    high: 228.15,
    low: 221.32,
    visibleRsi: 63.6,
    basePrice: 198.6,
    seed: 43,
    trendBias: 0.36,
    finalVolume: 18200000
  }),
  "NASDAQ:MU": createProfile({
    symbol: "NASDAQ:MU",
    name: "Micron Technology, Inc.",
    close: 975.56,
    open: 1041.5,
    high: 1050.28,
    low: 950.28,
    visibleRsi: 48.47,
    basePrice: 780.4,
    seed: 57,
    trendBias: 0.62,
    finalVolume: 61840000
  })
};

const state = {
  currentSymbol: "NASDAQ:NVDA",
  candles: [],
  favorites: [],
  hiddenDefaults: [],
  watchedSymbols: [],
  hydratingSymbols: new Set(),
  tvScriptLoading: false
};

const elements = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  state.favorites = loadSymbols(STORAGE_KEYS.favorites, ["NASDAQ:NVDA"]);
  state.hiddenDefaults = loadSymbols(STORAGE_KEYS.hiddenDefaults, []);
  const visibleDefaults = DEFAULT_SYMBOLS.filter((symbol) => !state.hiddenDefaults.includes(symbol));
  state.watchedSymbols = mergeSymbols(visibleDefaults, loadSymbols(STORAGE_KEYS.watched, []), state.favorites);
  if (!state.watchedSymbols.length) {
    state.watchedSymbols = [DEFAULT_SYMBOLS[0]];
    state.hiddenDefaults = state.hiddenDefaults.filter((symbol) => symbol !== DEFAULT_SYMBOLS[0]);
  }
  if (!state.watchedSymbols.includes(state.currentSymbol)) {
    state.currentSymbol = state.watchedSymbols[0];
  }
  state.watchedSymbols.forEach(ensureProfile);
  bindEvents();
  await selectSymbol(state.currentSymbol, { renderChart: false });
  initTradingView();
  hydrateWatchlistSymbols();
});

function cacheElements() {
  [
    "strategy-button",
    "symbol-search-form",
    "symbol-search",
    "favorite-current-button",
    "favorite-list",
    "favorite-count",
    "market-list",
    "market-count",
    "symbol-eyebrow",
    "last-updated",
    "score-value",
    "score-caption",
    "confidence-value",
    "volume-ratio",
    "atr-risk",
    "risk-caption",
    "data-source",
    "data-source-caption",
    "chart-status",
    "tradingview-chart",
    "signal-pill",
    "signal-label",
    "signal-summary",
    "signal-reason",
    "trend-bar",
    "trend-score",
    "momentum-bar",
    "momentum-score",
    "volume-bar",
    "volume-score",
    "risk-bar",
    "risk-score",
    "risk-level",
    "volatility-value",
    "rsi-value",
    "ema-spread",
    "close-price",
    "plan-status",
    "plan-entry",
    "plan-stop",
    "plan-target-one",
    "plan-target-two",
    "plan-rr",
    "plan-size",
    "plan-note"
  ].forEach((id) => {
    const key = id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    elements[key] = document.getElementById(id);
  });
}

function bindEvents() {
  elements.strategyButton.addEventListener("click", runAIStrategy);
  elements.symbolSearchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const symbol = normalizeSymbol(elements.symbolSearch.value);
    if (!symbol) return;
    ensureProfile(symbol);
    addWatchedSymbol(symbol);
    await selectSymbol(symbol);
    elements.symbolSearch.value = "";
  });
  elements.favoriteCurrentButton.addEventListener("click", () => {
    toggleFavorite(state.currentSymbol);
  });
  elements.favoriteList.addEventListener("click", handleWatchlistClick);
  elements.marketList.addEventListener("click", handleWatchlistClick);
}

function createProfile(config) {
  const symbol = normalizeSymbol(config.symbol);
  const short = symbol.split(":").pop();
  const close = round(config.close);
  const open = round(config.open);
  return {
    symbol,
    interval: "D",
    label: `${short} 日線`,
    short,
    name: config.name || `${short} Market Snapshot`,
    close,
    open,
    high: round(config.high),
    low: round(config.low),
    visibleRsi: config.visibleRsi,
    basePrice: config.basePrice,
    seed: config.seed,
    trendBias: config.trendBias,
    finalVolume: config.finalVolume,
    changePercent: round(((close - open) / open) * 100),
    verified: Boolean(config.verified),
    loading: false,
    loadError: "",
    dataSymbol: config.dataSymbol || toYahooSymbol(symbol),
    candles: [],
    spark: buildSpark(config.seed, config.trendBias)
  };
}

function createGeneratedProfile(symbol) {
  const normalized = normalizeSymbol(symbol);
  const short = normalized.split(":").pop();
  const seed = symbolSeed(normalized);
  const base = 60 + (seed % 260);
  const trendBias = ((seed % 19) - 9) / 28;
  const open = round(base + pseudoNoise(seed + 2) * 8);
  const close = round(Math.max(8, open * (1 + (((seed % 13) - 6) / 100))));
  const high = round(Math.max(open, close) + 1.2 + Math.abs(pseudoNoise(seed + 5)) * 5);
  const low = round(Math.max(1, Math.min(open, close) - 1.1 - Math.abs(pseudoNoise(seed + 8)) * 5));
  return createProfile({
    symbol: normalized,
    name: `${short} 自訂標的`,
    close,
    open,
    high,
    low,
    visibleRsi: 38 + (seed % 34),
    basePrice: round(base * 0.92),
    seed,
    trendBias,
    finalVolume: 12000000 + (seed % 82) * 1000000,
    verified: false
  });
}

function ensureProfile(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!chartProfiles[normalized]) {
    chartProfiles[normalized] = createGeneratedProfile(normalized);
  }
  return chartProfiles[normalized];
}

function chartProfile() {
  return ensureProfile(state.currentSymbol);
}

async function hydrateSymbolData(symbol) {
  const profile = ensureProfile(symbol);
  if (profile.verified && (profile.marketData || profile.candles?.length)) return profile;

  profile.loading = true;
  profile.loadError = "";
  renderWatchlists();

  try {
    const bundle = await fetchMarketDataBundle(profile.symbol);
    applyMarketDataBundle(profile, bundle);
  } catch (error) {
    try {
      const snapshot = await fetchTradingViewSnapshot(profile.symbol);
      applyTradingViewSnapshot(profile, snapshot);
      try {
        const candles = await fetchDailyCandles(profile.dataSymbol);
        applyFetchedCandles(profile, candles, { keepScannerSnapshot: true });
      } catch {
        profile.candles = [];
      }
    } catch {
      try {
        const candles = await fetchDailyCandles(profile.dataSymbol);
        applyFetchedCandles(profile, candles);
      } catch {
        profile.verified = false;
        profile.loading = false;
        profile.loadError = "行情抓取失敗";
        profile.marketData = null;
        profile.candles = [];
        profile.dataSource = "";
      }
    }
  }

  return profile;
}

async function fetchMarketDataBundle(symbol) {
  const response = await fetch(`/api/market-data?symbol=${encodeURIComponent(symbol)}&t=${Date.now()}`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Market bundle request failed: ${response.status}`);
  }
  return response.json();
}

function applyMarketDataBundle(profile, bundle) {
  if (bundle.snapshot) {
    applyTradingViewSnapshot(profile, bundle.snapshot);
    profile.dataSource = bundle.source || "TradingView scanner";
  }

  if (Array.isArray(bundle.candles) && bundle.candles.length) {
    const candles = bundle.candles.map((candle) => ({
      ...candle,
      date: new Date(candle.date)
    }));
    candles.source = bundle.snapshot ? "Yahoo Finance backup" : (bundle.source || "Yahoo Finance");
    applyFetchedCandles(profile, candles, { keepScannerSnapshot: Boolean(bundle.snapshot) });
  }

  if (!bundle.snapshot && (!bundle.candles || !bundle.candles.length)) {
    throw new Error("Market data bundle is empty");
  }
}

async function fetchTradingViewSnapshot(symbol) {
  const market = scannerMarket(symbol);
  const scan = {
    symbols: {
      tickers: [symbol],
      query: { types: [] }
    },
    columns: ["close", "open", "high", "low", "volume", "change", "RSI", "ATR", "EMA12", "EMA26", "SMA20"]
  };
  const response = await fetchTradingViewScan(market, scan);

  if (!response.ok) {
    throw new Error(`TradingView scanner failed: ${response.status}`);
  }

  const payload = await response.json();
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

async function fetchTradingViewScan(market, scan) {
  const proxyResponse = await fetch("/api/tradingview-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ market, scan })
  }).catch(() => null);

  if (proxyResponse?.ok) {
    return proxyResponse;
  }

  return fetch(`https://scanner.tradingview.com/${market}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scan)
  });
}

function scannerMarket(symbol) {
  const exchange = normalizeSymbol(symbol).split(":")[0];
  if (exchange === "TWSE" || exchange === "TPEX") return "taiwan";
  return "america";
}

function applyTradingViewSnapshot(profile, snapshot) {
  profile.close = round(snapshot.close);
  profile.open = round(snapshot.open);
  profile.high = round(snapshot.high);
  profile.low = round(snapshot.low);
  profile.finalVolume = Math.round(snapshot.volume);
  profile.visibleRsi = round(snapshot.rsi);
  profile.changePercent = round(snapshot.changePercent);
  profile.marketData = {
    source: "TradingView scanner",
    close: profile.close,
    open: profile.open,
    high: profile.high,
    low: profile.low,
    volume: profile.finalVolume,
    changePercent: profile.changePercent,
    rsi: profile.visibleRsi,
    atr: round(snapshot.atr),
    ema12: round(snapshot.ema12),
    ema26: round(snapshot.ema26),
    sma20: round(snapshot.sma20)
  };
  profile.dataSource = "TradingView scanner";
  profile.spark = buildSparkFromSnapshot(profile);
  profile.verified = true;
  profile.loading = false;
  profile.loadError = "";
}

async function fetchDailyCandles(dataSymbol) {
  try {
    return await fetchYahooDailyCandles(dataSymbol);
  } catch (yahooError) {
    const stooqSymbol = toStooqSymbol(dataSymbol);
    if (!stooqSymbol) throw yahooError;
    return fetchStooqDailyCandles(stooqSymbol);
  }
}

async function fetchYahooDailyCandles(dataSymbol) {
  const response = await fetchYahooChart(dataSymbol);
  if (!response.ok) {
    throw new Error(`Yahoo chart request failed: ${response.status}`);
  }

  const payload = await response.json();
  const candles = parseYahooCandles(payload);
  candles.source = "Yahoo Finance";
  return candles;
}

async function fetchYahooChart(dataSymbol) {
  const proxyResponse = await fetch(`/api/yahoo-chart?symbol=${encodeURIComponent(dataSymbol)}`, {
    cache: "no-store"
  }).catch(() => null);

  if (proxyResponse?.ok) {
    return proxyResponse;
  }

  return fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(dataSymbol)}?range=6mo&interval=1d&includePrePost=false`, {
    cache: "no-store"
  });
}

function parseYahooCandles(payload) {
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp;
  if (!result || !quote || !Array.isArray(timestamps)) {
    throw new Error("Market data response is missing candles");
  }

  const candles = timestamps.map((timestamp, index) => ({
    date: new Date(timestamp * 1000),
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
    throw new Error("Not enough candles for strategy calculation");
  }

  return candles;
}

async function fetchStooqDailyCandles(stooqSymbol) {
  const response = await fetchStooqDaily(stooqSymbol);
  if (!response.ok) {
    throw new Error(`Stooq daily request failed: ${response.status}`);
  }

  return parseStooqCandles(await response.text());
}

async function fetchStooqDaily(stooqSymbol) {
  const proxyResponse = await fetch(`/api/stooq-daily?symbol=${encodeURIComponent(stooqSymbol)}`, {
    cache: "no-store"
  }).catch(() => null);

  if (proxyResponse?.ok) {
    return proxyResponse;
  }

  return fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`, {
    cache: "no-store"
  });
}

function parseStooqCandles(csv) {
  const rows = String(csv || "").trim().split(/\r?\n/).slice(1);
  const candles = rows.map((row) => {
    const [date, open, high, low, close, volume] = row.split(",");
    return {
      date: new Date(date),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume)
    };
  }).filter((candle) => (
    candle.date.toString() !== "Invalid Date" &&
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
    throw new Error("Not enough Stooq candles for strategy calculation");
  }

  const recentCandles = candles.slice(-130);
  recentCandles.source = "Stooq";
  return recentCandles;
}

function applyFetchedCandles(profile, candles, options = {}) {
  const { keepScannerSnapshot = false } = options;
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2] || latest;
  const closes = candles.map((candle) => candle.close);

  profile.candles = candles;
  if (!keepScannerSnapshot) {
    profile.close = latest.close;
    profile.open = latest.open;
    profile.high = latest.high;
    profile.low = latest.low;
    profile.finalVolume = latest.volume;
    profile.visibleRsi = calculateRSI(closes, 14);
    profile.changePercent = round(((latest.close - previous.close) / previous.close) * 100);
    profile.marketData = null;
    profile.dataSource = candles.source || "Public market API";
    profile.spark = buildSparkFromCandles(candles);
    profile.verified = true;
    profile.loading = false;
    profile.loadError = "";
  }
  profile.basePrice = candles[0].close;
  profile.trendBias = round((latest.close - candles[Math.max(0, candles.length - 22)].close) / 22);
}

async function selectSymbol(symbol, options = {}) {
  const { renderChart = true } = options;
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return;

  const profile = ensureProfile(normalized);
  state.currentSymbol = normalized;
  updateSymbolUI();
  renderWatchlists();

  if (renderChart) {
    initTradingView();
  }

  renderLoadingState(profile);
  await hydrateSymbolData(normalized);

  const hydratedProfile = chartProfile();
  state.candles = hydratedProfile.candles || [];
  updateSymbolUI();
  renderWatchlists();

  const signal = hydratedProfile.verified
    ? calculateAIStrategy(state.candles)
    : createPendingSignal();
  renderSignalPanel(signal, false);
  renderTradePlan(signal, false);
}

function renderLoadingState(profile) {
  elements.scoreValue.textContent = "--";
  elements.scoreCaption.textContent = `抓取 ${profile.short} 行情中`;
  elements.confidenceValue.textContent = "--%";
  elements.volumeRatio.textContent = "--x";
  elements.atrRisk.textContent = "--%";
  elements.riskCaption.textContent = "同步中";
  elements.dataSource.textContent = "同步中";
  elements.dataSourceCaption.textContent = "正在嘗試公開行情 API";
  elements.signalPill.textContent = "LOADING";
  elements.signalPill.className = "signal-pill hold";
  elements.signalLabel.textContent = "同步中";
  elements.signalSummary.textContent = "正在抓取實際 OHLCV 行情";
  elements.signalReason.textContent = "系統正在向公開行情資料源抓取目前標的的日線開高低收與成交量，完成後才會計算 AI 分數與交易計畫。";
  elements.planStatus.textContent = "同步中";
  elements.planStatus.className = "plan-status wait";
  elements.planEntry.textContent = "--";
  elements.planStop.textContent = "--";
  elements.planTargetOne.textContent = "--";
  elements.planTargetTwo.textContent = "--";
  elements.planRr.textContent = "--";
  elements.planSize.textContent = "--";
  elements.planNote.textContent = "行情資料同步中，暫不產生交易價格計畫。";
  ["trend", "momentum", "volume", "risk"].forEach((name) => updateFactor(name, 0));

}

function updateSymbolUI() {
  const profile = chartProfile();
  elements.symbolEyebrow.textContent = `${profile.symbol} / Daily`;
  const isFavorite = state.favorites.includes(profile.symbol);
  elements.favoriteCurrentButton.textContent = isFavorite ? "已加入最愛" : "加入目前標的到最愛";
  elements.favoriteCurrentButton.classList.toggle("active", isFavorite);
}

function initTradingView() {
  if (window.TradingView) {
    renderTradingView();
    return;
  }

  if (state.tvScriptLoading) return;
  state.tvScriptLoading = true;

  const timeoutId = window.setTimeout(() => {
    if (!window.TradingView) {
      showChartFallback("TradingView 載入逾時");
    }
  }, 7000);

  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/tv.js";
  script.async = true;
  script.onload = () => {
    window.clearTimeout(timeoutId);
    state.tvScriptLoading = false;
    if (!window.TradingView) {
      showChartFallback("TradingView 無法初始化");
      return;
    }
    renderTradingView();
  };
  script.onerror = () => {
    window.clearTimeout(timeoutId);
    state.tvScriptLoading = false;
    showChartFallback("TradingView 載入失敗");
  };
  document.head.appendChild(script);
}

function renderTradingView() {
  const profile = chartProfile();
  elements.tradingviewChart.innerHTML = "";
  new window.TradingView.widget({
    width: "100%",
    height: "100%",
    symbol: profile.symbol,
    interval: profile.interval,
    timezone: "Asia/Taipei",
    theme: "dark",
    style: "1",
    locale: "zh_TW",
    toolbar_bg: "#071015",
    enable_publishing: false,
    hide_top_toolbar: false,
    hide_side_toolbar: false,
    allow_symbol_change: false,
    studies: ["MASimple@tv-basicstudies", "RSI@tv-basicstudies"],
    container_id: "tradingview-chart"
  });

  elements.chartStatus.textContent = "已連線";
  elements.chartStatus.className = "chart-status ready";
}

function showChartFallback(message) {
  const profile = chartProfile();
  elements.chartStatus.textContent = "離線展示";
  elements.chartStatus.className = "chart-status failed";
  elements.tradingviewChart.innerHTML = `
    <div class="chart-fallback">
      <strong>${message}</strong>
      <span>第三方圖表腳本目前無法載入；AI 策略指標仍會根據 ${profile.label} 快照計算。</span>
    </div>
  `;
}

function handleWatchlistClick(event) {
  const button = event.target.closest("button[data-symbol]");
  if (!button) return;
  const symbol = button.dataset.symbol;
  if (button.dataset.action === "favorite") {
    toggleFavorite(symbol);
    return;
  }
  if (button.dataset.action === "remove") {
    removeWatchedSymbol(symbol);
    return;
  }
  selectSymbol(symbol);
}

function toggleFavorite(symbol) {
  const normalized = normalizeSymbol(symbol);
  ensureProfile(normalized);
  addWatchedSymbol(normalized);

  if (state.favorites.includes(normalized)) {
    state.favorites = state.favorites.filter((item) => item !== normalized);
  } else {
    state.favorites.unshift(normalized);
  }

  saveSymbols(STORAGE_KEYS.favorites, state.favorites);
  updateSymbolUI();
  renderWatchlists();
}

function addWatchedSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  state.hiddenDefaults = state.hiddenDefaults.filter((item) => item !== normalized);
  state.watchedSymbols = mergeSymbols([normalized], state.watchedSymbols);
  saveSymbols(STORAGE_KEYS.watched, state.watchedSymbols.filter((item) => !DEFAULT_SYMBOLS.includes(item)));
  saveSymbols(STORAGE_KEYS.hiddenDefaults, state.hiddenDefaults);
  hydrateWatchlistSymbols([normalized]);
}

function removeWatchedSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (state.watchedSymbols.length <= 1) return;

  state.watchedSymbols = state.watchedSymbols.filter((item) => item !== normalized);
  state.favorites = state.favorites.filter((item) => item !== normalized);
  if (DEFAULT_SYMBOLS.includes(normalized)) {
    state.hiddenDefaults = mergeSymbols(state.hiddenDefaults, [normalized]);
  }

  saveSymbols(STORAGE_KEYS.favorites, state.favorites);
  saveSymbols(STORAGE_KEYS.watched, state.watchedSymbols.filter((item) => !DEFAULT_SYMBOLS.includes(item)));
  saveSymbols(STORAGE_KEYS.hiddenDefaults, state.hiddenDefaults);

  if (state.currentSymbol === normalized) {
    selectSymbol(state.watchedSymbols[0], { resetLog: true });
    return;
  }

  updateSymbolUI();
  renderWatchlists();
}

function renderWatchlists() {
  elements.favoriteCount.textContent = String(state.favorites.length);
  elements.marketCount.textContent = String(state.watchedSymbols.length);
  elements.favoriteList.innerHTML = state.favorites.length
    ? state.favorites.map((symbol) => renderWatchItem(symbol, "favorite")).join("")
    : '<div class="empty-watchlist">尚未加入最愛</div>';
  elements.marketList.innerHTML = state.watchedSymbols.map((symbol) => renderWatchItem(symbol, "market")).join("");
}

function hydrateWatchlistSymbols(symbols = mergeSymbols(state.favorites, state.watchedSymbols)) {
  symbols.forEach((symbol) => {
    const normalized = normalizeSymbol(symbol);
    const profile = ensureProfile(normalized);
    if (profile.verified || profile.loading || state.hydratingSymbols.has(normalized)) return;

    state.hydratingSymbols.add(normalized);
    hydrateSymbolData(normalized)
      .catch(() => {})
      .finally(() => {
        state.hydratingSymbols.delete(normalized);
        renderWatchlists();
      });
  });
}

function renderWatchItem(symbol, listType) {
  const profile = ensureProfile(symbol);
  const isActive = profile.symbol === state.currentSymbol;
  const isFavorite = state.favorites.includes(profile.symbol);
  const canRemove = listType === "market" && state.watchedSymbols.length > 1;
  const changeClass = profile.changePercent >= 0 ? "up" : "down";
  const changeText = `${profile.changePercent >= 0 ? "+" : ""}${profile.changePercent.toFixed(2)}%`;
  const priceText = profile.loading ? "同步中" : profile.verified ? `$${profile.close.toFixed(2)}` : "抓取失敗";
  const changeDisplay = profile.loading ? "..." : profile.verified ? changeText : "無資料";
  const changeStateClass = profile.verified ? changeClass : "pending";
  const spark = profile.spark.map((height) => `<span style="height:${height}%"></span>`).join("");

  return `
    <div class="watch-item ${canRemove ? "with-remove" : ""} ${isActive ? "active" : ""}">
      <button class="watch-main" type="button" data-action="select" data-symbol="${profile.symbol}">
        <span class="watch-copy">
          <span class="watch-symbol">${profile.short}</span>
          <span class="watch-name">${profile.name}</span>
        </span>
        <span class="watch-values">
          <span class="watch-price">${priceText}</span>
          <span class="watch-change ${changeStateClass}">${changeDisplay}</span>
        </span>
        <span class="watch-spark" aria-hidden="true">${spark}</span>
      </button>
      <span class="watch-actions">
      <button class="watch-star ${isFavorite ? "active" : ""}" type="button" data-action="favorite" data-symbol="${profile.symbol}" aria-label="切換最愛 ${profile.short}">★</button>
      ${canRemove ? `<button class="watch-remove" type="button" data-action="remove" data-symbol="${profile.symbol}" aria-label="移除 ${profile.short}">×</button>` : ""}
      </span>
    </div>
  `;
}

function generateMarketData(length = 90) {
  const profile = chartProfile();
  const candles = [];
  let close = profile.basePrice;
  const start = new Date();
  start.setDate(start.getDate() - length);

  for (let index = 0; index < length - 1; index += 1) {
    const trend = index < 38 ? 0.22 + profile.trendBias : index < 68 ? -0.34 + profile.trendBias * 0.6 : profile.trendBias;
    const cycle = Math.sin((index + profile.seed) / 5.4) * 1.18 + Math.cos((index + profile.seed) / 9.5) * 0.7;
    const shock = pseudoNoise(index + profile.seed) * 1.55;
    const open = close;
    close = Math.max(8, open + trend + cycle + shock);
    const high = Math.max(open, close) + 1.8 + Math.abs(pseudoNoise(index + profile.seed + 17)) * 2.3;
    const low = Math.min(open, close) - 1.6 - Math.abs(pseudoNoise(index + profile.seed + 29)) * 2.4;
    const volume = Math.round(profile.finalVolume * 0.72 + Math.abs(cycle) * 7200000 + (index % 8) * 1200000);
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    candles.push({
      date,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume
    });
  }

  const lastDate = new Date(start);
  lastDate.setDate(start.getDate() + length - 1);
  candles.push({
    date: lastDate,
    open: profile.open,
    high: profile.high,
    low: profile.low,
    close: profile.close,
    volume: profile.finalVolume
  });

  return normalizeToChartClose(candles);
}

function normalizeToChartClose(candles) {
  const profile = chartProfile();
  const priorClose = candles[candles.length - 2].close;
  const shift = profile.open - priorClose;
  return candles.map((candle, index) => {
    if (index === candles.length - 1) return candle;
    return {
      ...candle,
      open: round(candle.open + shift),
      high: round(candle.high + shift),
      low: round(candle.low + shift),
      close: round(candle.close + shift)
    };
  });
}

function calculateEMA(values, period) {
  const multiplier = 2 / (period + 1);
  const result = [];
  values.forEach((value, index) => {
    if (index === 0) {
      result.push(value);
      return;
    }
    result.push(value * multiplier + result[index - 1] * (1 - multiplier));
  });
  return result;
}

function calculateRSI(values, period = 14) {
  if (values.length <= period) return 50;

  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }

  if (averageLoss === 0) return 100;
  const relativeStrength = averageGain / averageLoss;
  return round(100 - 100 / (1 + relativeStrength));
}

function calculateATR(candles, period = 14) {
  if (candles.length <= period) return 0;

  const trueRanges = candles.slice(1).map((candle, index) => {
    const previousClose = candles[index].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });

  const recent = trueRanges.slice(-period);
  return round(recent.reduce((sum, value) => sum + value, 0) / period);
}

function calculateAIStrategy(candles) {
  const profile = chartProfile();
  if (profile.marketData) {
    return calculateAIStrategyFromMarketData(profile);
  }
  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);
  const latest = candles[candles.length - 1];
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const calculatedRsi = calculateRSI(closes, 14);
  const rsi = blend(calculatedRsi, profile.visibleRsi, 0.65);
  const atr = calculateATR(candles, 14);
  const lastEma12 = ema12[ema12.length - 1];
  const lastEma26 = ema26[ema26.length - 1];
  const emaSpreadPercent = ((lastEma12 - lastEma26) / latest.close) * 100;
  const averageVolume = average(volumes.slice(-20));
  const volumeRatio = latest.volume / averageVolume;
  const atrPercent = (atr / latest.close) * 100;
  const volatility = calculateVolatility(closes.slice(-14));

  const trendScore = clamp(50 + emaSpreadPercent * 16, 0, 100);
  const momentumScore = scoreMomentum(rsi);
  const volumeScore = clamp(45 + (volumeRatio - 1) * 50, 0, 100);
  const riskScore = clamp(100 - atrPercent * 14, 0, 100);
  const score = round(
    trendScore * 0.35 +
    momentumScore * 0.25 +
    volumeScore * 0.2 +
    riskScore * 0.2
  );

  const type = score >= 70 ? "buy" : score <= 35 ? "sell" : "hold";
  const riskLevel = atrPercent >= 4.8 ? "high" : atrPercent >= 2.7 ? "medium" : "low";
  const confidence = clamp(
    Math.round(Math.abs(score - 50) * 1.1 + 48 + Math.min(volumeRatio, 1.6) * 5),
    45,
    92
  );

  return {
    type,
    score,
    confidence,
    riskLevel,
    isVerified: profile.verified,
    snapshotKey: `${profile.symbol}-${profile.interval}-${latest.close}-${score}-${type}`,
    factors: {
      trend: Math.round(trendScore),
      momentum: Math.round(momentumScore),
      volume: Math.round(volumeScore),
      risk: Math.round(riskScore)
    },
    metrics: {
      rsi: round(rsi),
      atrPercent: round(atrPercent),
      volumeRatio: round(volumeRatio),
      volatility: round(volatility),
      emaSpreadPercent: round(emaSpreadPercent),
      close: latest.close
    },
    summary: buildSummary(type, score),
    reason: buildReason({ type, emaSpreadPercent, rsi, volumeRatio, atrPercent, riskLevel })
  };
}

function calculateAIStrategyFromMarketData(profile) {
  const data = profile.marketData;
  const emaSpreadPercent = ((data.ema12 - data.ema26) / data.close) * 100;
  const atrPercent = (data.atr / data.close) * 100;
  const candles = profile.candles || [];
  const volumes = candles.map((candle) => candle.volume);
  const averageVolume = volumes.length >= 20 ? average(volumes.slice(-20)) : data.volume;
  const volumeRatio = averageVolume ? data.volume / averageVolume : 1;
  const closes = candles.length ? candles.map((candle) => candle.close) : [data.open, data.close];
  const volatility = candles.length >= 14 ? calculateVolatility(closes.slice(-14)) : Math.abs(data.changePercent) / 4;

  const trendScore = clamp(50 + emaSpreadPercent * 16, 0, 100);
  const momentumScore = scoreMomentum(data.rsi);
  const volumeScore = clamp(45 + (volumeRatio - 1) * 50, 0, 100);
  const riskScore = clamp(100 - atrPercent * 14, 0, 100);
  const score = round(
    trendScore * 0.35 +
    momentumScore * 0.25 +
    volumeScore * 0.2 +
    riskScore * 0.2
  );
  const type = score >= 70 ? "buy" : score <= 35 ? "sell" : "hold";
  const riskLevel = atrPercent >= 4.8 ? "high" : atrPercent >= 2.7 ? "medium" : "low";
  const confidence = clamp(
    Math.round(Math.abs(score - 50) * 1.1 + 48 + Math.min(volumeRatio, 1.6) * 5),
    45,
    92
  );

  return {
    type,
    score,
    confidence,
    riskLevel,
    isVerified: true,
    snapshotKey: `${profile.symbol}-${profile.interval}-${data.close}-${score}-${type}`,
    factors: {
      trend: Math.round(trendScore),
      momentum: Math.round(momentumScore),
      volume: Math.round(volumeScore),
      risk: Math.round(riskScore)
    },
    metrics: {
      rsi: round(data.rsi),
      atrPercent: round(atrPercent),
      volumeRatio: round(volumeRatio),
      volatility: round(volatility),
      emaSpreadPercent: round(emaSpreadPercent),
      close: data.close
    },
    summary: buildSummary(type, score),
    reason: buildReason({ type, emaSpreadPercent, rsi: data.rsi, volumeRatio, atrPercent, riskLevel })
  };
}

function scoreMomentum(rsi) {
  if (rsi >= 55 && rsi <= 68) return 86;
  if (rsi > 68 && rsi <= 76) return 62;
  if (rsi > 76) return 38;
  if (rsi >= 45) return 58;
  if (rsi >= 38) return 44;
  if (rsi >= 32) return 31;
  return 22;
}

function calculateVolatility(closes) {
  if (closes.length < 2) return 0;
  const returns = [];
  for (let index = 1; index < closes.length; index += 1) {
    returns.push((closes[index] - closes[index - 1]) / closes[index - 1]);
  }
  const mean = average(returns);
  const variance = average(returns.map((value) => Math.pow(value - mean, 2)));
  return Math.sqrt(variance) * 100;
}

function runAIStrategy() {
  const signal = chartProfile().verified
    ? calculateAIStrategy(state.candles)
    : createPendingSignal();
  renderSignalPanel(signal, true);
  renderTradePlan(signal, true);
}

function createPendingSignal() {
  return {
    type: "hold",
    score: 0,
    confidence: 0,
    riskLevel: "medium",
    isVerified: false,
    factors: {
      trend: 0,
      momentum: 0,
      volume: 0,
      risk: 0
    },
    metrics: {
      rsi: 0,
      atrPercent: 0,
      volumeRatio: 0,
      volatility: 0,
      emaSpreadPercent: 0,
      close: 0
    },
    summary: "行情未同步",
    reason: "尚未取得可信行情資料。"
  };
}

function renderSignalPanel(signal, markAsAnalyzed) {
  const profile = chartProfile();
  const labelMap = {
    buy: "買進",
    sell: "賣出",
    hold: "觀望"
  };
  const riskText = {
    low: "低風險",
    medium: "中性",
    high: "高風險"
  };

  if (!profile.verified) {
    elements.scoreValue.textContent = "--";
    elements.scoreCaption.textContent = "需校準圖表現價";
    elements.confidenceValue.textContent = "--%";
    elements.volumeRatio.textContent = "--x";
    elements.atrRisk.textContent = "--%";
    elements.riskCaption.textContent = "未校準";
    elements.dataSource.textContent = "未取得";
    elements.dataSourceCaption.textContent = "TradingView / Yahoo / Stooq 皆未回資料";
    elements.signalPill.textContent = "PENDING";
    elements.signalPill.className = "signal-pill hold";
    elements.signalLabel.textContent = "待校準";
    elements.signalSummary.textContent = "資料源未校準，暫停 AI 評分";
    elements.signalReason.textContent = "TradingView 公開圖表無法讓外部程式讀取即時 K 線；此自訂標的尚未有可信價格快照，因此系統不產生交易判斷。";
  } else {
    elements.scoreValue.textContent = signal.score.toFixed(2);
    elements.scoreCaption.textContent = markAsAnalyzed ? `${profile.label} 快照` : "等待重新分析";
    elements.confidenceValue.textContent = `${signal.confidence}%`;
    elements.volumeRatio.textContent = `${signal.metrics.volumeRatio.toFixed(2)}x`;
    elements.atrRisk.textContent = `${signal.metrics.atrPercent.toFixed(2)}%`;
    elements.riskCaption.textContent = riskText[signal.riskLevel];
    elements.dataSource.textContent = profile.dataSource || "Public API";
    elements.dataSourceCaption.textContent = profile.marketData ? "即時快照與公開指標" : "公開日線 OHLCV candles";
    elements.signalPill.textContent = signal.type.toUpperCase();
    elements.signalPill.className = `signal-pill ${signal.type}`;
    elements.signalLabel.textContent = labelMap[signal.type];
    elements.signalSummary.textContent = signal.summary;
    elements.signalReason.textContent = signal.reason;
  }
  elements.riskLevel.textContent = riskText[signal.riskLevel];
  elements.riskLevel.className = `risk-level ${signal.riskLevel}`;
  if (!profile.verified) {
    elements.riskLevel.textContent = "未同步";
    elements.volatilityValue.textContent = "--";
    elements.rsiValue.textContent = "--";
    elements.emaSpread.textContent = "--";
    elements.closePrice.textContent = "--";
    elements.lastUpdated.textContent = "--:--:--";
    updateFactor("trend", 0);
    updateFactor("momentum", 0);
    updateFactor("volume", 0);
    updateFactor("risk", 0);
    return;
  }
  elements.volatilityValue.textContent = `${signal.metrics.volatility.toFixed(2)}%`;
  elements.rsiValue.textContent = signal.metrics.rsi.toFixed(1);
  elements.emaSpread.textContent = `${signal.metrics.emaSpreadPercent.toFixed(2)}%`;
  elements.closePrice.textContent = `$${signal.metrics.close.toFixed(2)}`;
  elements.lastUpdated.textContent = markAsAnalyzed
    ? new Date().toLocaleTimeString("zh-TW", { hour12: false })
    : "--:--:--";

  updateFactor("trend", signal.factors.trend);
  updateFactor("momentum", signal.factors.momentum);
  updateFactor("volume", signal.factors.volume);
  updateFactor("risk", signal.factors.risk);
}

function updateFactor(name, score) {
  elements[`${name}Score`].textContent = String(score);
  elements[`${name}Bar`].style.width = `${score}%`;
}

function renderTradePlan(signal, markAsAnalyzed) {
  const plan = calculateTradePlan(signal);
  const statusClass = !signal.isVerified ? "wait" : signal.type === "buy" ? "buy" : signal.type === "sell" ? "sell" : "wait";
  const statusText = markAsAnalyzed
    ? plan.status
    : "等待分析";

  elements.planStatus.textContent = statusText;
  elements.planStatus.className = `plan-status ${statusClass}`;
  elements.planEntry.textContent = plan.entry;
  elements.planStop.textContent = plan.stop;
  elements.planTargetOne.textContent = plan.targetOne;
  elements.planTargetTwo.textContent = plan.targetTwo;
  elements.planRr.textContent = plan.rr;
  elements.planSize.textContent = plan.size;
  elements.planNote.textContent = markAsAnalyzed
    ? plan.note
    : "按下「AI 策略指標」後，系統會依目前圖表快照產生可執行的交易風險計畫。";
}

function calculateTradePlan(signal) {
  const profile = chartProfile();
  if (!profile.verified) {
    return {
      status: "需校準",
      entry: "--",
      stop: "--",
      targetOne: "--",
      targetTwo: "--",
      rr: "--",
      size: "0%",
      note: `${profile.short} 尚未校準圖表現價。交易員不應使用模擬價格產生入場、停損或目標價；請改用已校準標的，或接入可信行情資料後再產生交易計畫。`
    };
  }
  const close = signal.metrics.close;
  const atr = close * (signal.metrics.atrPercent / 100);
  const riskUnit = Math.max(atr, close * 0.012);
  const isBuy = signal.type === "buy";
  const isSell = signal.type === "sell";

  if (!isBuy && !isSell) {
    const upperTrigger = close + riskUnit * 0.65;
    const lowerTrigger = close - riskUnit * 0.65;
    return {
      status: "等待觸發",
      entry: `${formatPrice(lowerTrigger)} - ${formatPrice(upperTrigger)}`,
      stop: "不建議進場",
      targetOne: "等待突破",
      targetTwo: "等待回測",
      rr: "--",
      size: "0%",
      note: `${profile.short} 目前未達交易門檻。專業交易員會等待價格突破 ${formatPrice(upperTrigger)} 或跌破 ${formatPrice(lowerTrigger)} 後，再重新評估風險報酬。`
    };
  }

  const direction = isBuy ? 1 : -1;
  const entry = close;
  const stop = entry - direction * riskUnit;
  const targetOne = entry + direction * riskUnit * 1.5;
  const targetTwo = entry + direction * riskUnit * 2.4;
  const rr = Math.abs((targetTwo - entry) / (entry - stop));
  const riskPenalty = signal.riskLevel === "high" ? 0.55 : signal.riskLevel === "medium" ? 0.78 : 1;
  const confidenceBoost = signal.confidence / 100;
  const size = clamp(1.6 * riskPenalty * confidenceBoost, 0.4, 1.8);

  return {
    status: isBuy ? "偏多計畫" : "偏空計畫",
    entry: formatPrice(entry),
    stop: formatPrice(stop),
    targetOne: formatPrice(targetOne),
    targetTwo: formatPrice(targetTwo),
    rr: `${rr.toFixed(1)}R`,
    size: `${size.toFixed(1)}%`,
    note: `${profile.short} 採${isBuy ? "順勢買進" : "降低曝險/偏空"}計畫。單筆風險建議控制在資金 ${size.toFixed(1)}% 內，價格觸及目標一可先減碼，剩餘部位用停損保護。`
  };
}

function buildSummary(type, score) {
  if (type === "buy") return `多因子偏多，AI 分數 ${score.toFixed(2)}`;
  if (type === "sell") return `下行風險偏高，AI 分數 ${score.toFixed(2)}`;
  return `訊號未達交易門檻，AI 分數 ${score.toFixed(2)}`;
}

function buildReason({ type, emaSpreadPercent, rsi, volumeRatio, atrPercent, riskLevel }) {
  const trend = emaSpreadPercent >= 0
    ? `EMA12 高於 EMA26 ${Math.abs(emaSpreadPercent).toFixed(2)}%`
    : `EMA12 低於 EMA26 ${Math.abs(emaSpreadPercent).toFixed(2)}%`;
  const momentum = rsi >= 70
    ? `RSI ${rsi.toFixed(1)} 偏熱`
    : rsi <= 35
      ? `RSI ${rsi.toFixed(1)} 偏弱`
      : `RSI ${rsi.toFixed(1)} 接近圖表目前動能區`;
  const volume = `量能為 20 日均量 ${volumeRatio.toFixed(2)} 倍`;
  const risk = `ATR 風險 ${atrPercent.toFixed(2)}%，風險等級為${riskLevel === "high" ? "高" : riskLevel === "low" ? "低" : "中"}`;

  if (type === "buy") return `${trend}，${momentum}，${volume}，${risk}，目前圖表快照偏向買進。`;
  if (type === "sell") return `${trend}，${momentum}，${volume}，${risk}，目前圖表快照偏向降低曝險。`;
  return `${trend}，${momentum}，${volume}，${risk}，目前圖表快照維持觀望。`;
}

function normalizeSymbol(input) {
  const raw = String(input || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return "";
  if (SYMBOL_ALIASES[raw]) return SYMBOL_ALIASES[raw];
  if (raw.includes(":")) return raw;
  if (/^\d{4}$/.test(raw)) return `TWSE:${raw}`;
  return `NASDAQ:${raw.replace(/[^A-Z0-9._-]/g, "")}`;
}

function toYahooSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  const [exchange, ticker] = normalized.split(":");
  if (exchange === "TWSE") return `${ticker}.TW`;
  if (exchange === "TPEX") return `${ticker}.TWO`;
  return ticker;
}

function toStooqSymbol(dataSymbol) {
  const symbol = String(dataSymbol || "").trim().toLowerCase();
  if (!symbol) return "";
  if (symbol.endsWith(".tw")) return symbol;
  if (symbol.endsWith(".two")) return symbol.replace(".two", ".tw");
  if (symbol.includes(".")) return symbol;
  return `${symbol}.us`;
}

function loadSymbols(key, fallback) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return fallback;
    return mergeSymbols(parsed.map(normalizeSymbol).filter(Boolean));
  } catch {
    return fallback;
  }
}

function saveSymbols(key, symbols) {
  window.localStorage.setItem(key, JSON.stringify(mergeSymbols(symbols)));
}

function mergeSymbols(...groups) {
  const seen = new Set();
  const result = [];
  groups.flat().forEach((symbol) => {
    const normalized = normalizeSymbol(symbol);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function buildSpark(seed, trendBias) {
  return Array.from({ length: 10 }, (_, index) => {
    const wave = 42 + Math.sin((seed + index) / 2.2) * 20 + trendBias * index * 9 + pseudoNoise(seed + index * 3) * 18;
    return Math.round(clamp(wave, 16, 92));
  });
}

function buildSparkFromCandles(candles) {
  const sample = candles.slice(-10);
  const closes = sample.map((candle) => candle.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = Math.max(max - min, 0.01);
  return closes.map((close) => Math.round(18 + ((close - min) / range) * 74));
}

function buildSparkFromSnapshot(profile) {
  const data = profile.marketData;
  const start = data.open || data.close;
  const end = data.close;
  return Array.from({ length: 10 }, (_, index) => {
    const progress = index / 9;
    const drift = start + (end - start) * progress;
    const wave = Math.sin((profile.seed + index) / 2.2) * Math.max(data.atr * 0.18, data.close * 0.002);
    const value = drift + wave;
    const min = Math.min(start, end) - data.atr * 0.25;
    const max = Math.max(start, end) + data.atr * 0.25;
    return Math.round(18 + ((value - min) / Math.max(max - min, 0.01)) * 74);
  }).map((value) => clamp(value, 16, 92));
}

function symbolSeed(symbol) {
  return String(symbol).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function pseudoNoise(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value) - 0.5;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function blend(a, b, bWeight) {
  return a * (1 - bWeight) + b * bWeight;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatPrice(value) {
  return `$${round(Math.max(value, 0)).toFixed(2)}`;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
