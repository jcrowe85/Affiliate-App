'use client';

import { useState, useEffect } from 'react';

interface Offer {
  id: string;
  offer_number: number | null;
  name: string;
  commission_type: string;
  amount: string;
  currency: string;
  commission_terms: string | null;
  attribution_window_days: number;
  auto_approve_affiliates: boolean;
  selling_subscriptions: string;
  subscription_max_payments: number | null;
  subscription_rebill_commission_type: string | null;
  subscription_rebill_commission_value: string | null;
  make_private: boolean;
  hide_referral_links: boolean;
  hide_coupon_promotion: boolean;
  enable_variable_commission: boolean;
  created_at: string;
  affiliate_count?: number;
  offer_revenue?: string;
}

function formatOfferType(o: Offer): string {
  const sym = o.currency === 'USD' ? '$' : o.currency === 'EUR' ? '€' : o.currency === 'GBP' ? '£' : o.currency + ' ';
  const main = o.commission_type === 'percentage'
    ? `${o.amount}%`
    : `${sym}${o.amount} flat`;
  if (o.selling_subscriptions === 'no') return main;
  if (o.selling_subscriptions === 'credit_all') return `${main} · all rebills`;
  if (o.selling_subscriptions === 'credit_none') return `${main} · no rebills`;
  if (o.selling_subscriptions === 'credit_first_only') {
    const n = o.subscription_max_payments ?? 0;
    const rebillType = o.subscription_rebill_commission_type || 'flat_rate';
    const val = o.subscription_rebill_commission_value ?? '0';
    const rebill = rebillType === 'percentage' ? `${val}%` : `${sym}${val}`;
    return n ? `${main} · rebill ${rebill} ×${n}` : `${main} · rebill ${rebill}`;
  }
  return main;
}

function formatCurrency(amount: string, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(amount));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function offerIdDisplay(offer: { offer_number?: number | null }): string {
  return offer.offer_number != null ? `#${offer.offer_number}` : '—';
}

const defaultForm = {
  name: '',
  commission_type: 'flat_rate' as 'flat_rate' | 'percentage',
  amount: '',
  currency: 'USD',
  commission_terms: '',
  attribution_window_days: 90,
  auto_approve_affiliates: false,
  selling_subscriptions: 'no' as 'no' | 'credit_all' | 'credit_none' | 'credit_first_only',
  subscription_max_payments: '',
  subscription_rebill_commission_type: 'flat_rate' as 'flat_rate' | 'percentage',
  subscription_rebill_commission_value: '',
  make_private: false,
  hide_referral_links: false,
  hide_coupon_promotion: false,
  enable_variable_commission: false,
};

