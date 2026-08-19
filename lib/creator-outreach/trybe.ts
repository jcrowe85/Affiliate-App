/**
 * Stage 1 — sourcing creators from Trybe's filtered directory.
 *
 * We replay Trybe's own creator-search request (captured once from DevTools;
 * see scripts/creators-capture-trybe.ts) and page through it. Because the
 * exact JSON shape of that endpoint is unknown until it is captured, this
 * module discovers the creator records rather than hard-coding a path into
 * them: it walks the response for the array that most looks like a list of
 * people with Instagram handles.
 *
 * That indirection is the whole point. When Trybe reshapes its payload, the
 * discovery heuristic usually still finds the list, and when it doesn't the
 * fix is a field path in a JSON config file rather than a code change.
 */

import fs from 'fs';
import path from 'path';
import type { RequestSpec } from './curl';

export type TrybeConfig = {
  request: RequestSpec;
  pagination: {
    /**
     * 'query'     — page number lives in the URL query string
     * 'body-json' — page number is a key in a JSON request body
     * 'offset'    — like 'query', but counts records rather than pages
     * 'none'      — single request, no paging
     */
    mode: 'query' | 'body-json' | 'offset' | 'none';
    param: string;
    start: number;
    /** For 'offset' mode, the page size to advance by. */
    step: number;
    maxPages: number;
  };
  /**
   * Optional explicit paths, used when auto-discovery guesses wrong.
   * Dot-notation, e.g. "data.creators" / "profile.instagram.username".
   */
  fields?: {
    recordsPath?: string;
    handlePath?: string;
    idPath?: string;
    namePath?: string;
    followersPath?: string;
  };
  /** Free-text label recorded on every lead, e.g. "beauty-us-10k-50k". */
  label?: string | null;
};

export type SourcedCreator = {
  instagramHandle: string;
  trybeCreatorId: string | null;
  fullName: string | null;
  followers: number | null;
  /** The original record, kept so a mis-mapped field can be recovered later. */
  raw: unknown;
};

export const CONFIG_DIR = path.join(process.cwd(), '.trybe');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'request.json');

export function loadConfig(configPath = CONFIG_PATH): TrybeConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `No Trybe request captured yet (${configPath} is missing).\n` +
        'Run: npm run creators:capture -- <file-with-curl-command>'
    );
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as TrybeConfig;
}

/** Reads a dot-notation path, tolerating missing links. */
function readPath(value: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((node, key) => {
    if (node === null || typeof node !== 'object') return undefined;
    return (node as Record<string, unknown>)[key];
  }, value);
}

/** Keys that specifically name Instagram, not just any social handle. */
const INSTAGRAM_KEY = /instagram/i;

/** Generic handle keys. Only trusted when the record models no socials at all. */
const GENERIC_HANDLE_KEY = /^(ig|ig_?handle|ig_?username|handle|username|social_?handle|screen_?name)$/i;

/** Any key naming a social platform, at any depth. */
const SOCIAL_FIELD_KEY = /(instagram|tiktok|youtube|twitter|snapchat|facebook|pinterest|linkedin|twitch)/i;

/**
 * True when the record models social accounts as their own fields.
 *
 * If a payload carries `tiktokUrl` but no `instagramUrl`, the platform tracks
 * Instagram separately and this creator simply has none — so a top-level
 * `username` is that platform's handle, not an Instagram one. Guessing there is
 * how you end up emailing a stranger who happens to own the matching handle.
 */
export function modelsSocialsExplicitly(record: unknown, depth = 0): boolean {
  if (depth > 4 || record === null || typeof record !== 'object') return false;
  if (Array.isArray(record)) return record.some((item) => modelsSocialsExplicitly(item, depth + 1));

  for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
    if (SOCIAL_FIELD_KEY.test(key)) return true;
    if (modelsSocialsExplicitly(value, depth + 1)) return true;
  }
  return false;
}

