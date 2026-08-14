'use client';

import Link from 'next/link';
import { useState, FormEvent } from 'react';
import { BotIdClient } from 'botid/client';

/**
 * Endpoints this page calls that must not be reachable by a script.
 *
 * verify-payout is the one that matters: every call spends a $0.25 PayPal fee,
 * so unattended abuse costs real money rather than just filling a table.
 */
const PROTECTED_ROUTES = [
  { path: '/api/affiliate/verify-payout', method: 'POST' },
  { path: '/api/affiliate/apply', method: 'POST' },
];

const defaultForm = {
  first_name: '',
  last_name: '',
  company: '',
  email: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  zip: '',
  password: '',
  confirm_password: '',
};

const inputClass =
  'block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm';
const labelClass =
  'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

/**
 * Small "i" that reveals an explanation on hover or keyboard focus. The text is
 * also the button's aria-label, so screen readers get it without the tooltip.
 */
function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex align-middle ml-1 group">
      <button
        type="button"
        aria-label={text}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-full"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" strokeWidth={2} />
          <path strokeLinecap="round" strokeWidth={2} d="M12 11v5" />
          <path strokeLinecap="round" strokeWidth={2} d="M12 7.75v.5" />
        </svg>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-60 -translate-x-1/2 rounded-md bg-gray-900 px-3 py-2 text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-gray-700"
      >
        {text}
      </span>
    </span>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.736m0 0L21 21" />
    </svg>
  ) : (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

export default function AffiliateApplyPage() {
  const [formData, setFormData] = useState(defaultForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Payout destination, proven before the application can be submitted.
  const [payoutMethod, setPayoutMethod] = useState<'venmo' | 'paypal'>('venmo');
  const [payoutIdentifier, setPayoutIdentifier] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [payoutCode, setPayoutCode] = useState('');
  const [payoutVerified, setPayoutVerified] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [confirmingCode, setConfirmingCode] = useState(false);
  const [payoutError, setPayoutError] = useState('');

  /** Any change to the destination invalidates the proof of the previous one. */
  const resetPayoutVerification = () => {
    setVerificationId('');
    setPayoutCode('');
    setPayoutVerified(false);
    setPayoutError('');
  };

  const handleSendVerification = async () => {
    setPayoutError('');
    setSendingCode(true);
    try {
      const res = await fetch('/api/affiliate/verify-payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          method: payoutMethod,
          identifier: payoutIdentifier.trim(),
          applicant_email: formData.email.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayoutError(data.error || 'Could not send the verification payment');
        return;
      }
      setVerificationId(data.verification_id);
      setPayoutCode('');
    } catch {
      setPayoutError('Could not send the verification payment');
    } finally {
      setSendingCode(false);
    }
  };

  const handleConfirmCode = async () => {
    setPayoutError('');
    setConfirmingCode(true);
    try {
      const res = await fetch('/api/affiliate/verify-payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          verification_id: verificationId,
          code: payoutCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayoutError(data.error || 'That code did not match');
        return;
      }
      setPayoutVerified(true);
    } catch {
      setPayoutError('Could not check that code');
    } finally {
      setConfirmingCode(false);
    }
  };

  const set = (field: keyof typeof defaultForm) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => setFormData({ ...formData, [field]: e.target.value });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirm_password) {
      setError('Password and confirm password do not match');
      return;
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!payoutVerified) {
      setError('Verify your payout destination before submitting');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/affiliate/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          payout_method: payoutMethod,
          payout_identifier: payoutIdentifier.trim(),
          payout_verification_id: verificationId,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to submit application');
        setLoading(false);
        return;
      }
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="max-w-md w-full text-center p-8 bg-white dark:bg-gray-900 rounded-lg shadow">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
            <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Application received
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Thanks, {formData.first_name}. Our team will review your application
            and set up your account. Once it&apos;s approved you can sign in with
            the email and password you just chose.
          </p>
          <Link
            href="/affiliates"
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
          >
            Back to Fleur Affiliates
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12 px-4 sm:px-6 lg:px-8">
      <BotIdClient protect={PROTECTED_ROUTES} />
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            Join Fleur Affiliates
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Tell us about yourself and choose a password. We&apos;ll review your
            application and finish setting up your account.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-gray-900 rounded-lg shadow p-6 sm:p-8 space-y-6"
        >
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Your details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="first_name" className={labelClass}>First name *</label>
                <input id="first_name" type="text" required autoComplete="given-name" value={formData.first_name} onChange={set('first_name')} className={inputClass} />
              </div>
              <div>
                <label htmlFor="last_name" className={labelClass}>Last name *</label>
                <input id="last_name" type="text" required autoComplete="family-name" value={formData.last_name} onChange={set('last_name')} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="company" className={labelClass}>Company</label>
                <input id="company" type="text" autoComplete="organization" value={formData.company} onChange={set('company')} className={inputClass} />
              </div>
              <div>
                <label htmlFor="email" className={labelClass}>Email *</label>
                <input id="email" type="email" required autoComplete="email" value={formData.email} onChange={set('email')} className={inputClass} />
              </div>
              <div>
                <label htmlFor="phone" className={labelClass}>Phone</label>
                <input id="phone" type="tel" autoComplete="tel" value={formData.phone} onChange={set('phone')} className={inputClass} />
              </div>
            </div>
          </div>

          {/* ── Method of payment ── */}
          <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Method of payment
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Choose how you&apos;d like to receive your commissions, then confirm it
              with a short code. This is the only way we can be certain your money
              reaches you and not someone else.
            </p>

            <div className="flex gap-2 mb-4">
              {([
                { value: 'venmo', label: 'Venmo' },
                { value: 'paypal', label: 'PayPal' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    if (payoutMethod === opt.value) return;
                    setPayoutMethod(opt.value);
                    // Switching rails invalidates any proof already obtained.
                    resetPayoutVerification();
                  }}
                  className={`flex-1 rounded-md border px-4 py-3 text-sm font-medium transition-colors ${
                    payoutMethod === opt.value
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                      : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <label htmlFor="payout_identifier" className={labelClass}>
                {payoutMethod === 'venmo' ? 'Venmo mobile number *' : 'PayPal email *'}
                <InfoTip
                  text={
                    payoutMethod === 'venmo'
                      ? 'The US mobile number your Venmo account uses. We send commissions to this number, so it must be exactly right — payments to a wrong number cannot be recovered.'
                      : 'The email address on your PayPal account. We send commissions here, and we will email a code to it to confirm.'
                  }
                />
              </label>
              <div className="flex gap-2">
                <input
                  id="payout_identifier"
                  type={payoutMethod === 'venmo' ? 'tel' : 'email'}
                  required
                  value={payoutIdentifier}
                  onChange={(e) => {
                    setPayoutIdentifier(e.target.value);
                    // Editing the destination invalidates a proof of the old one.
                    if (payoutVerified || verificationId) resetPayoutVerification();
                  }}
                  disabled={payoutVerified}
                  placeholder={payoutMethod === 'venmo' ? '(555) 123-4567' : 'you@example.com'}
                  className={`${inputClass} disabled:opacity-60`}
                />
                {!payoutVerified && (
                  <button
                    type="button"
                    onClick={handleSendVerification}
                    disabled={sendingCode || !payoutIdentifier.trim() || !formData.email.trim()}
                    className="shrink-0 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                  >
                    {sendingCode
                      ? 'Sending…'
                      : verificationId
                        ? 'Resend'
                        : payoutMethod === 'venmo'
                          ? 'Send 1¢'
                          : 'Email code'}
                  </button>
                )}
              </div>
              {!formData.email.trim() && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Enter your email above first — we tie the verification to your application.
                </p>
              )}
            </div>

            {payoutVerified ? (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700/60 px-3 py-2">
                <svg className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-green-800 dark:text-green-200">
                  Verified — commissions will be sent here.
                </p>
                <button
                  type="button"
                  onClick={resetPayoutVerification}
                  className="ml-auto text-xs text-green-800 dark:text-green-300 underline"
                >
                  Change
                </button>
              </div>
            ) : verificationId ? (
              <div className="mt-3 rounded-md border border-indigo-300 dark:border-indigo-700/60 bg-indigo-50 dark:bg-indigo-900/20 p-3">
                <p className="text-sm text-indigo-900 dark:text-indigo-200">
                  {payoutMethod === 'venmo' ? (
                    <>
                      We sent 1&cent; to <strong>{payoutIdentifier}</strong>. Open Venmo and
                      read the 6-digit code in the payment note.
                    </>
                  ) : (
                    <>
                      We emailed a 6-digit code to <strong>{payoutIdentifier}</strong>.
                    </>
                  )}
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={payoutCode}
                    onChange={(e) => setPayoutCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className={`${inputClass} font-mono tracking-widest`}
                  />
                  <button
                    type="button"
                    onClick={handleConfirmCode}
                    disabled={confirmingCode || payoutCode.length < 6}
                    className="shrink-0 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                  >
                    {confirmingCode ? 'Checking…' : 'Confirm'}
                  </button>
                </div>
                <p className="mt-2 text-xs text-indigo-800 dark:text-indigo-300">
                  It can take a minute to arrive{payoutMethod === 'paypal' ? ' — check spam too' : ''}. The code expires in an hour.
                </p>
              </div>
            ) : null}

            {payoutError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{payoutError}</p>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Address
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-3">
                <label htmlFor="address_line1" className={labelClass}>Address</label>
                <input id="address_line1" type="text" autoComplete="address-line1" value={formData.address_line1} onChange={set('address_line1')} className={inputClass} placeholder="Street address" />
              </div>
              <div className="sm:col-span-3">
                <label htmlFor="address_line2" className={labelClass}>Address line 2</label>
                <input id="address_line2" type="text" autoComplete="address-line2" value={formData.address_line2} onChange={set('address_line2')} className={inputClass} placeholder="Apartment, suite, etc." />
              </div>
              <div>
                <label htmlFor="city" className={labelClass}>City</label>
                <input id="city" type="text" autoComplete="address-level2" value={formData.city} onChange={set('city')} className={inputClass} />
              </div>
              <div>
                <label htmlFor="state" className={labelClass}>State</label>
                <input id="state" type="text" autoComplete="address-level1" value={formData.state} onChange={set('state')} className={inputClass} />
              </div>
              <div>
                <label htmlFor="zip" className={labelClass}>ZIP</label>
                <input id="zip" type="text" autoComplete="postal-code" value={formData.zip} onChange={set('zip')} className={inputClass} />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Choose a password
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              You&apos;ll use this with your email to sign in once approved.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative">
                <label htmlFor="password" className={labelClass}>Password *</label>
                <input id="password" type={showPassword ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={formData.password} onChange={set('password')} className={`${inputClass} pr-10`} placeholder="At least 8 characters" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-0 bottom-0 h-[38px] pr-3 flex items-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300" aria-label={showPassword ? 'Hide password' : 'Show password'} tabIndex={-1}>
                  <EyeIcon open={showPassword} />
                </button>
              </div>
              <div className="relative">
                <label htmlFor="confirm_password" className={labelClass}>Confirm password *</label>
                <input id="confirm_password" type={showConfirmPassword ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={formData.confirm_password} onChange={set('confirm_password')} className={`${inputClass} pr-10`} />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-0 bottom-0 h-[38px] pr-3 flex items-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300" aria-label={showConfirmPassword ? 'Hide password' : 'Show password'} tabIndex={-1}>
                  <EyeIcon open={showConfirmPassword} />
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
            <button
              type="submit"
              disabled={loading || !payoutVerified}
              className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {loading ? 'Submitting...' : 'Submit application'}
            </button>
            <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
              Already have an account?{' '}
              <Link href="/affiliates/login" className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