export default function OffersManagement() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchOffers();
  }, []);

  const fetchOffers = async () => {
    try {
      const res = await fetch('/api/admin/offers');
      const data = await res.json();
      setOffers(data.offers || []);
    } catch (err) {
      console.error('Error fetching offers:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(defaultForm);
    setEditingOffer(null);
    setError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount) || 0,
          commission_terms: formData.commission_terms || null,
          subscription_max_payments: formData.selling_subscriptions === 'credit_first_only' && String(formData.subscription_max_payments).trim() !== ''
            ? parseInt(String(formData.subscription_max_payments), 10)
            : null,
          subscription_rebill_commission_type: formData.selling_subscriptions === 'credit_first_only'
            ? formData.subscription_rebill_commission_type
            : null,
          subscription_rebill_commission_value: formData.selling_subscriptions === 'credit_first_only' && formData.subscription_rebill_commission_value.trim() !== ''
            ? parseFloat(formData.subscription_rebill_commission_value)
            : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchOffers();
        setShowForm(false);
        resetForm();
      } else {
        setError(data.error || 'Failed to create offer');
      }
    } catch (err) {
      setError('Failed to create offer');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOffer) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/offers/${editingOffer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount) || 0,
          commission_terms: formData.commission_terms || null,
          subscription_max_payments: formData.selling_subscriptions === 'credit_first_only' && String(formData.subscription_max_payments).trim() !== ''
            ? parseInt(String(formData.subscription_max_payments), 10)
            : null,
          subscription_rebill_commission_type: formData.selling_subscriptions === 'credit_first_only'
            ? formData.subscription_rebill_commission_type
            : null,
          subscription_rebill_commission_value: formData.selling_subscriptions === 'credit_first_only' && formData.subscription_rebill_commission_value.trim() !== ''
            ? parseFloat(formData.subscription_rebill_commission_value)
            : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchOffers();
        setShowForm(false);
        resetForm();
      } else {
        setError(data.error || 'Failed to update offer');
      }
    } catch (err) {
      setError('Failed to update offer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this offer?')) return;
    try {
      const res = await fetch(`/api/admin/offers/${id}`, { method: 'DELETE' });
      if (res.ok) await fetchOffers();
      else {
        const data = await res.json();
        alert(data.error || 'Failed to delete');
      }
    } catch (err) {
      alert('Failed to delete offer');
    }
  };

  const startEdit = (offer: Offer) => {
    setEditingOffer(offer);
    setFormData({
      name: offer.name,
      commission_type: offer.commission_type as 'flat_rate' | 'percentage',
      amount: offer.amount,
      currency: offer.currency,
      commission_terms: offer.commission_terms || '',
      attribution_window_days: offer.attribution_window_days,
      auto_approve_affiliates: offer.auto_approve_affiliates,
      selling_subscriptions: offer.selling_subscriptions as any,
      subscription_max_payments: offer.subscription_max_payments != null ? String(offer.subscription_max_payments) : '',
      subscription_rebill_commission_type: (offer.subscription_rebill_commission_type || 'flat_rate') as 'flat_rate' | 'percentage',
      subscription_rebill_commission_value: offer.subscription_rebill_commission_value ?? '',
      make_private: offer.make_private,
      hide_referral_links: offer.hide_referral_links,
      hide_coupon_promotion: offer.hide_coupon_promotion,
      enable_variable_commission: offer.enable_variable_commission,
    });
    setShowForm(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 dark:border-gray-700 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
        >
          {showForm ? 'Cancel' : 'Add Offer'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
              {editingOffer ? `Edit Offer: ${editingOffer.name}` : 'Create New Offer'}
            </h3>
          </div>
          <form
            onSubmit={editingOffer ? handleUpdate : handleCreate}
            className="p-4 sm:p-6 space-y-6"
          >
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">General Offer Settings</h4>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. One-Time Purchase: $50 Per Sale"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  The offer name is how we will refer to this offer within the dashboard.
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Commission Structure</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                  <select
                    value={formData.commission_type}
                    onChange={(e) => setFormData({ ...formData, commission_type: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="flat_rate">Flat Rate Per Order</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </div>
                <div className={formData.commission_type === 'percentage' ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 sm:grid-cols-2 gap-4'}>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {formData.commission_type === 'percentage' ? 'Commission %' : 'Amount'}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        min={0}
                        max={formData.commission_type === 'percentage' ? 100 : undefined}
                        step={formData.commission_type === 'percentage' ? 0.01 : 1}
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      {formData.commission_type === 'percentage' && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">%</span>
                      )}
                    </div>
                  </div>
                  {formData.commission_type === 'flat_rate' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Currency</label>
                      <select
                        value={formData.currency}
                        onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Commission terms</label>
                  <textarea
                    rows={3}
                    value={formData.commission_terms}
                    onChange={(e) => setFormData({ ...formData, commission_terms: e.target.value })}
                    placeholder="Optional. Displayed on affiliate registration page and dashboard."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.enable_variable_commission}
                    onChange={(e) => setFormData({ ...formData, enable_variable_commission: e.target.checked })}
                    className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Enable Variable Commission by Attribution Type</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Available in higher tier plans.</p>
              </div>
            </div>

            <div className="border border-gray-200 dark:border-gray-800 rounded-lg">
              <button
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="w-full px-4 py-3 flex justify-between items-center text-left text-sm font-medium text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 rounded-t-lg"
              >
                Advanced Options
                <span className="text-gray-500 dark:text-gray-400">{advancedOpen ? '−' : '+'}</span>
              </button>
              {advancedOpen && (
                <div className="p-4 space-y-4 border-t border-gray-200 dark:border-gray-800">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Attribution Window (days)</label>
                    <input
                      type="number"
                      min={1}
                      value={formData.attribution_window_days}
                      onChange={(e) => setFormData({ ...formData, attribution_window_days: parseInt(e.target.value, 10) || 90 })}
                      className="w-full max-w-[120px] px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      In how many days does the customer have to complete the purchase for the affiliate to still get commission?
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Automatically approve affiliates who apply to this offer?</label>
                    <select
                      value={formData.auto_approve_affiliates ? 'Yes' : 'No'}
                      onChange={(e) => setFormData({ ...formData, auto_approve_affiliates: e.target.value === 'Yes' })}
                      className="w-full max-w-[120px] px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Selling Subscriptions?</label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Adjust to limit affiliate commissions on subscription renewals. (Only applies to recurring subscriptions. If you do not sell subscriptions, select &quot;No&quot;.)</p>
                    <div className="space-y-2">
                      {[
                        { value: 'no', label: 'No' },
                        { value: 'credit_all', label: 'Yes - Credit all renewals' },
                        { value: 'credit_none', label: 'Yes - Do not credit any renewals' },
                        { value: 'credit_first_only', label: 'Yes - Only credit the first renewals' },
                      ].map((o) => (
                        <label key={o.value} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="selling_subscriptions"
                            checked={formData.selling_subscriptions === o.value}
                            onChange={() => setFormData({ ...formData, selling_subscriptions: o.value as any })}
                            className="border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{o.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {formData.selling_subscriptions === 'credit_first_only' && (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 p-4 space-y-4">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">First renewals – commission settings</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Limit how many rebill payments earn commission and set a fixed or percentage rate for those renewals.</p>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Number of rebill payments to credit</label>
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={formData.subscription_max_payments}
                          onChange={(e) => setFormData({ ...formData, subscription_max_payments: e.target.value })}
                          placeholder="e.g. 6"
                          className="w-full max-w-[120px] px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Enter the exact number of rebill payments that will receive commission at the rebill rate. For example, entering 6 means 6 rebill payments will get commission (in addition to the initial payment at the initial rate).</p>
                      </div>
                      <div className="flex flex-wrap items-end gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rebill commission type</label>
                          <select
                            value={formData.subscription_rebill_commission_type}
                            onChange={(e) => setFormData({ ...formData, subscription_rebill_commission_type: e.target.value as 'flat_rate' | 'percentage' })}
                            className="w-full min-w-[140px] px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          >
                            <option value="flat_rate">Fixed</option>
                            <option value="percentage">Percentage</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {formData.subscription_rebill_commission_type === 'percentage' ? 'Percentage' : 'Amount'}
                          </label>
                          <div className="flex items-center gap-1">
                            {formData.subscription_rebill_commission_type === 'percentage' ? (
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.01}
                                value={formData.subscription_rebill_commission_value}
                                onChange={(e) => setFormData({ ...formData, subscription_rebill_commission_value: e.target.value })}
                                placeholder="0"
                                className="w-full max-w-[100px] px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                              />
                            ) : (
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={formData.subscription_rebill_commission_value}
                                onChange={(e) => setFormData({ ...formData, subscription_rebill_commission_value: e.target.value })}
                                placeholder="0.00"
                                className="w-full max-w-[100px] px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                              />
                            )}
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {formData.subscription_rebill_commission_type === 'percentage' ? '%' : formData.currency}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.make_private}
                      onChange={(e) => setFormData({ ...formData, make_private: e.target.checked })}
                      className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Make private</span>
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    When this is checked, the registration link to the offer will be encrypted and unavailable to the public. A default offer cannot be made private.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hide referral links from affiliates?</label>
                    <select
                      value={formData.hide_referral_links ? 'Yes' : 'No'}
                      onChange={(e) => setFormData({ ...formData, hide_referral_links: e.target.value === 'Yes' })}
                      className="w-full max-w-[120px] px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      If you select &quot;yes&quot;, the affiliate&apos;s referral link and link sharing tools will be hidden on the affiliate dashboard for affiliates in this offer.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hide coupon code promotion methods from affiliates?</label>
                    <select
                      value={formData.hide_coupon_promotion ? 'Yes' : 'No'}
                      onChange={(e) => setFormData({ ...formData, hide_coupon_promotion: e.target.value === 'Yes' })}
                      className="w-full max-w-[120px] px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      If you select &quot;yes&quot;, all coupon code promotion methods will be hidden on the affiliate dashboard for affiliates in this offer.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
        {offers.length === 0 ? (
          <div className="p-6 sm:p-8 text-center text-gray-500 dark:text-gray-400 text-sm sm:text-base">No offers yet. Create one to assign to affiliates.</div>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-800">
              {offers.map((offer) => (
                <div key={offer.id} className="p-4 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{offer.name}</p>
                      <p className="text-xs font-mono text-gray-500 dark:text-gray-400">{offerIdDisplay(offer)}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button type="button" onClick={() => startEdit(offer)} className="text-indigo-600 text-sm font-medium">Edit</button>
                      <button type="button" onClick={() => handleDelete(offer.id)} className="text-red-600 text-sm font-medium">Delete</button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{formatOfferType(offer)}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>{offer.attribution_window_days}d attr</span>
                    <span>{formatDate(offer.created_at)}</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(offer.offer_revenue ?? '0', offer.currency)}</span>
                    <span>{offer.affiliate_count ?? 0} affiliates</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Offer ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Offer Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Attribution</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Revenue</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Affiliates</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {offers.map((offer) => (
                    <tr key={offer.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{offer.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono text-gray-600 dark:text-gray-400" title={offer.id}>{offerIdDisplay(offer)}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs">{formatOfferType(offer)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{offer.attribution_window_days} days</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{formatDate(offer.created_at)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{formatCurrency(offer.offer_revenue ?? '0', offer.currency)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{offer.affiliate_count ?? 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                        <button type="button" onClick={() => startEdit(offer)} className="text-indigo-600 hover:text-indigo-800 font-medium">Edit</button>
                        <button type="button" onClick={() => handleDelete(offer.id)} className="text-red-600 hover:text-red-800 font-medium">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
