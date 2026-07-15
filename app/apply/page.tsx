'use client';

import Link from 'next/link';
import { useState, FormEvent } from 'react';

const defaultForm = {
  first_name: '',
  last_name: '',
  company: '',
  email: '',
  paypal_email: '',
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

    setLoading(true);
    try {
      const response = await fetch('/api/affiliate/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
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
              <div className="sm:col-span-2">
                <label htmlFor="paypal_email" className={labelClass}>PayPal email</label>
                <input id="paypal_email" type="email" value={formData.paypal_email} onChange={set('paypal_email')} className={inputClass} placeholder="Where we send your commission payouts" />
              </div>
            </div>
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
              disabled={loading}
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
