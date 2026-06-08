# AI Incident Observatory

Video links: 
[![YouTube](https://img.shields.io/badge/Watch%20on-YouTube-red?logo=youtube&logoColor=white)](https://youtu.be/AGbP2dNsQa4) [![Google Drive](https://img.shields.io/badge/Watch%20on-Google%20Drive-green?logo=googledrive&logoColor=white)](https://drive.google.com/file/d/1vmf7ZKgfgncIonnZhRlIAEEaQRAdEQZQ/view?usp=sharing)

An AI & Ethics project that does two things:

1. **Catalogs real-world AI/ML system failures** from public incident databases and renders them as an interactive 2D canvas visualization.
2. **Surveys frontier AI models on a 100-question ethics questionnaire** and visualizes how different models answer.

Built with Express + SQLite on the backend and vanilla HTML/CSS/JS + D3.js on the frontend. No build step, no framework.

## Quick start

```bash
npm install
npm run seed   # one-time: bootstrap DB with 68 curated incidents
npm start      # serves on http://localhost:3000
```

Other scripts:

```bash
npm run dev      # nodemon auto-reload
node check_db.js # print incident counts by year
```

## What's in here

| Path | Purpose |
|---|---|
| `server/index.js` | Express entry point, static file server, 6-hour sync cron |
| `server/db.js` | SQLite wrapper (WAL mode, promisified `run`/`get`/`all`) |
| `server/seed.js` | 68 curated incidents (2012–2025) across 12 categories |
| `server/scrapers/` | Aggregators for AIID, AIAAIC, AVID, MITRE ATLAS, news |
| `server/routes/incidents.js` | REST CRUD + `/stats`, `/developers`, `/categories` |
| `server/routes/ethics.js` | Serves the model ethics survey data |
| `public/index.html` | Main canvas dashboard |
| `public/analytics.html` | Aggregate analytics view |
| `public/ethics.html` | Model-by-model ethics comparison view |
| `data/ai_answers.csv` | Raw answers from 56 AI models to the 100-question survey |
| `data/ethical_questions.csv` | The 100 ethics questions |
| `data/AI_SURVEY_PROMPT.txt` | The prompt used to administer the survey |

## Incident data sources

- **AIID** — GraphQL API at `incidentdatabase.ai`
- **AIAAIC** — Public Google Sheets CSV
- **AVID** — AI Vulnerability Database
- **MITRE ATLAS** — Adversarial threat matrix for ML
- **News** — Curated keyword feed
- **Manual / seed** — Curated entries via `seed.js` and `admin.html`

Deduplication uses exact `external_id` matching plus normalized Levenshtein distance (<0.15) on titles.

## Schema

Single `incidents` table:

```
id, title, description, system_name, developer, category, subcategory,
year, month, severity (1-3), affected_group, geography, source_url,
tags (JSON array), external_id, source, created_at, updated_at
```

Valid `source` values: `aiid`, `aiaaic`, `avid`, `atlas`, `news`, `manual`, `scraped`.

## Environment

```
PORT=3000
SYNC_ON_STARTUP=false
AIID_API_URL=https://incidentdatabase.ai/api/graphql
AIAAIC_CSV_URL=https://docs.google.com/spreadsheets/...
```

