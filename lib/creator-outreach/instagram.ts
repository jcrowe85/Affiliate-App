/**
 * Stage 2 — turning an Instagram handle into a contact email.
 *
 * This goes through a hosted profile scraper (Apify by default) rather than a
 * browser we drive ourselves. The trade is deliberate: a few dollars per
 * thousand profiles buys us out of proxy management, selector rot, and — the
 * part that actually matters — any risk to our own Instagram account.
 *
 * Actor choice is not interchangeable. Apify's own instagram-profile-scraper
 * returns no email field whatsoever — verified against live profiles — so it
 * would silently reduce this stage to bio-regex only. The default below is a
 * contact-scraper that exposes `public_email`, the address creator and business
 * accounts publish behind Instagram's contact button.
 *
 * Between that field and the bio text (see email-extract.ts), expect roughly a
 * third to a half of handles to yield an address. Plan send volume off that,
 * not off the sourced count.
 */

import { chooseContactEmail, type ResolvedEmail } from './email-extract';

const APIFY_BASE = 'https://api.apify.com/v2';

/**
 * The Apify credential, under either name.
 *
 * APIFY_TOKEN is what Apify's own docs call it; APIFY_API_KEY is the name the
 * other scraping projects in this workspace already use. Accepting both means
 * one token, one place to rotate it, rather than the same secret copied into
 * two variables that drift apart.
 */
export function apifyToken(): string | null {
  return process.env.APIFY_TOKEN?.trim() || process.env.APIFY_API_KEY?.trim() || null;
}

/** Overridable so a different actor can be swapped in without a code change. */
function actorId(): string {
  return (
    process.env.APIFY_INSTAGRAM_ACTOR ||
    'devil_port369-owner~instagram-email-phone-scraper-pay-per-result'
  );
}

export type InstagramProfile = {
  handle: string;
  fullName: string | null;
  bio: string | null;
  followers: number | null;
  isBusiness: boolean | null;
  profileUrl: string;
  contact: ResolvedEmail | null;
};

export type ResolveOutcome =
  | { ok: true; profile: InstagramProfile }
  | { ok: false; handle: string; reason: string };

/**
 * Reads the first present key from a list of candidates.
 *
 * Scraper actors rename fields between versions far more often than they stop
 * returning the data, so every read here is tolerant of several spellings.
 * A rename should cost us a missing email, not a crashed run.
 */
function pick<T>(record: Record<string, unknown>, keys: string[], guard: (v: unknown) => v is T): T | null {
  for (const key of keys) {
    const value = record[key];
    if (guard(value)) return value;
  }
  return null;
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

/**
 * Declared-email fields, best first.
 *
 * Contact scrapers report these inconsistently — sometimes a bare string,
 * sometimes an array, sometimes an empty string standing in for "none". This
 * flattens all of it to the first address that survives validation.
 */
const DECLARED_EMAIL_KEYS = [
  'public_email', 'publicEmail', 'businessEmail', 'business_email',
  'SafeEmails', 'VerifiedEmails', 'ExtractedEmails',
  'email', 'contactEmail', 'emails',
];

function declaredEmail(item: Record<string, unknown>): string | null {
  for (const key of DECLARED_EMAIL_KEYS) {
    const value = item[key];
    if (isString(value)) return value;
    if (Array.isArray(value)) {
      const first = value.find((entry): entry is string => isString(entry));
      if (first) return first;
    }
  }
  return null;
}

function toProfile(item: Record<string, unknown>): InstagramProfile | null {
  const handle = pick(item, ['username', 'userName', 'handle', 'ownerUsername'], isString);
  if (!handle) return null;

  const bio = pick(item, ['biography', 'bio', 'description'], isString);

  return {
    handle: handle.toLowerCase(),
    fullName: pick(item, ['fullName', 'full_name', 'name'], isString),
    bio,
    followers: pick(
      item,
      ['followersCount', 'follower_count', 'followers_count', 'followers', 'edge_followed_by'],
      isNumber
    ),
    isBusiness: pick(
      item,
      ['isBusinessAccount', 'is_business_account', 'is_business', 'isBusiness'],
      isBoolean
    ),
    profileUrl: `https://www.instagram.com/${handle.toLowerCase()}/`,
    contact: chooseContactEmail({ businessEmail: declaredEmail(item), bio }),
  };
}

/**
 * Resolves a batch of handles in one actor run.
 *
 * Batching matters for cost as well as speed — each run has fixed overhead, so
 * fifty handles in one run is materially cheaper than fifty runs of one.
 */
export async function resolveProfiles(
  handles: string[],
  options: { timeoutSeconds?: number } = {}
): Promise<ResolveOutcome[]> {
  const token = apifyToken();
  if (!token) {
    return handles.map((handle) => ({
      ok: false as const,
      handle,
      reason: 'No Apify credential set (APIFY_TOKEN or APIFY_API_KEY)',
    }));
  }
  if (handles.length === 0) return [];

  const timeout = options.timeoutSeconds ?? 240;
  const url =
    `${APIFY_BASE}/acts/${actorId()}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(token)}&timeout=${timeout}`;

  let items: Record<string, unknown>[];
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Actors disagree on how the target list is named: the contact scrapers
      // take profile URLs as `instagram_ids`, Apify's own profile scraper takes
      // bare handles as `usernames`. Sending both means swapping the actor via
      // APIFY_INSTAGRAM_ACTOR needs no code change — unknown input keys are
      // ignored rather than rejected.
      body: JSON.stringify({
        instagram_ids: handles.map((handle) => `https://www.instagram.com/${handle}/`),
        usernames: handles,
        verify_email: false,
        resultsType: 'details',
        resultsLimit: 1,
      }),
      // The actor run itself is bounded by `timeout`; give the HTTP call a
      // little more rope so a run that finishes at the buzzer still returns.
      signal: AbortSignal.timeout((timeout + 30) * 1000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const reason = `Apify returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`;
      return handles.map((handle) => ({ ok: false as const, handle, reason }));
    }

    const payload = await response.json();
    items = Array.isArray(payload) ? payload : [];
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return handles.map((handle) => ({ ok: false as const, handle, reason }));
  }

  // Index what came back by handle so we can tell "private/not found" (absent
  // from the results) apart from "found but has no email".
  const byHandle = new Map<string, InstagramProfile>();
  const errorsByHandle = new Map<string, string>();

  for (const item of items) {
    const profile = toProfile(item);
    if (profile) {
      byHandle.set(profile.handle, profile);
      continue;
    }
    const failed = pick(item, ['username', 'userName', 'handle'], isString);
    const error = pick(item, ['error', 'errorDescription', 'message'], isString);
    if (failed) errorsByHandle.set(failed.toLowerCase(), error || 'scraper returned no profile');
  }

  return handles.map((handle) => {
    const key = handle.toLowerCase();
    const profile = byHandle.get(key);
    if (profile) return { ok: true as const, profile };
    return {
      ok: false as const,
      handle: key,
      reason: errorsByHandle.get(key) || 'profile not returned (private, renamed, or deleted)',
    };
  });
}

/** Splits work into runs of `size`, since one run per handle wastes overhead. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
