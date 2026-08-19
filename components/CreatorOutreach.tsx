'use client';

import { useCallback, useEffect, useState } from 'react';
import CreatorSendMonitor from '@/components/CreatorSendMonitor';

/**
 * Review queue for the creator-outreach pipeline.
 *
 * The queue exists because stage 2 is imperfect by nature: bio-scraped
 * addresses are usually right and occasionally a collaborator's, and a handle
 * with no public email is often findable in thirty seconds by a person. So the
 * UI is built around the two jobs a human is actually better at — spot-checking
 * a bio-derived address before it is used, and filling in the misses.
 */

interface Lead {
  id: string;
  instagram_handle: string;
  full_name: string | null;
  followers: number | null;
  bio: string | null;
  email: string | null;
  email_source: string | null;
  status: string;
  source_filter: string | null;
  sourced_at: string;
  emailed_at: string | null;
  replied_at: string | null;
  joined_at: string | null;
  resolve_error: string | null;
  profile_url: string | null;
}

interface Payload {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
  sentToday: number;
  dailyCap: number;
  config: { apifyReady: boolean; sendingReady: boolean };
}

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'resolved', label: 'Ready to email' },
  { key: 'sourced', label: 'Awaiting lookup' },
  { key: 'unresolvable', label: 'No email found' },
  { key: 'emailed', label: 'Emailed' },
  { key: 'replied', label: 'Replied' },
  { key: 'joined', label: 'Joined' },
  { key: 'suppressed', label: 'Suppressed' },
  { key: 'all', label: 'All' },
];

