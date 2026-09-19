/**
 * Self-test for the pure parts of per-creator coupon codes.
 *
 * Run: npx tsx scripts/coupon-selftest.ts
 */
import { buildCouponCode, couponPercent } from '../lib/affiliate-coupon';
import { isCreatorSource } from '../lib/creator-offer';

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

console.log('\n-- coupon code shape --');
eq('name + number', buildCouponCode({ firstName: 'Sarah', affiliateNumber: 30485 }), 'SARAH30485');
eq('uppercased', buildCouponCode({ firstName: 'sarah', affiliateNumber: 1 }), 'SARAH1');
eq('accents folded', buildCouponCode({ firstName: 'Renée', affiliateNumber: 7 }), 'RENEE7');
eq('punctuation and spaces dropped', buildCouponCode({ firstName: "Mary-Jo O'Neil", affiliateNumber: 9 }), 'MARYJOONEIL9');
eq('missing name falls back', buildCouponCode({ firstName: null, affiliateNumber: 42 }), 'FLEUR42');
eq('missing number still yields a code', buildCouponCode({ firstName: 'Ann', affiliateNumber: null }), 'ANN');
eq('emoji-only name falls back', buildCouponCode({ firstName: '✨', affiliateNumber: 5 }), 'FLEUR5');
// 12 characters of name, then the number — long enough to stay recognisable,
// short enough to say out loud in a video.
eq('long name is truncated to 12', buildCouponCode({ firstName: 'Bartholomewlongname', affiliateNumber: 3 }), 'BARTHOLOMEWL3');
eq('suffix is appended', buildCouponCode({ firstName: 'Sarah', affiliateNumber: 30485, suffix: 'X1Y2' }), 'SARAH30485X1Y2');

console.log('\n-- percent parsing --');
const orig = process.env.AFFILIATE_COUPON_PERCENT;
process.env.AFFILIATE_COUPON_PERCENT = '';
eq('unset defaults to the 10% creator offer', couponPercent(), 10);
process.env.AFFILIATE_COUPON_PERCENT = '15';
eq('reads a percentage', couponPercent(), 15);
process.env.AFFILIATE_COUPON_PERCENT = 'abc';
eq('junk is treated as zero', couponPercent(), 0);
process.env.AFFILIATE_COUPON_PERCENT = '-5';
eq('negative is treated as zero', couponPercent(), 0);
process.env.AFFILIATE_COUPON_PERCENT = '500';
eq('clamped to 100', couponPercent(), 100);
if (orig === undefined) delete process.env.AFFILIATE_COUPON_PERCENT; else process.env.AFFILIATE_COUPON_PERCENT = orig;

console.log('\n-- creator source matching --');
eq('meta-dm is a creator source', isCreatorSource('meta-dm'), true);
eq('meta-email is a creator source', isCreatorSource('meta-email'), true);
eq('bare meta counts', isCreatorSource('meta'), true);
eq('case and padding ignored', isCreatorSource('  Meta-DM  '), true);
eq('trybe-email is not', isCreatorSource('trybe-email'), false);
eq('the signup-form label is not', isCreatorSource('Affiliate signup form'), false);
// Guards the 40% offer against a lookalike tag quietly collecting it.
eq('metabolism-blog is not a creator source', isCreatorSource('metabolism-blog'), false);
eq('null is not', isCreatorSource(null), false);
eq('empty is not', isCreatorSource(''), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
