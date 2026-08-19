/**
 * Local send worker — drains the scheduled queue on this machine.
 *
 * Run: npm run creators:worker
 *
 * Vercel Cron drives this in production, but cron granularity depends on the
 * plan (Hobby schedules run at most once a day). This gives you the same
 * behaviour from a terminal: it ticks every 20 seconds and sends whatever has
 * come due. Safe to run alongside the cron worker — leads are claimed
 * atomically, so the two can't send the same message.
 */

import './_load-env';
import { PrismaClient } from '@prisma/client';
import { sendDue, resolveShopId } from '../lib/creator-outreach/pipeline';

const prisma = new PrismaClient();
const TICK_MS = 20_000;

async function main() {
  const shopId = await resolveShopId();
  const once = process.argv.includes('--once');

  console.log(`Worker started for shop ${shopId}${once ? ' (single tick)' : ''}. Ctrl-C to stop.`);

  for (;;) {
    const result = await sendDue(shopId, { limit: 5 });
    if (result.sent || result.failed) {
      console.log(
        `${new Date().toLocaleTimeString()}  sent ${result.sent}` +
          `${result.failed ? `, failed ${result.failed}` : ''}, ${result.remaining} still queued`
      );
    }
    if (once || (result.remaining === 0 && result.sent === 0 && result.failed === 0 && once)) break;
    if (once) break;
    if (result.remaining === 0) {
      console.log(`${new Date().toLocaleTimeString()}  queue empty — waiting`);
    }
    await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
