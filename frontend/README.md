# Medly — React + Vite + Tailwind

A rebuild of the Medly layout as a real React app. Same structure and design system as the
original; all copy lives in one file so you can swap in your own content.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
```

## Make it yours — two files

**`src/data/content.ts`** — every heading, card, list and label on all seven pages.
Edit the values, the components adapt. Add or remove array items freely; grids reflow.

**`src/config/site.ts`** — app name, logo initial, and the sidebar nav items.

For colours, open **`src/index.css`** and change the HSL triplets under `:root`.
Everything is derived from them, so changing `--primary` re-themes the whole app.

```css
--primary: 174 72% 40%;   /* teal  → try 221 83% 53% for blue */
--accent:  12 85% 62%;    /* coral */
--radius:  0.75rem;
```

## Structure

```
src/
  config/site.ts            branding + nav
  data/content.ts           marketing copy only (landing page + Premium plans)
  lib/session.tsx           shared current-user context: me, refresh, logout
  index.css                 design tokens, fonts, component classes
  lib/utils.ts              cn() class merger
  components/
    layout/
      AppLayout.tsx         sidebar + mobile nav + content slot
      Sidebar.tsx           desktop sidebar (md and up)
      MobileNav.tsx         bottom tab bar (below md)
      PageHeader.tsx        shared title/subtitle/action row
    ui/                     button, card, badge, input, progress, avatar,
                            toast (success feedback), states (loading/empty/error)
    imaging/                FilmViewer, ImagingTabs
    feed/                   ArticleFeed — full size on Your Feed, preview on Dashboard
  lib/preferences.ts        theme, reduced motion, confirmation toasts
  pages/                    Home, Dashboard, Feed, Article, Library, Saved,
                            Settings, Community, CommunityRoom, Challenges,
                            ChallengeRun, Leaderboard, Premium, Profile, Learn,
                            Course, Quiz, Imaging, Casebook, CaseReference,
                            Governance
public/
  fonts/                    Inter 300–700, Plus Jakarta Sans 500–700 (self-hosted)
  avatar.jpg
```

## Routes

| Path | Page | Layout |
|---|---|---|
| `/` | Home | standalone marketing page, own top nav |
| `/dashboard` | Dashboard | app shell |
| `/feed` | Your Feed | app shell |
| `/feed/:slug` | Article + comments | app shell |
| `/community` `/community/:slug` | Community list, community chat | app shell |
| `/challenges` `/challenges/:slug` | Challenge list, challenge runner | app shell |
| `/library` | Videos · Saved · Books · PDFs · Articles | app shell |
| `/saved` | Redirects to `/library?tab=saved` | app shell |
| `/settings` | Account, security, privacy, appearance | app shell |
| `/leaderboard` | Ranking by points | app shell |
| `/premium` | Premium | app shell |
| `/profile` | Profile (`?tab=badges` deep-links) | app shell |
| `/imaging` `/imaging/cases` `/imaging/cases/:id` | Workbench, case references | app shell |

Student nav: Dashboard · Communities · Challenges · Library · Profile, then Go
Premium, Settings and Log out. Saved is a Library tab. AI Training, the imaging
Workbench and Governance appear in the sidebar for instructors and admins only.

## What works

Every interaction below is backed by an API call, not local state:

- Dashboard — full-text feed search (server-side, searches article bodies), like,
  save, share-copies-link, comment jumps to the article's comment section
- Article — full body, comment thread, save and share
- Library — search, type tiles, resource detail, save without leaving Library
- Saved — articles, PDFs, books and videos in one collection, with remove
- Settings — account edits, password change, leaderboard visibility, dark mode
- Community — search scoped to name and description, join/leave, chat
- Challenges — join opens the real question set; per-question feedback and points
- Profile — rank, badges, joined communities, activity, all from real rows
- Sidebar and tab bar — active route highlighting via `NavLink`

## Notes

- Icons are `lucide-react`, imported per-icon so only what you use is bundled.
- Fonts are self-hosted in `public/fonts` — no external requests, no layout shift.
- Dark theme lives in the `.dark` block in `index.css` — the same variables with
  different values. `src/lib/preferences.ts` toggles the class on `<html>` and is
  applied in `main.tsx` before the first paint, so there is no flash of light.
- Deploying to a static host: the app uses `BrowserRouter`, so configure a
  catch-all rewrite to `/index.html` (Netlify `_redirects`, Vercel `rewrites`,
  or `try_files` in nginx). Otherwise use `HashRouter`.

---

## Connecting to the API

The app talks to the FastAPI backend in `../backend`. Start it first:

```bash
cd ../backend && uvicorn app.main:app --reload
```

Point the frontend elsewhere with `VITE_API_URL` in `.env` (see `.env.example`).
Default is `http://localhost:8000`.

Every page inside the app shell needs the API. Only the public landing page and
the Premium plan copy still come from `src/data/content.ts` — anything a user can
earn, save or change lives in the database.

Auth token is kept in `localStorage` under `medly.token`.
