/**
 * Which signups are creators from the Meta outreach, and which offer they were
 * promised.
 *
 * Deliberately free of any database import: the admin UI imports this to
 * pre-select the offer, and pulling Prisma into a client component would break
 * the bundle.
 */

/** Name fragment identifying the organic creator offer, when no id is configured. */
export const CREATOR_OFFER_NAME_HINT = 'organic creators';

/** Name fragment identifying the Trybe offer, when no id is configured. */
export const TRYBE_OFFER_NAME_HINT = '15% commission';

/**
 * True for anyone who arrived through the Meta creator campaign.
 *
 * The tag is set by ?source= on /apply — meta-dm, meta-email — so matching the
 * prefix covers every channel in that campaign without listing them here.
 */
export function isCreatorSource(source: string | null | undefined): boolean {
  if (!source) return false;
  return /^meta(?:[-_.]|$)/i.test(source.trim());
}

/**
 * True for anyone who arrived from Trybe.
 *
 * Same prefix shape as the Meta match, and anchored for the same reason: these
 * two channels were promised different commission, so a source that merely
 * starts with the right letters must not inherit the wrong offer.
 */
export function isTrybeSource(source: string | null | undefined): boolean {
  if (!source) return false;
  return /^trybe(?:[-_.]|$)/i.test(source.trim());
}

/** Which campaign an applicant arrived from, or null for an ordinary signup. */
export type CreatorChannel = 'meta' | 'trybe';

export function channelOfSource(source: string | null | undefined): CreatorChannel | null {
  if (isCreatorSource(source)) return 'meta';
  if (isTrybeSource(source)) return 'trybe';
  return null;
}

/**
 * How each channel's offer is found: an explicit id from env first, falling
 * back to a name match.
 *
 * The id is the one to set. The name hint exists so a fresh install works
 * before anyone configures anything, but a substring deciding what percentage
 * a creator earns is a thing to outgrow, not to rely on.
 */
export const CHANNEL_OFFER: Record<CreatorChannel, { envVar: string; nameHint: string }> = {
  meta: { envVar: 'CREATOR_OFFER_ID', nameHint: CREATOR_OFFER_NAME_HINT },
  trybe: { envVar: 'TRYBE_OFFER_ID', nameHint: TRYBE_OFFER_NAME_HINT },
};
