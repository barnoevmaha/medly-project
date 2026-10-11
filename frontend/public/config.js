// Development placeholder. In Docker this file is overwritten at container
// start by docker-entrypoint.sh. Empty means "fall back to VITE_API_URL, then
// to http://localhost:8000 under `npm run dev`, or to this same origin in a
// production build" — see src/lib/api.ts.
window.__MEDLY_API_URL__ = "";
