-- VisitorSession.start_time/end_time are bigint in the database but DateTime in
-- schema.prisma. Prisma has been sending timestamps into bigint columns since
-- migration 20260210021601 (2026-02-10), and the binary wire encoding of a
-- Postgres timestamp is an int64 of microseconds since 2000-01-01 — so the raw
-- encoding landed in the column verbatim. Rows written before that date hold
-- JS Date.now() epoch milliseconds instead.
--
-- Both formats decode to real timestamps, so this converts rather than discards.
-- `prisma db push` would instead DROP and re-ADD these columns, silently
-- resetting every start_time to the migration time and nulling every end_time.
--
-- Format is distinguished by magnitude, not digit count: epoch-ms values are
-- ~1.7e12 and microseconds-since-2000 are ~8.4e14, so 1e14 separates them with
-- roughly two orders of magnitude of headroom on either side.

ALTER TABLE "VisitorSession"
  ALTER COLUMN "start_time" TYPE TIMESTAMP(3) USING (
    CASE
      WHEN "start_time" < 100000000000000
        THEN (to_timestamp("start_time" / 1000.0) AT TIME ZONE 'UTC')
      ELSE TIMESTAMP '2000-01-01' + ("start_time"::text || ' microseconds')::interval
    END
  ),
  ALTER COLUMN "start_time" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "VisitorSession"
  ALTER COLUMN "end_time" TYPE TIMESTAMP(3) USING (
    CASE
      WHEN "end_time" IS NULL THEN NULL
      WHEN "end_time" < 100000000000000
        THEN (to_timestamp("end_time" / 1000.0) AT TIME ZONE 'UTC')
      ELSE TIMESTAMP '2000-01-01' + ("end_time"::text || ' microseconds')::interval
    END
  );
