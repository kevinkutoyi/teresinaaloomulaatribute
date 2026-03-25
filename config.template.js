/* =============================================================
   config.template.js — COMMITTED TO GITHUB (safe — no real token)
   This file is used by the GitHub Actions workflow to generate
   the real config.js at deploy time by injecting MY_GITHUB_TOKEN.

   DO NOT put a real token in this file.
   ============================================================= */

window.__TRIBUTE_CONFIG__ = {
  token:  'MY_GITHUB_TOKEN',            // replaced by CI — do not edit
  repo:   'kevinkutoyi/teresinaaloomulaa',   // ← update this to your repo
  branch: 'main',
  path:   'data.json'
};
