/**
 * Pulling a contact address out of an Instagram profile.
 *
 * Two sources, in order of trust:
 *
 *   1. The public contact-email field that creator/business accounts expose.
 *      Deliberate, machine-readable, and the creator chose to publish it.
 *   2. The bio text, where a large share of creators just type the address —
 *      often obfuscated ("hi (at) brand (dot) com") to dodge exactly this kind
 *      of scraping. We de-obfuscate because the intent is still "contact me
 *      here"; a human reading the bio would do the same.
 *
 * Everything here is pure and text-only so it can be reasoned about (and
 * tested) without touching the network.
 */

/** A plain, unobfuscated address. Kept deliberately conservative. */
const PLAIN_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;

/**
 * File extensions that show up in bio-adjacent text and parse as valid TLDs.
 * Without this, "logo@2x.png" and "reel.mp4" become contact addresses.
 */
const NON_TLD = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'mov', 'heic', 'zip',
  'js', 'ts', 'css', 'html', 'json', 'exe', 'dmg', 'pkg',
]);

/**
 * Addresses that are never a person. Instagram bios are full of these as
 * example text, and placeholder domains poison a send list fast.
 *
 * Note what is NOT here: info@, hello@, contact@, mgmt@, bookings@. Those are
 * exactly the addresses creators publish for partnership enquiries, so
 * filtering "role accounts" the way a B2B tool would throws away the best
 * leads we have.
 */
const BLOCKED_DOMAINS = new Set([
  'example.com', 'example.org', 'email.com', 'domain.com', 'yourdomain.com',
  'sentry.io', 'wixpress.com', 'instagram.com', 'facebook.com',
]);

/**
 * True when a local part looks like a handle rather than an English word.
 *
 * Used to decide whether a bare "at" is a separator or just the preposition.
 * "jane.doe", "janedoe123" and "jane_doe" are names; "shop", "me" and
 * "available" are sentences.
 */
function looksLikeLocalPart(local: string): boolean {
  return /[._%+\-]/.test(local) || /\d/.test(local);
}

/**
 * Replaces the last occurrence of a pattern, keeping everything else intact.
 *
 * Right-to-left matters: "email me at jane at gmail dot com" contains two
 * "at"s and only the last is the separator. Replacing the first produces
 * "me@jane" — a plausible-looking address belonging to nobody, which is a
 * worse outcome than finding nothing at all.
 */
function replaceLast(
  text: string,
  pattern: RegExp,
  accept: (match: RegExpExecArray) => boolean,
  build: (match: RegExpExecArray) => string
): string {
  let last: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  const scanner = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  while ((match = scanner.exec(text)) !== null) {
    if (accept(match)) last = match;
    // Zero-length matches would spin forever; the patterns here can't produce
    // one, but the guard costs nothing.
    if (match.index === scanner.lastIndex) scanner.lastIndex++;
  }
  if (!last) return text;
  return text.slice(0, last.index) + build(last) + text.slice(last.index + last[0].length);
}

/**
 * Rewrites the common ways creators break up an address so it survives a naive
 * scraper but stays readable to a person.
 *
 * Bracketed markers — "(at)", "[dot]" — say "this is an address" unambiguously
 * and are replaced wherever they appear. Bare English words do not, and the
 * rules for them are deliberately strict, because the failure mode is not a
 * missed lead but a confidently wrong address that gets a real email sent to
 * it:
 *
 *   "janedoe at gmail dot com"   -> accepted; a spelled-out "dot" is only ever
 *                                   written by someone hiding an address.
 *   "jane.doe at gmail.com"      -> accepted; the local part is handle-shaped.
 *   "shop at fleur.com for 20%"  -> rejected; "shop" is a verb, not a mailbox.
 */