const STATUS_STYLE: Record<string, string> = {
  sourced: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  unresolvable: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  emailed: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  replied: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  joined: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  suppressed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  bounced: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

function formatFollowers(count: number | null): string {
  if (count == null) return '—';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export default function CreatorOutreach() {
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState('resolved');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  // 'leads' is the review queue; 'sending' is the live batch view. Separate
  // views rather than one long page: reviewing addresses and watching a send
  // go out are different jobs, done at different times.
  const [view, setView] = useState<'leads' | 'sending'>('leads');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status, page: String(page), pageSize: '50' });
      if (query.trim()) params.set('q', query.trim());
      const response = await fetch(`/api/admin/creator-leads?${params}`);
      if (!response.ok) throw new Error('Failed to load leads');
      setData(await response.json());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [status, page, query]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to page 1 whenever the filter changes, so a filter with fewer pages
  // than the current one doesn't land on an empty view.
  useEffect(() => {
    setPage(1);
  }, [status, query]);

  const runAction = async (action: 'resolve' | 'send', extra: Record<string, unknown> = {}) => {
    setBusy(action);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/creator-leads/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Action failed');

      if (action === 'resolve') {
        const s = result.summary;
        setMessage(
          `Looked up ${s.attempted} profiles — ${s.withEmail} with an email, ${s.withoutEmail} without, ${s.failed} failed.`
        );
      } else {
        const s = result.summary;
        setMessage(
          `${extra.dryRun ? 'Dry run: would send' : 'Sent'} ${s.sent}` +
            `${s.failed ? `, ${s.failed} failed` : ''}${s.skipped ? `, ${s.skipped} skipped` : ''}.`
        );
      }
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const patchLead = async (id: string, body: Record<string, unknown>) => {
    setBusy(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/creator-leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Update failed');
      setEditing(null);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(null);
    }
  };

  const counts = data?.counts ?? {};
  const capLeft = data ? Math.max(0, data.dailyCap - data.sentToday) : 0;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      {/* View switcher */}
      <div className="flex items-center gap-2">
        {([
          ['leads', 'Leads'],
          ['sending', 'Live sending'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              view === key
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
            }`}
          >
            {label}
            {key === 'sending' && (counts.queued ?? 0) > 0 ? ` (${counts.queued})` : ''}
          </button>
        ))}
      </div>

      {view === 'sending' && <CreatorSendMonitor onChanged={load} />}

      {view === 'leads' && (
      <>
      {/* Pipeline summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'Sourced', value: counts.sourced ?? 0 },
          { label: 'Ready to email', value: counts.resolved ?? 0 },
          { label: 'Queued', value: counts.queued ?? 0 },
          { label: 'Emailed', value: counts.emailed ?? 0 },
          { label: 'Replied', value: counts.replied ?? 0 },
          { label: 'Joined', value: counts.joined ?? 0 },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4"
          >
            <div className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => runAction('resolve')}
            disabled={busy !== null || !data?.config.apifyReady}
            className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium disabled:opacity-40"
          >
            {busy === 'resolve' ? 'Looking up…' : 'Look up 50 profiles'}
          </button>

          <button
            type="button"
            onClick={() => runAction('send', { limit: 10, dryRun: true })}
            disabled={busy !== null}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 disabled:opacity-40"
          >
            Dry run 10
          </button>

          <button
            type="button"
            onClick={() => setView('sending')}
            disabled={!data?.config.sendingReady || (counts.resolved ?? 0) === 0}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-40"
          >
            Queue a batch →
          </button>

          <div className="text-sm text-gray-500 dark:text-gray-400 ml-auto">
            {data ? `${data.sentToday}/${data.dailyCap} sent in the last 24h` : ''}
          </div>
        </div>

        {/* Configuration gaps are worth showing up front — every one of them is
            an action that would otherwise fail with a generic error. */}
        {data && !data.config.apifyReady && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            APIFY_TOKEN isn&apos;t set, so profile lookup is disabled.
          </p>
        )}
        {data && !data.config.sendingReady && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Sending is disabled until CREATOR_OUTREACH_FROM, CREATOR_OUTREACH_POSTAL_ADDRESS and TRYBE_JOIN_URL are set.
          </p>
        )}
        {message && (
          <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            {message}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatus(tab.key)}
              className={`px-3 py-1.5 rounded-full text-sm ${
                status === tab.key
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
              }`}
            >
              {tab.label}
              {counts[tab.key] != null && tab.key !== 'all' ? ` (${counts[tab.key]})` : ''}
            </button>
          ))}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search handle, name, or email"
            className="ml-auto px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm min-w-[220px]"
          />
        </div>
      </div>

      {/* Leads */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading…</div>
        ) : !data || data.leads.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            Nothing here yet. Source creators with{' '}
            <code className="text-xs">npx tsx scripts/creators-source.ts</code>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800/60">
                <tr>
                  {['Creator', 'Followers', 'Email', 'Status', 'Sourced', ''].map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.leads.map((lead) => (
                  <tr key={lead.id} className="align-top">
                    <td className="px-4 py-3">
                      <a
                        href={lead.profile_url || `https://www.instagram.com/${lead.instagram_handle}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-indigo-600 dark:text-indigo-400"
                      >
                        @{lead.instagram_handle}
                      </a>
                      {lead.full_name && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">{lead.full_name}</div>
                      )}
                      {lead.source_filter && (
                        <div className="text-xs text-gray-400 dark:text-gray-500">{lead.source_filter}</div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {formatFollowers(lead.followers)}
                    </td>

                    <td className="px-4 py-3 text-sm">
                      {editing?.id === lead.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="email"
                            autoFocus
                            value={editing.value}
                            onChange={(e) => setEditing({ id: lead.id, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') patchLead(lead.id, { action: 'set-email', email: editing.value });
                              if (e.key === 'Escape') setEditing(null);
                            }}
                            className="px-2 py-1 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded text-sm"
                            placeholder="name@domain.com"
                          />
                          <button
                            type="button"
                            onClick={() => patchLead(lead.id, { action: 'set-email', email: editing.value })}
                            disabled={busy === lead.id}
                            className="text-xs text-indigo-600 dark:text-indigo-400"
                          >
                            Save
                          </button>
                        </div>
                      ) : lead.email ? (
                        <>
                          <div className="text-gray-900 dark:text-gray-100">{lead.email}</div>
                          {/* Provenance is the point: a 'bio' address is the one
                              worth a glance before it gets a pitch. */}
                          <button
                            type="button"
                            onClick={() => setEditing({ id: lead.id, value: lead.email || '' })}
                            className="text-xs text-gray-400 dark:text-gray-500 hover:underline"
                          >
                            via {lead.email_source} · edit
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditing({ id: lead.id, value: '' })}
                          className="text-xs text-indigo-600 dark:text-indigo-400"
                        >
                          + add email
                        </button>
                      )}
                      {lead.resolve_error && (
                        <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 max-w-[260px]">
                          {lead.resolve_error}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_STYLE[lead.status] || STATUS_STYLE.sourced
                        }`}
                      >
                        {lead.status}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {new Date(lead.sourced_at).toLocaleDateString()}
                      {lead.emailed_at && (
                        <div>emailed {new Date(lead.emailed_at).toLocaleDateString()}</div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {lead.status === 'emailed' && (
                        <>
                          <button
                            type="button"
                            onClick={() => patchLead(lead.id, { action: 'mark', state: 'replied' })}
                            disabled={busy === lead.id}
                            className="text-xs text-sky-600 dark:text-sky-400 mr-3"
                          >
                            Replied
                          </button>
                          <button
                            type="button"
                            onClick={() => patchLead(lead.id, { action: 'mark', state: 'joined' })}
                            disabled={busy === lead.id}
                            className="text-xs text-green-600 dark:text-green-400 mr-3"
                          >
                            Joined
                          </button>
                        </>
                      )}
                      {lead.status !== 'suppressed' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Never contact @${lead.instagram_handle}?`)) {
                              patchLead(lead.id, { action: 'suppress', reason: 'manual' });
                            }
                          }}
                          disabled={busy === lead.id}
                          className="text-xs text-red-600 dark:text-red-400"
                        >
                          Suppress
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>
            Page {data.page} of {totalPages} · {data.total} leads
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={data.page <= 1}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={data.page >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
