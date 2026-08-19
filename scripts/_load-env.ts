/**
 * Minimal .env loader for the creator-outreach scripts.
 *
 * tsx doesn't read .env files, and this project has no dotenv dependency — so
 * without this every script would need the caller to remember
 * `set -a; source .env.local`. Files are read in increasing priority and
 * existing process.env values always win, so an inline override on the command
 * line still does what it looks like it does.
 */

import fs from 'fs';
import path from 'path';

const FILES = ['.env', '.env.local', '.env.development.local'];

export function loadEnv(): void {
  for (const file of FILES) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;

    for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;

      const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, '');
      // An already-set value wins — but only a real one. `vercel env pull`
      // writes KEY="" for variables whose value was never filled in, and
      // treating that as "set" would let an empty placeholder in an
      // earlier-read file shadow a real value in a later one.
      if (process.env[key]) continue;

      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadEnv();
