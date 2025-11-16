# NHS Procurement Scraper (Next.js + CF/FTS APIs)

A Next.js 14 app that aggregates UK procurement notices relevant to NHS technology from:
- **Contracts Finder** (public API v2) — search with keywords, CPV, type, status, date.
- **Find a Tender** (optional) — requires a `CDP-Api-Key`. If omitted, the app simply skips FTS.

It includes: UI filters, Excel/JSON export, optional daily email summary.

## Local Run (Yarn)

```bash
yarn
cp .env.example .env    # fill env vars (FTS_API_KEY optional)
yarn dev
# visit http://localhost:3000
```

### Optional: Daily Email Summary
Start the app and in another terminal run:
```bash
yarn cron
```
This schedules a 06:35 Europe/London job that calls `/api/search` and emails a top-20 summary to `ALERT_RECIPIENTS`.

## Notes & Compliance
Use the official APIs. FTS requires an API key (see their docs). Avoid scraping HTML pages.
