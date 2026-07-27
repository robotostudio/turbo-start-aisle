/**
 * Loads env from `.env.local` then `.env` (relative to the studio cwd) before
 * any other module reads `process.env`. Neither call overrides a variable that
 * is already set, so real shell env wins, then `.env.local`, then `.env`.
 *
 * Must be imported FIRST in index.ts — ESM evaluates a module's imports in
 * source order, so this runs before `../seed-shopify/client.js` calls
 * `dotenv/config` (which only loads `.env`).
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });
