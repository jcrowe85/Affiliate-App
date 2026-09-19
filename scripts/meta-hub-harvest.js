/**
 * Harvests Instagram handles from Meta's Creator Marketing Hub.
 *
 * Not a Node script: paste it into the DevTools console on the hub page, then
 * scroll the whole list and call __fleur.csv().
 *
 *   __fleur.count()  how many so far
 *   __fleur.list()   the rows, for eyeballing
 *   __fleur.copy()   handles to the clipboard, one per line
 *   __fleur.csv()    downloads meta-hub-handles.csv
 *
 * Feed that file to scripts/creators-import-meta-hub.ts.
 *
 * Why the DOM and not the API: Meta's creator discovery endpoint is App Review
 * gated and returns mocked data under Standard Access, and the hub's internal
 * GraphQL call needs a fresh fb_dtsg/lsd pair captured by hand each time. The
 * rendered list is the one view that is reliably available to someone who can
 * already see it.
 *
 * Why it accumulates rather than reading once: the list is virtualized, so
 * cards are destroyed as they leave the viewport. A single querySelectorAll
 * returns only what is on screen — about fifteen rows.
 *
 * Why role/aria and not class names: Meta's classes (x1vvvo52, xuxw1ft, …) are
 * generated atomic CSS, shared across unrelated elements and regenerated
 * between deploys. `role="heading"` with `aria-level="3"` is the contract the
 * page keeps for accessibility, and it survives a restyle.
 */
(() => {
  const seen = new Map();
  const HANDLE = /^[a-z0-9._]{2,30}$/i;
  // The same role is used for section labels, and "Followers" passes the
  // handle test perfectly well. The importer blocks these again server-side.
  const NOT_A_HANDLE = new Set([
    'followers', 'following', 'posts', 'reels', 'creators', 'results',
    'filters', 'search', 'explore', 'home', 'saved', 'sponsored',
    'partnerships', 'audience', 'engagement', 'overview', 'all', 'none',
  ]);

  const sweep = () => {
    document.querySelectorAll('div[role="heading"][aria-level="3"]').forEach((h) => {
      const t = (h.textContent || '').trim();
      const key = t.toLowerCase();
      if (!t || !HANDLE.test(t) || NOT_A_HANDLE.has(key) || seen.has(key)) return;
      // Best-effort extras from the surrounding card. The handle is the only
      // part worth trusting; stage 2 fills name, followers and bio from
      // Instagram itself.
      const card = h.closest('[role="listitem"]') || h.parentElement?.parentElement;
      const bits = card
        ? [...new Set([...card.querySelectorAll('span,div')]
            .map((n) => n.textContent.trim())
            .filter((s) => s && s !== t && s.length < 40))].slice(0, 5)
        : [];
      seen.set(key, { handle: t, context: bits.join(' | ') });
    });
    console.log(`[fleur] ${seen.size} handles`);
  };

  // Debounced: Meta re-renders constantly, and an undebounced observer both
  // floods the console and makes the page crawl while you scroll.
  let timer;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(sweep, 300);
  };

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  addEventListener('scroll', schedule, { passive: true, capture: true });
  sweep();

  const quote = (v) => `"${String(v).replace(/"/g, '""')}"`;

  window.__fleur = {
    count: () => seen.size,
    list: () => [...seen.values()],
    copy: () => {
      copy([...seen.values()].map((r) => r.handle).join('\n'));
      return seen.size;
    },
    csv: () => {
      const rows = [['handle', 'context'], ...[...seen.values()].map((r) => [r.handle, r.context])];
      const blob = new Blob([rows.map((r) => r.map(quote).join(',')).join('\n')], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'meta-hub-handles.csv';
      a.click();
      return seen.size;
    },
  };

  console.log('[fleur] armed — scroll the list, then __fleur.copy() or __fleur.csv()');
})();
