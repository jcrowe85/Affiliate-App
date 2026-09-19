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
