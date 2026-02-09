import { hashPassword, verifyPassword } from '../lib/auth';
import { prisma } from '../lib/db';

async function testPassword() {
  const testPassword = 'test123';
  const testEmail = process.argv[2] || 'test@example.com';
  
  console.log('Testing password hashing and verification...');
  console.log('Test password:', testPassword);
  console.log('Test email:', testEmail);
  
  // Find affiliate
  const affiliate = await prisma.affiliate.findUnique({
    where: { email: testEmail },
  });
  
  if (!affiliate) {
    console.error('Affiliate not found with email:', testEmail);
    process.exit(1);
  }
  
  console.log('\n=== Current State ===');
  console.log('Affiliate ID:', affiliate.id);
  console.log('Email:', affiliate.email);
  console.log('Status:', affiliate.status);
  console.log('Has password_hash:', !!affiliate.password_hash);
  console.log('Password hash length:', affiliate.password_hash?.length || 0);
  
  // Hash a test password
  console.log('\n=== Hashing New Password ===');
  const hashed = await hashPassword(testPassword);
  console.log('Hashed password length:', hashed.length);
  console.log('Hash preview:', hashed.substring(0, 20) + '...');
  
  // Update the affiliate password
  console.log('\n=== Updating Password ===');
  await prisma.affiliate.update({
    where: { id: affiliate.id },
    data: { password_hash: hashed },
  });
  console.log('Password updated in database');
  
  // Verify it was saved
  const updated = await prisma.affiliate.findUnique({
    where: { id: affiliate.id },
    select: { password_hash: true },
  });
  console.log('Verification - Hash exists:', !!updated?.password_hash);
  console.log('Verification - Hash length:', updated?.password_hash?.length || 0);
  console.log('Verification - Hash matches:', updated?.password_hash === hashed);
  
  // Test verification
  console.log('\n=== Testing Verification ===');
  const isValid = await verifyPassword(testPassword, updated!.password_hash!);
  console.log('Password verification result:', isValid);
  
  // Test with wrong password
  const isInvalid = await verifyPassword('wrongpassword', updated!.password_hash!);
  console.log('Wrong password verification result:', isInvalid);
  
  console.log('\n=== Test Complete ===');
  console.log('You can now try logging in with:');
  console.log('Email:', testEmail);
  console.log('Password:', testPassword);
}

testPassword()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
