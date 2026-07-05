# AI Investment Dashboard - Vercel Deploy

This folder is Vercel-ready.

## Deploy From Vercel Dashboard

1. Push this folder to a GitHub repository.
2. In Vercel, create a new project from that repository.
3. Set the project root to this folder if the repo contains other files:
   `outputs/ai-investment-dashboard`
4. Keep the default framework preset as `Other`.
5. Deploy.

## Deploy With Vercel CLI

```bash
cd outputs/ai-investment-dashboard
vercel
```

For production:

```bash
vercel --prod
```

## API Routes

- `/api/market-data?symbol=NYSE:TSM`
- `/api/tradingview-scan`
- `/api/yahoo-chart?symbol=TSM`
- `/api/stooq-daily?symbol=tsm.us`

The frontend primarily calls `/api/market-data`, which aggregates public market data on the server side before sending a clean JSON payload to the dashboard.

## Notes

TradingView scanner and Yahoo Finance are public endpoints and may rate-limit or block cloud traffic. For a production trading product, replace them with a licensed market data provider and store the API key in Vercel Environment Variables.
