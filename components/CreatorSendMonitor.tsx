'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Live view of a sending batch.
 *
 * Two clocks are at work. The schedule lives in the database, so the server is
 * the authority on what has actually gone out; but a countdown that only moved
 * when the server was polled would tick in visible jumps. So the list refreshes
 * every few seconds while the countdowns run locally at 1Hz, corrected by the
 * offset between the browser's clock and the server's.
 */

type LiveLead = {
  id: string;
  instagram_handle: string;
  full_name: string | null;
  email: string | null;
  status: string;
  scheduled_send_at: string | null;
  emailed_at: string | null;
  send_error: string | null;
};

type LivePayload = {
  batchId: string | null;
  leads: LiveLead[];
  sentToday: number;
  dailyCap: number;
  nextAt: string | null;
  serverNow: string;
  warmup: { active: boolean; day: number | null; cap: number; nextCap: number | null; nextAt: string | null; note: string };
};

const POLL_MS = 4000;

function countdown(ms: number): string {
  if (ms <= 0) return 'any moment';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Batches can now span days, so a bare clock time would be ambiguous. */
function whenLabel(iso: string): string {
  const at = new Date(iso);
  const today = new Date().toDateString() === at.toDateString();
  return today
    ? timeOfDay(iso)
    : at.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function CreatorSendMonitor({ onChanged }: { onChanged?: () => void }) {
  const [data, setData] = useState<LivePayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [count, setCount] = useState(25);
  // Local clock, ticked every second so countdowns move smoothly between polls.
  const [now, setNow] = useState(() => Date.now());
  // Browser clock minus server clock. Without it, a laptop a minute fast shows
  // every countdown stuck at "any moment".
  const skew = useRef(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/creator-leads/live');
      if (!response.ok) return;
      const payload: LivePayload = await response.json();
      skew.current = Date.now() - new Date(payload.serverNow).getTime();
      setData(payload);
    } catch {
      // A dropped poll is not worth surfacing; the next one is 4s away.
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
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

      if (action === 'schedule') {
        const s = result.summary;
        setMessage(
          s.scheduled === 0
            ? `Nothing scheduled — ${s.capRemaining} left under today's cap, and no leads ready.`
            : `Queued ${s.scheduled}, spread over ${s.window}. First ${whenLabel(s.firstAt)}, last ${whenLabel(s.lastAt)}.`
        );
      } else if (action === 'cancel-batch') {
        setMessage(`Cancelled ${result.cancelled} pending — they're back in the ready pool.`);
      }
      await load();
      onChanged?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const leads = data?.leads ?? [];
  const pending = leads.filter((l) => l.status === 'queued' || l.status === 'sending');
  const done = leads.filter((l) => l.status === 'emailed');
  const progress = leads.length > 0 ? (done.length / leads.length) * 100 : 0;
  const serverNow = now - skew.current;
  const capLeft = data ? Math.max(0, data.dailyCap - data.sentToday) : 0;

  return (
    <div className="space-y-4">
      {/* Batch header */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
        <div className="flex flex-wrap items-center gap-4 mb-3">
          <div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {done.length}
              <span className="text-gray-400 dark:text-gray-500 text-lg"> / {leads.length}</span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">sent in this run</div>
          </div>

          {pending.length > 0 && data?.nextAt && (
            <div>
              <div className="text-2xl font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
                {countdown(new Date(data.nextAt).getTime() - serverNow)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">until next send</div>
            </div>
          )}

          <div className="ml-auto text-right">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              {data?.sentToday ?? 0} / {data?.dailyCap ?? 0} in last 24h
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {capLeft} left under cap
              {data?.warmup?.active && data.warmup.day != null ? ` · warmup day ${data.warmup.day}` : ''}
            </div>
          </div>
        </div>

        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <input
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={() => act('schedule', { count })}
            disabled={busy !== null || capLeft === 0}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-40"
          >
            {busy === 'schedule' ? 'Queueing…' : `Queue ${count}`}
          </button>

          {pending.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => act('send-due')}
                disabled={busy !== null}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 disabled:opacity-40"
              >
                Send due now
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Cancel ${pending.length} pending sends? They go back in the ready pool.`)) {
                    act('cancel-batch', { batchId: data?.batchId });
                  }
                }}
                disabled={busy !== null || !data?.batchId}
                className="px-4 py-2 rounded-lg border border-red-300 dark:border-red-800 text-sm text-red-600 dark:text-red-400 disabled:opacity-40"
              >
                Cancel batch
              </button>
            </>
          )}

          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
            live · refreshes every {POLL_MS / 1000}s
          </span>
        </div>

        {/* The cap is not arbitrary — say why it is what it is, so nobody
            "fixes" it by typing a bigger number. */}
        {data?.warmup?.note && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{data.warmup.note}</p>
        )}

        {message && (
          <p className="mt-3 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            {message}
          </p>
        )}
      </div>

      {/* The queue */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
        {leads.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
            Nothing queued. Pick a number above and hit Queue to schedule a batch.
          </div>
        ) : (
          leads.map((lead) => {
            const dueIn = lead.scheduled_send_at
              ? new Date(lead.scheduled_send_at).getTime() - serverNow
              : 0;
            const isSent = lead.status === 'emailed';
            const isSending = lead.status === 'sending';

            return (
              <div key={lead.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-5 shrink-0">
                  {isSent ? (
                    <svg className="w-5 h-5 text-green-600 dark:text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span
                      className={`block w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-700 ${
                        isSending
                          ? 'border-t-indigo-600 dark:border-t-indigo-400 animate-spin'
                          : 'border-t-gray-500 dark:border-t-gray-400 animate-spin'
                      }`}
                      aria-hidden
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      @{lead.instagram_handle}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{lead.email}</span>
                  </div>

                  {/* Per-row bar: full and green once sent, indeterminate while
                      sending, and a thin track for anything still waiting. */}
                  <div className="mt-1.5 h-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    {isSent ? (
                      <div className="h-full w-full bg-green-500 dark:bg-green-600" />
                    ) : isSending ? (
                      <div className="h-full w-1/3 bg-indigo-500 animate-pulse" />
                    ) : null}
                  </div>

                  {lead.send_error && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{lead.send_error}</p>
                  )}
                </div>

                <div className="shrink-0 text-right w-28">
                  {isSent ? (
                    <span className="text-xs text-green-700 dark:text-green-500">
                      sent {lead.emailed_at ? whenLabel(lead.emailed_at) : ''}
                    </span>
                  ) : isSending ? (
                    <span className="text-xs text-indigo-600 dark:text-indigo-400">sending…</span>
                  ) : (
                    <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                      {lead.scheduled_send_at ? whenLabel(lead.scheduled_send_at) : ''}
                      <span className="block text-[10px] text-gray-400 dark:text-gray-500">
                        in {countdown(dueIn)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
