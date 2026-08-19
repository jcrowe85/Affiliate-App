# Creator outreach — seeding Trybe past the 12/day cap

Trybe limits invites to 12 a day. This pipeline sources the same creators from
Trybe's own filtered directory, finds their public contact email, and emails
them the join link directly — so invite volume is bounded by deliverability
rather than by Trybe's ceiling.

Three stages, with durable state between each. Any stage can be re-run or
interrupted without losing work or double-emailing anyone.

```
Trybe filters ──▶ CreatorLead ──▶ Instagram lookup ──▶ email ──▶ Trybe signup
   (stage 1)      status:sourced      (stage 2)       (stage 3)
                                   status:resolved   status:emailed
```

## Before you start — two things worth knowing

**Trybe's terms.** Sourcing from their directory and contacting creators
off-platform is very likely against their ToS. The exposure is your Trybe
account, not a legal one, but read their terms so it's a decision rather than a
surprise.

**Yield is the number that matters.** No Instagram API returns creator emails.
What we get is `public_email` — the address behind the contact button on
creator/business accounts — plus anything in the bio text. Expect roughly
**30–50% of handles to produce an address**. Plan sourcing volume as
`target sends ÷ 0.4`, and check the real figure the resolver prints after your
first run.

**The actor is not interchangeable.** Apify's own `instagram-profile-scraper`
returns **no email field at all** — verified against live profiles. Pointing
`APIFY_INSTAGRAM_ACTOR` at it silently drops this stage to bio-regex only and
roughly halves yield, with no error to tell you. The default
(`devil_port369-owner~instagram-email-phone-scraper-pay-per-result`) exposes
`public_email`. If you swap actors, check that a test run still returns
addresses.

## One-time setup

1. **Fill in the env vars.** See the "Creator outreach" block in `.env.example`.
   Already set from the shared Apify account: `APIFY_API_KEY`,
   `APIFY_INSTAGRAM_ACTOR`. (Either `APIFY_TOKEN` or `APIFY_API_KEY` works —
   the latter matches the other scrapers in this workspace.) Still needed:
   - `TRYBE_JOIN_URL` — the link the email sends creators to
   - `CREATOR_OUTREACH_FROM` — see the sending-domain note below
   - `CREATOR_OUTREACH_POSTAL_ADDRESS` — required by CAN-SPAM; sends are
     refused without it

2. **Set up a separate sending domain.** Add a subdomain such as
   `mail.yourdomain.com` in Resend, verify its DNS, and send outreach from
   there. Do not reuse the transactional domain: cold volume damages sender
   reputation, and when it does, it must not take affiliate payout
   notifications down with it.

3. **Apply the migration.** `npm run db:deploy`

4. **Warm the domain up.** Start at 20–30 sends/day for the first week and ramp
   toward your target. `CREATOR_OUTREACH_DAILY_CAP` enforces whatever you set;
   it is a rolling 24-hour window, not a calendar day.

## Stage 1 — capture Trybe's search request

Trybe has no public API, so we replay the request its own UI makes. Capture it
once:

1. Open Trybe's creator search and apply the filters you want.
2. Open DevTools → Network, filter to Fetch/XHR.
3. Click through to **page 2** of the results (this reveals the pagination
   parameter).
4. Find the request that returns the creator list as JSON. Right-click →
   **Copy → Copy as cURL**.
5. Paste it into a file and run:

```bash
npm run creators:capture -- /tmp/trybe.txt --label beauty-us-10k
```

The script parses the request, guesses the pagination parameter, and probes the
endpoint once — printing a handful of real creators if it worked. It writes
`.trybe/request.json` (gitignored, mode 600, contains your session cookie).

If the probe finds no handles, it saves `.trybe/sample-response.json`. Set
`fields.recordsPath` and `fields.handlePath` in `.trybe/request.json` and re-run
sourcing.

**The capture expires roughly hourly.** Trybe authenticates with a Supabase
JWT in the `authorization` header, issued with a 3600-second life — not a
long-lived cookie. Sourcing reports a 401 and keeps whatever it already
fetched, so a long run just stops early; re-copy the cURL and capture again to
continue. At `limit=100` and ~1.2s per page you can pull ~1,500 creators well
inside one token's life.

### What the Trybe endpoint looks like (captured 2026-08-18)

```
GET https://jointrybe.com/backend/api/discovery/brands/<brandId>/creators
    ?page=1&limit=100&sortSeed=<n>
```

- **`limit` is honoured up to at least 100**, though the UI only ever asks for
  12. Worth keeping — it is 8x fewer requests for the same creators.
- `pagination` in the response reports the real totals. The default discovery
  filter showed `total: 126728` across `totalPages: 1268`.
