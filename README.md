# AI 投資量化策略儀表板

一個 B2B 科技感的股票數據 Dashboard，整合 TradingView 圖表、公開行情 API、AI 量化策略分數、風險監控與交易計畫。前端為原生 HTML/CSS/JavaScript，部署環境使用 Vercel Static + Serverless Functions。

> 本專案僅作為策略展示與前端作品，不構成任何投資建議。

## 功能特色

- TradingView 市場圖表嵌入，支援切換不同股票標的。
- 搜尋標的、加入最愛、移除自選標的。
- 左側 watchlist 顯示標的價格、漲跌幅與簡易走勢。
- AI 策略指標按鈕，可根據目前標的資料產生策略分數。
- 交易計畫面板，顯示入場區、停損、目標價、風險報酬與建議倉位。
- 風險監控面板，顯示 RSI、EMA 差距、波動率與現價。
- 資料來源卡片，顯示目前使用 TradingView scanner 或 Yahoo Finance。
- 深色 / 淺色模式切換，並保存使用者偏好。
- RWD 響應式設計，桌機與手機皆可使用。

## AI 策略邏輯

策略分數由以下因子加權計算：

```txt
AI 策略分數 =
  趨勢分數 * 0.35
+ 動能分數 * 0.25
+ 量能分數 * 0.20
+ 風險分數 * 0.20
```

因子來源：

- 趨勢：EMA(12) 與 EMA(26) 的相對位置與差距。
- 動能：RSI(14) 判斷強弱、過熱或偏弱。
- 量能：目前成交量相對近 20 日均量。
- 風險：ATR 或近期波動率，風險越高分數越低。

訊號規則：

- `score >= 70`：BUY
- `score <= 35`：SELL
- 其他：HOLD

## 專案結構

```txt
api/
  market-data.js        # 統一行情 API，前端主要呼叫這支
  tradingview-scan.js   # TradingView scanner proxy
  yahoo-chart.js        # Yahoo Finance chart proxy
  stooq-daily.js        # Stooq CSV proxy

lib/
  market-utils.js       # Serverless API 共用工具

public/
  index.html            # Dashboard HTML
  styles.css            # 深色 / 淺色與 RWD 樣式
  app.js                # 前端互動、策略計算、圖表初始化

vercel.json             # Vercel 路由與部署設定
README-DEPLOY.md        # 部署備忘
README.md               # 專案說明
```

## 本機開發

如果只要檢查靜態頁面，可直接開 `public/index.html`，但行情 API 需要 Serverless 或本機 API server 才能運作。

建議使用 Vercel CLI：

```bash
vercel dev
```

接著打開：

```txt
http://localhost:3000
```

## Vercel 部署

把本資料夾內容上傳到 GitHub，根目錄應包含：

```txt
api/
lib/
public/
README.md
README-DEPLOY.md
vercel.json
```

不要把舊的本機檔案放在根目錄，例如：

```txt
app.js
index.html
styles.css
server.mjs
```

部署步驟：

1. 到 Vercel 建立新專案。
2. 匯入 GitHub repository。
3. Framework Preset 選 `Other`。
4. Deploy。

部署成功後可測試：

```txt
https://你的網域/api/market-data?symbol=NYSE:TSM
```

若回傳 JSON，即代表 API 正常。

## 主要 API

### `GET /api/market-data`

前端主要使用的統一行情 API。

範例：

```txt
/api/market-data?symbol=NYSE:TSM
```

回傳內容包含：

- `symbol`
- `source`
- `snapshot`
- `candles`

### `POST /api/tradingview-scan`

TradingView scanner proxy，主要作為行情快照來源。

### `GET /api/yahoo-chart`

Yahoo Finance 日線資料 proxy。

範例：

```txt
/api/yahoo-chart?symbol=TSM
```

## 注意事項

- TradingView scanner 與 Yahoo Finance 為公開端點，可能因頻率限制、地區或雲端環境而失敗。
- 若要正式商用，建議改接授權行情源，例如 Polygon、Finnhub、Twelve Data、Tiingo 等。
- API key 應放在 Vercel Environment Variables，不要寫死在前端或 repository。
- AI 策略分數僅為展示用途，不應作為真實買賣決策依據。
