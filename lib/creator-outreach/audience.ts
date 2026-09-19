/**
 * Which outreach audience a creator lead belongs to.
 *
 * Two audiences exist because they were promised different things. Trybe leads
 * were offered free product plus 15% of what their video earns once we run it
 * as an ad. The creators harvested from Meta's Creator Marketing Hub are
 * offered 40% commission on first orders through their own discount code — no
 * seeding, no ad spend, nothing to wait for. Sending either group the other's
 * email is not an untidy mailing, it is a false promise, so the split is
 * enforced where batches are *picked* rather than left to whoever runs the
 * script or writes the next cron entry.
 *
 * Derived from `source_filter` rather than stored in its own column: there is
 * exactly one rule, every row already on file satisfies it, and a column would
 * need a migration and a backfill to say the same thing less reliably.
 *
 * Kin to isCreatorSource() in lib/creator-offer.ts, deliberately not shared
 * with it: that one reads the `?source=` tag an applicant arrives with and
 * decides which commission offer they get. This one reads the filter that
 * sourced a lead and decides which email they receive. Same shape today,
 * different questions, different blast radius if either changes.
 */

export type Audience = 'organic' | 'paid';

/** Audiences plus the "don't filter" case the admin UI needs. */
export type AudienceFilter = Audience | 'both';

/**
 * Matches the Meta sources exactly as isCreatorSource does — `meta`, or `meta`
 * followed by a separator. Anchored so a future `metabolism-blog` filter can't
 * quietly inherit the 40% email by looking similar.
 */
const ORGANIC = /^meta(?:[-_.]|$)/i;

export function audienceOf(sourceFilter: string | null | undefined): Audience {
  return sourceFilter && ORGANIC.test(sourceFilter.trim()) ? 'organic' : 'paid';
}

export function isAudience(value: unknown): value is Audience {
  return value === 'organic' || value === 'paid';
}

export function isAudienceFilter(value: unknown): value is AudienceFilter {
  return isAudience(value) || value === 'both';
}

/**
 * A Prisma `where` fragment selecting one audience.
 *
 * The organic arm spells out the separators instead of a bare `startsWith:
 * 'meta'` for the same reason the regex is anchored. The paid arm has to name
 * NULL explicitly: in SQL, `NOT (source_filter LIKE 'meta%')` is NULL — and so
 * excluded — for a row whose filter was never set, which would silently drop
 * hand-created leads out of every paid batch.
 */
export function audienceWhere(audience?: AudienceFilter | null): Record<string, unknown> {
  const organic = [
    { source_filter: 'meta' },
    { source_filter: { startsWith: 'meta-' } },
    { source_filter: { startsWith: 'meta_' } },
    { source_filter: { startsWith: 'meta.' } },
  ];

  if (audience === 'organic') return { OR: organic };
  if (audience === 'paid') return { NOT: { OR: organic } };
  return {};
}

/** Human label for the tag shown on a lead row. */
export function audienceLabel(audience: Audience): string {
  return audience === 'organic' ? 'Organic' : 'Paid';
}
