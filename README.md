# AP EAPCET 2025 Cutoff Explorer

A static, no-build website for exploring **AP EAPCET 2025** (Andhra Pradesh Engineering, Agriculture & Pharmacy Common Entrance Test) college admission cutoffs — built to help students shortlist colleges during counseling.

Live data: official **"Last Rank Details"** cutoff list (2025), covering 274 colleges / 1609 branch-category cutoff rows across all 22 reservation categories (OC, SC, SC-II, SC-III, ST, BC-A/B/C/D/E, OC-EWS — each Boys/Girls).

## Features

- **Caste / reservation category dropdown** — all 11 categories × Boys/Girls.
- **Zone/Region and District filters** — AU zone, SVU zone, statewide (deemed/private university) zone, plus all 13 AP districts.
- **College ownership filter** — Private Colleges vs. Universities.
- **Multi-branch selection** — pick multiple branches (CSE, ECE, EEE, ...); each branch gets its own separately ranked results table.
- **Best-to-least sorting** — results sorted ascending by cutoff rank (lowest/best rank first).
- **Optional max-rank filter** — hide colleges beyond a rank you'd realistically get.
- **Download as image** — export any branch's result table as PNG or JPEG (via `html2canvas`) for offline reference during counseling.
- 100% static — no backend, no build step. Deploys directly to GitHub Pages.

## Project structure

```
index.html              Single-page app shell
assets/css/style.css    Styling
assets/js/app.js        Filtering, sorting, rendering, image export logic
data/cutoffs.json       Parsed cutoff dataset (1609 rows, 22 category columns)
```

## Running locally

Any static file server works, e.g.:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. In the repo settings, under **Pages**, set the source to the `main` branch, root folder (`/`).
3. The site will be published at `https://<user>.github.io/<repo>/`.

## Data notes

- Parsed deterministically from the official PDF using a fixed-width column parser (positional alignment per page-header block) to correctly preserve blank cutoff cells (`null` = no admission occurred in that category that year) instead of guessing values.
- Some deemed/private universities (ownership type `PU`) publish **separate rank lists per zone** (AU zone vs. SVU zone) for the same branch — these appear as distinct rows differentiated by the `region`/`localArea` fields, not a data error.
- This tool is for counseling reference only. Always cross-check against the official AP EAPCET portal before finalizing your choices.
