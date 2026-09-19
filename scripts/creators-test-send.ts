/**
 * Sends one organic-audience outreach email to an address you name, to prove
 * the pipeline before 249 creators receive it.
 *
 * Run: npx tsx scripts/creators-test-send.ts josh@tryfleur.com [--dry]
 *
 * Deliberately bypasses sendBatch and sendDue. Those pick their own recipients
 * out of the ready pool, and a test that chooses its own recipient is not a
 * test of anything you can aim — the first real run would be the first time
 * the copy was ever seen. This takes the address on the command line, renders
 * the exact copy the organic batch will use, and sends that one message.
 *
 * Consequences worth stating: it never consumes warmup cap, it cannot pull a
 * real creator into the send, and the test lead it upserts is tagged
 * `meta-test` so it classifies as organic everywhere the audience filter looks.
 */
import './_load-env';
import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  ORGANIC_VARIANTS,
  joinUrlFor,
  sendOutreach,
  unsubscribeUrl,
} from '../lib/creator-outreach/outreach-email';

const prisma = new PrismaClient();
const HANDLE = 'josh_test_organic';

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => a.includes('@'));
  const dry = args.includes('--dry');

  if (!email) {
    console.error('usage: npx tsx scripts/creators-test-send.ts <email> [--dry]');
    process.exit(1);
  }

  const shopId =
    process.env.SHOPIFY_SHOP_ID?.trim() ||
    (await prisma.adminUser.findFirst({ select: { shopify_shop_id: true } }))?.shopify_shop_id;
  if (!shopId) throw new Error('No shop on record — cannot determine shopify_shop_id.');

  const joinUrl = joinUrlFor('organic');
  if (!joinUrl) {
    throw new Error('META_JOIN_URL is not set — the email would go out without a join link.');
  }

  const copy = ORGANIC_VARIANTS.META_A(joinUrl);

  const lead = await prisma.creatorLead.upsert({
    where: {
      shopify_shop_id_instagram_handle: { shopify_shop_id: shopId, instagram_handle: HANDLE },
    },
    create: {
      shopify_shop_id: shopId,
      instagram_handle: HANDLE,
      full_name: 'Josh',
      email,
      email_source: 'manual',
      source_filter: 'meta-test',
      status: 'resolved',
      unsubscribe_token: randomBytes(24).toString('base64url'),
    },
    // Re-runnable: clearing emailed_at is what lets the same address be tested
    // again after a copy change.
    update: { email, status: 'resolved', emailed_at: null, send_error: null },
    select: {
      id: true,
      email: true,
      instagram_handle: true,
      full_name: true,
      unsubscribe_token: true,
    },
  });

  const preview = copy.paragraphs
    .map((p) => p.replace(/\{\{first\}\}/g, lead.full_name || `@${lead.instagram_handle}`))
    .join('\n\n');

  console.log(`to              ${email}`);
  console.log(`from            ${process.env.CREATOR_OUTREACH_FROM || '(unset)'}`);
  console.log(`reply-to        ${process.env.CREATOR_OUTREACH_REPLY_TO || '(unset)'}`);
  console.log(`join url        ${joinUrl}`);
  console.log(`unsubscribe     ${unsubscribeUrl(lead.unsubscribe_token) || '(unset)'}`);
  console.log(`\nsubject         ${copy.subject}`);
  console.log(`\n${preview}\n\n${copy.signOff}\n`);

  if (dry) {
    console.log('--dry: nothing sent.');
    return;
  }

  const result = await sendOutreach(
    {
      email: lead.email!,
      instagram_handle: lead.instagram_handle,
      full_name: lead.full_name,
      unsubscribe_token: lead.unsubscribe_token,
    },
    copy
  );

  if (result.ok) {
    await prisma.creatorLead.update({
      where: { id: lead.id },
      data: { status: 'emailed', emailed_at: new Date(), copy_variant: 'META_A' },
    });
    console.log(`SENT  message id ${result.messageId}`);
  } else {
    await prisma.creatorLead.update({
      where: { id: lead.id },
      data: { send_error: result.reason.slice(0, 500) },
    });
    console.log(`FAILED  ${result.reason}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