- Records live under `data`.
- **The handle must come from `creatorProfile.instagramUrl`, never the
  top-level `username`.** Those are Trybe's own platform handles and they
  disagreed with the real Instagram handle for **54 of 100** creators on a live
  sample. `.trybe/request.json` pins `handlePath` for this reason, and
  `toCreators()` now refuses to guess a handle from `username` on any payload
  that models socials as fields. Both paths are covered by
  `npm run creators:selftest`.
- About **19 of every 100** creators have no `instagramUrl` at all. They are
  skipped, not guessed at.
- No follower count is exposed here; it arrives in stage 2 from Instagram.

## Running the pipeline

```bash
npm run creators:source   -- --pages 20        # Trybe -> leads
npm run creators:resolve  -- --limit 200       # handles -> emails (costs money)
npm run creators:send     -- --dry-run         # check before sending
npm run creators:send     -- --limit 25        # send for real
```

Each script prints the pipeline state when it finishes.

### Scheduling

Sending is best run in small slices rather than one daily burst — 300 emails in
four minutes looks like a machine to every inbox provider that matters. A cron
entry every two hours:

```
0 */2 * * *  cd /path/to/app && npm run creators:send -- --limit 25
```

The rolling 24h cap holds regardless of how often this runs, so a missed slot
costs volume rather than causing a double-send.

## Sending a batch (the live view)

**Creator Outreach → Live sending** in the admin UI.

Sends are scattered across a working-day window — 09:00–17:00 Central,
weekdays, by default — with irregular gaps of roughly 15–45 minutes. Twenty
emails fired off in five minutes at 3am reads as a machine and lands under
everything that arrived overnight; this reads as a person working through a
list. A batch larger than the day's cap spills onto following days by itself.

That pacing is longer than any serverless request may run. So a batch is *planned* rather than *performed*: pressing Queue writes a
send time onto each lead, and a worker delivers whatever is due whenever it
runs. That split is what lets the page show a real countdown, survive a closed
tab or a deploy mid-batch, and be cancelled partway through.

The view shows sent messages with a filled bar and a timestamp, whatever is
in flight with a live bar, and everything still waiting with a spinner and the
time until it goes. Cancelling returns the unsent ones to the ready pool.

Two things drive the queue, and they are safe to run together — every lead is
claimed with a conditional update before any mail goes out, so overlapping
workers cannot send the same message twice:

- **Vercel Cron**, every minute, via `/api/cron/creator-outreach`
  (see `vercel.json`). Needs `CRON_SECRET` set in Vercel.
- **`npm run creators:worker`**, a local loop that ticks every 20 seconds. Use
  this if your Vercel plan does not allow minute-level cron (Hobby schedules
  run at most once a day), or to drive a batch from your machine.

## The admin UI

**Creator Outreach** in the admin sidebar. It exists for the two jobs a person
does better than the resolver:

- **Spot-checking bio-derived addresses.** Each email shows its provenance.
  `via business_email` is the creator's declared contact address and needs no
  review; `via bio` was pulled out of bio text and is the one worth a glance.
- **Filling in the misses.** Leads under "No email found" often have an address
  that is thirty seconds of looking away. Add it inline and the lead moves
  straight to "Ready to email".

It also runs small slices of each stage (look up 50, send 10) for when you want
to move a few without opening a terminal. Bulk work belongs in the CLI, where a
run isn't bounded by a request timeout.

## Compliance and deliverability

Built in, and not optional:

- Every email carries a plain-text alternative alongside the HTML.
- Every email carries `List-Unsubscribe` and `List-Unsubscribe-Post` headers,
  so Gmail and Outlook can honour an opt-out without the recipient reaching for
  "report spam" — which is the click that actually costs you a domain.
- `/api/creators/unsubscribe` opts out on POST only. GET shows a confirmation
  page, because corporate mail scanners follow every link in a message and
  would otherwise silently unsubscribe people who never read the email.
- Unsubscribes, bounces, and manual suppressions land in `CreatorSuppression`,
  which is re-checked immediately before each send.
- Existing affiliates are excluded automatically. Cold-pitching someone already
  signed up is the most likely way this embarrasses the brand.
- A missing postal address blocks sending outright rather than shipping a
  non-compliant email.

## Testing the logic

```bash
npm run creators:selftest
```

Covers bio extraction, cURL parsing, and creator-record discovery. Worth
running after touching any of them — its cases are regressions from real bugs:
two where the extractor invented plausible addresses belonging to nobody, and
one where creator records yielded Trybe's platform username instead of the
Instagram handle.

## Schema

- `CreatorLead` — one row per creator per shop, unique on `(shop, handle)`.
  Status: `sourced → resolved → emailed → replied → joined`, with
  `unresolvable` and `suppressed` as exits.
- `CreatorSuppression` — never-contact list, kept separate so an opt-out
  survives the lead being deleted or re-sourced.
- `CreatorOutreachEvent` — append-only audit of what went out and when. This is
  what you read when deliverability goes sideways.