/** Finds a handle inside a container already known to be Instagram-specific. */
function handleInsideInstagramNode(node: unknown, depth = 0): string | null {
  if (depth > 3 || node === null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = handleInsideInstagramNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (typeof value === 'string' && (GENERIC_HANDLE_KEY.test(key) || /url|link|profile/i.test(key))) {
      const handle = normalizeHandle(value);
      if (handle) return handle;
    }
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    const found = handleInsideInstagramNode(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Instagram-specific pass: only values reached through a key naming Instagram.
 */
function findInstagramHandle(record: unknown, depth = 0): string | null {
  if (depth > 4 || record === null || typeof record !== 'object') return null;
  if (Array.isArray(record)) {
    for (const item of record) {
      const found = findInstagramHandle(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const entries = Object.entries(record as Record<string, unknown>);

  for (const [key, value] of entries) {
    if (!INSTAGRAM_KEY.test(key)) continue;
    if (typeof value === 'string') {
      const handle = normalizeHandle(value);
      if (handle) return handle;
    } else {
      // `instagram: { username: ... }` — inside an Instagram-named container,
      // a generic key is unambiguous.
      const nested = handleInsideInstagramNode(value);
      if (nested) return nested;
    }
  }

  for (const value of Object.values(record as Record<string, unknown>)) {
    const found = findInstagramHandle(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Pulls a usable handle out of an arbitrary record.
 *
 * Instagram-specific keys win at every depth. Trybe records carry both a
 * top-level `username` (their own platform handle) and a nested
 * `creatorProfile.instagramUrl`, and on a live sample of 100 the two disagreed
 * for **54 creators** — taking the generic key meant scraping Instagram
 * accounts that belonged to other people, or to nobody.
 *
 * The generic fallback survives only for payloads that model no socials at all,
 * where `username` really is the only handle on offer.
 */
function findHandle(record: unknown, depth = 0, strictSocials?: boolean): string | null {
  const specific = findInstagramHandle(record, depth);
  if (specific) return specific;
  // `strictSocials` is decided across the whole page (see toCreators): if any
  // record models socials as fields, then a record missing an Instagram field
  // has no Instagram — rather than one hiding in `username`. Judged per-record
  // this is undecidable, which is why the caller supplies it.
  const strict = strictSocials ?? modelsSocialsExplicitly(record);
  if (strict) return null;
  return findGenericHandle(record, depth);
}

function findGenericHandle(record: unknown, depth = 0): string | null {
  if (depth > 4 || record === null || typeof record !== 'object') return null;
  if (Array.isArray(record)) {
    for (const item of record) {
      const found = findGenericHandle(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const entries = Object.entries(record as Record<string, unknown>);
  for (const [key, value] of entries) {
    if (GENERIC_HANDLE_KEY.test(key) && typeof value === 'string') {
      const handle = normalizeHandle(value);
      if (handle) return handle;
    }
  }
  for (const value of Object.values(record as Record<string, unknown>)) {
    const found = findGenericHandle(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Reduces anything Trybe might store — "@name", a profile URL, a bare handle —
 * to the bare lowercase handle, or null when it clearly isn't one.
 */
export function normalizeHandle(value: string | null | undefined): string | null {
  if (!value) return null;
  let handle = value.trim();

  const urlMatch = handle.match(/instagram\.com\/([^/?#\s]+)/i);
  if (urlMatch) handle = urlMatch[1];
  // Reject other platforms' URLs outright rather than keeping the path segment.
  else if (/^https?:\/\//i.test(handle)) return null;

  handle = handle.replace(/^@+/, '').replace(/\/+$/, '').trim().toLowerCase();

  // Instagram's own rule: letters, digits, periods, underscores, 1–30 chars.
  if (!/^[a-z0-9._]{1,30}$/.test(handle)) return null;
  // Reserved paths that appear in profile URLs but aren't people.
  if (['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'direct'].includes(handle)) return null;

  return handle;
}

function findName(record: Record<string, unknown>): string | null {
  for (const key of ['full_name', 'fullName', 'name', 'display_name', 'displayName']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  // Split name fields, joined when both are present. Trybe uses camelCase.
  const first = record['firstName'] ?? record['first_name'];
  const last = record['lastName'] ?? record['last_name'];
  const parts = [first, last].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return parts.length > 0 ? parts.join(' ').trim() : null;
}

function findFollowers(record: Record<string, unknown>): number | null {
  for (const key of ['followers', 'follower_count', 'followerCount', 'followers_count', 'audience_size', 'reach']) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
    if (typeof value === 'string' && /^\d+$/.test(value)) return parseInt(value, 10);
  }
  return null;
}

function findId(record: Record<string, unknown>): string | null {
  for (const key of ['id', 'creator_id', 'creatorId', 'uuid', '_id', 'user_id', 'userId']) {
    const value = record[key];
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number') return String(value);
  }
  return null;
}

/**
 * Finds the array of creator records in a response of unknown shape.
 *
 * Ranks every object-array in the payload by how many of its items yield a
 * handle, breaking ties on the share that do. Count has to lead: a "featured
 * creator" block where the single entry has a handle scores a perfect ratio,
 * and would otherwise beat the actual 24-item results page.
 */
export function discoverRecords(payload: unknown): Record<string, unknown>[] {
  let best: Record<string, unknown>[] = [];
  let bestCount = 0;
  let bestRatio = 0;

  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || node === null || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      const objects = node.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item)
      );
      if (objects.length > 0) {
        const withHandle = objects.filter((item) => findHandle(item) !== null).length;
        const ratio = withHandle / objects.length;
        if (withHandle > 0 && (withHandle > bestCount || (withHandle === bestCount && ratio > bestRatio))) {
          best = objects;
          bestCount = withHandle;
          bestRatio = ratio;
        }
      }
      for (const item of node) visit(item, depth + 1);
      return;
    }

    for (const value of Object.values(node as Record<string, unknown>)) visit(value, depth + 1);
  };

  visit(payload, 0);
  return best;
}

/** Maps one raw record to a SourcedCreator, or null when it has no handle. */
export function toCreator(
  record: Record<string, unknown>,
  fields?: TrybeConfig['fields'],
  options?: { strictSocials?: boolean }
): SourcedCreator | null {
  const handle = fields?.handlePath
    ? normalizeHandle(readPath(record, fields.handlePath) as string)
    : findHandle(record, 0, options?.strictSocials);
  if (!handle) return null;

  const followersRaw = fields?.followersPath ? readPath(record, fields.followersPath) : null;

  return {
    instagramHandle: handle,
    trybeCreatorId: fields?.idPath
      ? (readPath(record, fields.idPath) as string) ?? null
      : findId(record),
    fullName: fields?.namePath
      ? (readPath(record, fields.namePath) as string) ?? null
      : findName(record),
    followers:
      typeof followersRaw === 'number' ? Math.round(followersRaw) : findFollowers(record),
    raw: record,
  };
}

/**
 * Maps a whole page of records, deciding social-strictness across the set.
 *
 * One record can't tell you whether a missing `instagramUrl` means "no
 * Instagram" or "this API doesn't model socials". A page of them can: if any
 * record carries a social field, they all get judged strictly.
 */
export function toCreators(
  records: Record<string, unknown>[],
  fields?: TrybeConfig['fields']
): SourcedCreator[] {
  const strictSocials = records.some((record) => modelsSocialsExplicitly(record));
  return records
    .map((record) => toCreator(record, fields, { strictSocials }))
    .filter((creator): creator is SourcedCreator => creator !== null);
}

/** Builds the request for a given page, applying the configured paging mode. */
function requestForPage(config: TrybeConfig, pageIndex: number): RequestSpec {
  const { request, pagination } = config;
  if (pagination.mode === 'none' || pageIndex === 0) {
    // Page 0 is the request exactly as captured, which is already page `start`.
    if (pagination.mode === 'none' || pagination.start === undefined) return request;
  }

  const value = pagination.mode === 'offset'
    ? pagination.start + pageIndex * pagination.step
    : pagination.start + pageIndex;

  if (pagination.mode === 'body-json' && request.body) {
    const body = JSON.parse(request.body) as Record<string, unknown>;
    body[pagination.param] = value;
    return { ...request, body: JSON.stringify(body) };
  }

  const url = new URL(request.url);
  url.searchParams.set(pagination.param, String(value));
  return { ...request, url: url.toString() };
}

export type SourceResult = {
  creators: SourcedCreator[];
  pagesFetched: number;
  /** Set when paging stopped early, so the caller can report why. */
  stoppedBecause: 'max-pages' | 'empty-page' | 'no-new-records' | 'error';
  error?: string;
};

/**
 * Pages through Trybe's directory and returns every distinct creator found.
 *
 * Stops on the first page that yields nothing new, which handles both a true
 * end-of-results and the common API behaviour of clamping an out-of-range page
 * back to the last valid one — a loop that ignored that would happily fetch
 * page 40 twenty times.
 */
export async function sourceCreators(
  config: TrybeConfig,
  options: { onPage?: (page: number, found: number) => void; delayMs?: number } = {}
): Promise<SourceResult> {
  const seen = new Set<string>();
  const creators: SourcedCreator[] = [];
  const maxPages = config.pagination.mode === 'none' ? 1 : config.pagination.maxPages;
  const delayMs = options.delayMs ?? 1200;

  for (let page = 0; page < maxPages; page++) {
    const spec = requestForPage(config, page);

    let payload: unknown;
    try {
      const response = await fetch(spec.url, {
        method: spec.method,
        headers: spec.headers,
        body: spec.body,
      });

      if (response.status === 401 || response.status === 403) {
        return {
          creators,
          pagesFetched: page,
          stoppedBecause: 'error',
          error:
            `Trybe returned ${response.status} — the captured session has expired. ` +
            'Re-capture the request from DevTools and run the capture script again.',
        };
      }
      if (!response.ok) {
        return {
          creators,
          pagesFetched: page,
          stoppedBecause: 'error',
          error: `Trybe returned ${response.status} on page ${page + 1}.`,
        };
      }

      payload = await response.json();
    } catch (err) {
      return {
        creators,
        pagesFetched: page,
        stoppedBecause: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const records = config.fields?.recordsPath
      ? ((readPath(payload, config.fields.recordsPath) as Record<string, unknown>[]) ?? [])
      : discoverRecords(payload);

    if (records.length === 0) {
      options.onPage?.(page + 1, 0);
      return { creators, pagesFetched: page + 1, stoppedBecause: 'empty-page' };
    }

    let added = 0;
    for (const creator of toCreators(records, config.fields)) {
      if (seen.has(creator.instagramHandle)) continue;
      seen.add(creator.instagramHandle);
      creators.push(creator);
      added++;
    }

    options.onPage?.(page + 1, added);

    if (added === 0) {
      return { creators, pagesFetched: page + 1, stoppedBecause: 'no-new-records' };
    }

    // Pace the requests. This endpoint is meant to serve a person clicking
    // through a UI, and hammering it is both rude and the fastest way to get
    // the session flagged.
    if (page < maxPages - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { creators, pagesFetched: maxPages, stoppedBecause: 'max-pages' };
}