function deobfuscate(text: string): string {
  let out = text
    // Unicode lookalikes first — the fullwidth @ is common in bios.
    .replace(/[＠﹫]/g, '@')
    .replace(/[．。]/g, '.')
    // Bracketed markers: unambiguous, so replace them all.
    .replace(/\s*[\(\[\{<]\s*(?:at|@)\s*[\)\]\}>]\s*/gi, '@')
    .replace(/\s*-\s*at\s*-\s*/gi, '@')
    .replace(/\s*[\(\[\{<]\s*(?:dot|punkt)\s*[\)\]\}>]\s*/gi, '.')
    .replace(/\s*-\s*dot\s*-\s*/gi, '.');

  // Bare "at" followed by a domain whose dot is also spelled out. Run before
  // dot expansion, while that signal is still visible.
  const spelledOut = /([a-z0-9._%+-]{2,64})\s+at\s+(?=[a-z0-9-]+\s+(?:dot|punkt)\s+[a-z]{2,24})/gi;
  const afterSpelled = replaceLast(out, spelledOut, () => true, (m) => `${m[1]}@`);

  // Only if that found nothing: bare "at" before a literal domain, which needs
  // a handle-shaped local part to be believable.
  out =
    afterSpelled !== out
      ? afterSpelled
      : replaceLast(
          out,
          /([a-z0-9._%+-]{2,64})\s+at\s+(?=[a-z0-9-]+\.[a-z]{2,24}\b)/gi,
          (m) => looksLikeLocalPart(m[1]),
          (m) => `${m[1]}@`
        );

  // Bare "dot" between two word characters, applied last. Safe globally: with
  // no "@" nearby it only ever joins two words into a harmless token.
  return out.replace(/([a-z0-9])\s+(?:dot|punkt)\s+([a-z0-9])/gi, '$1.$2');
}

/** Strips punctuation that commonly abuts an address in prose. */
function trimEdges(candidate: string): string {
  return candidate.replace(/^[^A-Z0-9]+/i, '').replace(/[^A-Z0-9]+$/i, '');
}

/**
 * True if this looks like a real, mailable address rather than a filename,
 * a placeholder, or a fragment of a URL.
 */
export function isPlausibleEmail(value: string): boolean {
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return false;

  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;

  if (!local || local.length > 64) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;

  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return false;
  if (domain.includes('..') || domain.startsWith('-')) return false;
  if (BLOCKED_DOMAINS.has(domain)) return false;

  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (tld.length < 2 || tld.length > 24) return false;
  if (NON_TLD.has(tld)) return false;
  // A TLD is never numeric; "@2x.png"-style artefacts land here.
  if (/^\d+$/.test(tld)) return false;

  return true;
}

/** Normalised form used for storage, dedupe, and suppression lookups. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Every plausible address in a block of text, de-duplicated, in the order the
 * creator wrote them. Order matters: when a bio lists a personal address and a
 * management address, the first one is the one they lead with.
 */
export function extractEmailsFromText(text: string | null | undefined): string[] {
  if (!text) return [];

  const found: string[] = [];
  const seen = new Set<string>();

  // Run over the raw text first so unobfuscated addresses keep their exact
  // spelling, then over the de-obfuscated copy to catch the rest.
  for (const source of [text, deobfuscate(text)]) {
    const matches = source.match(PLAIN_EMAIL) || [];
    for (const raw of matches) {
      const email = normalizeEmail(trimEdges(raw));
      if (!isPlausibleEmail(email) || seen.has(email)) continue;
      seen.add(email);
      found.push(email);
    }
  }

  return found;
}

export type ResolvedEmail = {
  email: string;
  /** Where it came from, for the admin review queue. */
  source: 'business_email' | 'bio';
};

/**
 * Picks the address to actually write on a lead.
 *
 * The declared contact field wins outright when it is present and valid — it
 * is the creator's stated business address. Bio matches are the fallback and
 * are flagged as such, because they are the ones that occasionally pick up a
 * collaborator's address instead of the creator's own.
 */
export function chooseContactEmail(profile: {
  businessEmail?: string | null;
  bio?: string | null;
}): ResolvedEmail | null {
  const declared = profile.businessEmail ? normalizeEmail(profile.businessEmail) : '';
  if (declared && isPlausibleEmail(declared)) {
    return { email: declared, source: 'business_email' };
  }

  const fromBio = extractEmailsFromText(profile.bio);
  if (fromBio.length > 0) {
    return { email: fromBio[0], source: 'bio' };
  }

  return null;
}
