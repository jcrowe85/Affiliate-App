'use client';

import { useState, useEffect } from 'react';

interface Offer {
  id: string;
  name: string;
  commission_type: string;
  amount: string;
  currency: string;
}

interface Affiliate {
  id: string;
  affiliate_number: number | null;
  name: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  email: string;
  paypal_email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  status: string;
  payout_method: string | null;
  payout_identifier: string | null;
  payout_terms_days: number;
  merchant_id: string | null;
  offer_id: string | null;
  offer: { id: string; name: string } | null;
  offers?: Array<{ id: string; name: string; offer_number: number | null }>;
  created_at: string;
  stats: {
    links: number;
    clicks: number;
    orders: number;
    commissions: number;
    revenue: number;
    currency: string;
    aov: number;
    pending_conversions: number;
  };
}

const defaultForm = {
  first_name: '',
  last_name: '',
  company: '',
  email: '',
  paypal_email: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
  offer_id: '',
  password: '',
  confirm_password: '',
  merchant_id: '',
  status: 'active' as string,
  payout_terms_days: 30,
};

export default function AffiliateManagement() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAffiliate, setEditingAffiliate] = useState<Affiliate | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const [showAddOfferModal, setShowAddOfferModal] = useState(false);
  const [newOffer, setNewOffer] = useState({
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
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [error, setError] = useState('');
  const [copiedAffiliateId, setCopiedAffiliateId] = useState<string | null>(null);

  useEffect(() => {
    fetchAffiliates();
    fetchOffers();
  }, []);

  const fetchAffiliates = async () => {
    try {
      const res = await fetch('/api/admin/affiliates');
      const data = await res.json();
      setAffiliates(data.affiliates || []);
    } catch (err) {
      console.error('Error fetching affiliates:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOffers = async () => {
    try {
      const res = await fetch('/api/admin/offers');
      const data = await res.json();
      setOffers(data.offers || []);
    } catch (err) {
      console.error('Error fetching offers:', err);
    }
  };

  const resetForm = () => {
    setFormData(defaultForm);
    setEditingAffiliate(null);
    setError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (formData.password !== formData.confirm_password) {
      setError('Password and confirm password do not match');
      return;
    }
    try {
      const res = await fetch('/api/admin/affiliates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          company: formData.company.trim() || undefined,
          email: formData.email.trim(),
          paypal_email: formData.paypal_email.trim() || undefined,
          address_line1: formData.address_line1.trim() || undefined,
          address_line2: formData.address_line2.trim() || undefined,
          city: formData.city.trim() || undefined,
          state: formData.state.trim() || undefined,
          zip: formData.zip.trim() || undefined,
          phone: formData.phone.trim() || undefined,
          offer_id: formData.offer_id,
          password: formData.password,
          merchant_id: formData.merchant_id.trim(),
          status: formData.status,
          payout_terms_days: formData.payout_terms_days,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchAffiliates();
        setShowForm(false);
        resetForm();
      } else {
        setError(data.error || 'Failed to create affiliate');
      }
    } catch (err) {
      setError('Failed to create affiliate');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAffiliate) return;
    if (formData.password && formData.password !== formData.confirm_password) {
      setError('Password and confirm password do not match');
      return;
    }
    setError('');
    try {
      const payload: Record<string, unknown> = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        company: formData.company.trim() || undefined,
        email: formData.email.trim(),
        paypal_email: formData.paypal_email.trim() || undefined,
        address_line1: formData.address_line1.trim() || undefined,
        address_line2: formData.address_line2.trim() || undefined,
        city: formData.city.trim() || undefined,
        state: formData.state.trim() || undefined,
        zip: formData.zip.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        offer_id: formData.offer_id,
        merchant_id: formData.merchant_id.trim() || null,
        status: formData.status,
        payout_terms_days: formData.payout_terms_days,
      };
      if (formData.password) payload.password = formData.password;

      const res = await fetch(`/api/admin/affiliates/${editingAffiliate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchAffiliates();
        setShowForm(false);
        resetForm();
      } else {
        setError(data.error || 'Failed to update affiliate');
      }
    } catch (err) {
      setError('Failed to update affiliate');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this affiliate?')) return;
    try {
      const res = await fetch(`/api/admin/affiliates/${id}`, { method: 'DELETE' });
      if (res.ok) await fetchAffiliates();
      else {
        const data = await res.json();
        alert(data.error || 'Failed to delete');
      }
    } catch (err) {
      alert('Failed to delete affiliate');
    }
  };

  const startEdit = (affiliate: Affiliate) => {
    setEditingAffiliate(affiliate);
    setFormData({
      first_name: affiliate.first_name || '',
      last_name: affiliate.last_name || '',
      company: affiliate.company || '',
      email: affiliate.email,
      paypal_email: affiliate.paypal_email || '',
      address_line1: affiliate.address_line1 || '',
      address_line2: affiliate.address_line2 || '',
      city: affiliate.city || '',
      state: affiliate.state || '',
      zip: affiliate.zip || '',
      phone: affiliate.phone || '',
      offer_id: affiliate.offer_id || '',
      password: '',
      confirm_password: '',
      merchant_id: affiliate.merchant_id || '',
      status: affiliate.status,
      payout_terms_days: affiliate.payout_terms_days,
    });
    setShowForm(true);
  };

  const handleAddOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOffer.name.trim() || !newOffer.amount) return;
    setSavingOffer(true);
    setError('');
    try {
      const sellSub = newOffer.selling_subscriptions;
      const maxPay = newOffer.subscription_max_payments ? parseInt(String(newOffer.subscription_max_payments), 10) : null;
      const rebillType = sellSub === 'credit_first_only' ? newOffer.subscription_rebill_commission_type : null;
      const rebillVal = sellSub === 'credit_first_only' && newOffer.subscription_rebill_commission_value ? parseFloat(String(newOffer.subscription_rebill_commission_value)) : null;

      const res = await fetch('/api/admin/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newOffer.name.trim(),
          commission_type: newOffer.commission_type,
          amount: parseFloat(String(newOffer.amount)),
          currency: newOffer.currency,
          commission_terms: newOffer.commission_terms || null,
          attribution_window_days: newOffer.attribution_window_days || 90,
          auto_approve_affiliates: newOffer.auto_approve_affiliates,
          selling_subscriptions: sellSub,
          subscription_max_payments: maxPay,
          subscription_rebill_commission_type: rebillType,
          subscription_rebill_commission_value: rebillVal,
          make_private: newOffer.make_private,
          hide_referral_links: newOffer.hide_referral_links,
          hide_coupon_promotion: newOffer.hide_coupon_promotion,
          enable_variable_commission: newOffer.enable_variable_commission,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchOffers();
        // Automatically add the newly created offer to the affiliate's offer list
        setFormData((prev) => ({ ...prev, offer_id: data.offer.id }));
        setNewOffer({
          name: '',
          commission_type: 'flat_rate',
          amount: '',
          currency: 'USD',
          commission_terms: '',
          attribution_window_days: 90,
          auto_approve_affiliates: false,
          selling_subscriptions: 'no',
          subscription_max_payments: '',
          subscription_rebill_commission_type: 'flat_rate',
          subscription_rebill_commission_value: '',
          make_private: false,
          hide_referral_links: false,
          hide_coupon_promotion: false,
          enable_variable_commission: false,
        });
        setAdvancedOpen(false);
        setShowAddOfferModal(false);
      } else {
        setError(data.error || 'Failed to create offer');
      }
    } catch (err) {
      setError('Failed to create offer');
    } finally {
      setSavingOffer(false);
    }
  };

  const handleSelectOffer = (offerId: string) => {
    setFormData((prev) => ({ ...prev, offer_id: offerId }));
    setSelectedOfferId('');
  };

  const getReferralUrl = (affiliateNumber: number | null, format: 'query' | 'path' = 'query'): string => {
    if (!affiliateNumber) return '';
    // Query parameter is now the primary/default format
    if (format === 'query') {
      return `https://tryfleur.com/?ref=${affiliateNumber}`;
    }
    // Path-based is secondary option
    return `https://tryfleur.com/ref/${affiliateNumber}`;
  };

  const copyReferralUrl = async (affiliateNumber: number | null, affiliateId: string, format: 'query' | 'path' = 'query') => {
    if (!affiliateNumber) {
      setError('Affiliate does not have an affiliate number assigned');
      return;
    }
    
    const url = getReferralUrl(affiliateNumber, format);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedAffiliateId(affiliateId);
      setTimeout(() => setCopiedAffiliateId(null), 2000);
    } catch (err) {
      setError('Failed to copy URL to clipboard');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
        >
          {showForm ? 'Cancel' : 'Add Affiliate'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingAffiliate ? 'Edit Affiliate' : 'Add New Affiliate'}
          </h3>
          </div>
          <form
            onSubmit={editingAffiliate ? handleUpdate : handleCreate}
            className="p-6 space-y-6"
          >
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First name *</label>
                <input
                  type="text"
                  required
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last name *</label>
                <input
                  type="text"
                  required
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PayPal Email</label>
                <input
                  type="email"
                  value={formData.paypal_email}
                  onChange={(e) => setFormData({ ...formData, paypal_email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input
                type="text"
                value={formData.address_line1}
                onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                placeholder="Street address"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
              <input
                type="text"
                value={formData.address_line2}
                onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                placeholder="Apartment, suite, unit, etc. (optional)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code</label>
                <input
                  type="text"
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Offer</h4>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <select
                    value={formData.offer_id}
                    onChange={(e) => setFormData({ ...formData, offer_id: e.target.value })}
                    required
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Select an offer *</option>
                    {offers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowAddOfferModal(true)}
                    className="px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-300 rounded-lg hover:bg-indigo-50"
                  >
                    Add new offer
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Each affiliate can have one offer. This offer applies to all new customers. Existing customers will continue with their original offer rules even if you change this affiliate&apos;s offer.
                </p>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Account Settings</h4>
              <div className="space-y-4">
                {!editingAffiliate && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                      <input
                        type="password"
                        required={!editingAffiliate}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password *</label>
                      <input
                        type="password"
                        required={!editingAffiliate}
                        value={formData.confirm_password}
                        onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}
                {editingAffiliate && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">New password (leave blank to keep)</label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
                      <input
                        type="password"
                        value={formData.confirm_password}
                        onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unique Merchant ID</label>
                  <input
                    type="text"
                    value={formData.merchant_id}
                    onChange={(e) => setFormData({ ...formData, merchant_id: e.target.value })}
                    placeholder="e.g. AF-001 (optional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="banned">Banned</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payout Terms (days)</label>
                    <input
                      type="number"
                      min={1}
                      value={formData.payout_terms_days}
                      onChange={(e) => setFormData({ ...formData, payout_terms_days: parseInt(e.target.value, 10) || 30 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            <button
              type="submit"
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              {editingAffiliate ? 'Update Affiliate' : 'Create Affiliate'}
            </button>
            </div>
          </form>
        </div>
      )}

      {showAddOfferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full my-8 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Create New Offer</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddOfferModal(false);
                    setNewOffer({
                      name: '',
                      commission_type: 'flat_rate',
                      amount: '',
                      currency: 'USD',
                      commission_terms: '',
                      attribution_window_days: 90,
                      auto_approve_affiliates: false,
                      selling_subscriptions: 'no',
                      subscription_max_payments: '',
                      subscription_rebill_commission_type: 'flat_rate',
                      subscription_rebill_commission_value: '',
                      make_private: false,
                      hide_referral_links: false,
                      hide_coupon_promotion: false,
                      enable_variable_commission: false,
                    });
                    setAdvancedOpen(false);
                    setError('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <form onSubmit={handleAddOffer} className="p-6 space-y-6">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">General Offer Settings</h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    value={newOffer.name}
                    onChange={(e) => setNewOffer({ ...newOffer, name: e.target.value })}
                    placeholder="e.g. One-Time Purchase: $50 Per Sale"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    The offer name is how we will refer to this offer within the dashboard.
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Commission Structure</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                    <select
                      value={newOffer.commission_type}
                      onChange={(e) => setNewOffer({ ...newOffer, commission_type: e.target.value as 'flat_rate' | 'percentage' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="flat_rate">Flat Rate Per Order</option>
                      <option value="percentage">Percentage</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                      <input
                        type="number"
                        required
                        min={0}
                        step={newOffer.commission_type === 'percentage' ? 0.01 : 1}
                        value={newOffer.amount}
                        onChange={(e) => setNewOffer({ ...newOffer, amount: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Currency *</label>
                      <select
                        value={newOffer.currency}
                        onChange={(e) => setNewOffer({ ...newOffer, currency: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Commission terms</label>
                    <textarea
                      rows={3}
                      value={newOffer.commission_terms}
                      onChange={(e) => setNewOffer({ ...newOffer, commission_terms: e.target.value })}
                      placeholder="Optional. Displayed on affiliate registration page and dashboard."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newOffer.enable_variable_commission}
                      onChange={(e) => setNewOffer({ ...newOffer, enable_variable_commission: e.target.checked })}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700">Enable Variable Commission by Attribution Type</span>
                  </label>
                  <p className="text-xs text-gray-500">Available in higher tier plans.</p>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  className="w-full px-4 py-3 flex justify-between items-center text-left text-sm font-medium text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-t-lg"
                >
                  Advanced Options
                  <span className="text-gray-500">{advancedOpen ? '−' : '+'}</span>
                </button>
                {advancedOpen && (
                  <div className="p-4 space-y-4 border-t border-gray-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Attribution Window (days)</label>
                      <input
                        type="number"
                        min={1}
                        value={newOffer.attribution_window_days}
                        onChange={(e) => setNewOffer({ ...newOffer, attribution_window_days: parseInt(e.target.value, 10) || 90 })}
                        className="w-full max-w-[120px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        In how many days does the customer have to complete the purchase for the affiliate to still get commission?
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Automatically approve affiliates who apply to this offer?</label>
                      <select
                        value={newOffer.auto_approve_affiliates ? 'Yes' : 'No'}
                        onChange={(e) => setNewOffer({ ...newOffer, auto_approve_affiliates: e.target.value === 'Yes' })}
                        className="w-full max-w-[120px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Selling Subscriptions?</label>
                      <p className="text-xs text-gray-500 mb-2">Adjust to limit affiliate commissions on subscription renewals. (Only applies to recurring subscriptions. If you do not sell subscriptions, select &quot;No&quot;.)</p>
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
                              checked={newOffer.selling_subscriptions === o.value}
                              onChange={() => setNewOffer({ ...newOffer, selling_subscriptions: o.value as any })}
                              className="border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-gray-700">{o.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {newOffer.selling_subscriptions === 'credit_first_only' && (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
                        <p className="text-sm font-medium text-gray-900">First renewals – commission settings</p>
                        <p className="text-xs text-gray-500">Limit how many rebill payments earn commission and set a fixed or percentage rate for those renewals.</p>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Number of rebill payments to credit</label>
                          <input
                            type="number"
                            min={1}
                            max={999}
                            value={newOffer.subscription_max_payments}
                            onChange={(e) => setNewOffer({ ...newOffer, subscription_max_payments: e.target.value })}
                            placeholder="e.g. 6"
                            className="w-full max-w-[120px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                          <p className="mt-1 text-xs text-gray-500">Enter the exact number of rebill payments that will receive commission at the rebill rate. For example, entering 6 means 6 rebill payments will get commission (in addition to the initial payment at the initial rate).</p>
                        </div>
                        <div className="flex flex-wrap items-end gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Rebill commission type</label>
                            <select
                              value={newOffer.subscription_rebill_commission_type}
                              onChange={(e) => setNewOffer({ ...newOffer, subscription_rebill_commission_type: e.target.value as 'flat_rate' | 'percentage' })}
                              className="w-full min-w-[140px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            >
                              <option value="flat_rate">Fixed</option>
                              <option value="percentage">Percentage</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {newOffer.subscription_rebill_commission_type === 'percentage' ? 'Percentage' : 'Amount'}
                            </label>
                            <div className="flex items-center gap-1">
                              {newOffer.subscription_rebill_commission_type === 'percentage' ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.01}
                                  value={newOffer.subscription_rebill_commission_value}
                                  onChange={(e) => setNewOffer({ ...newOffer, subscription_rebill_commission_value: e.target.value })}
                                  placeholder="0"
                                  className="w-full max-w-[100px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={newOffer.subscription_rebill_commission_value}
                                  onChange={(e) => setNewOffer({ ...newOffer, subscription_rebill_commission_value: e.target.value })}
                                  placeholder="0.00"
                                  className="w-full max-w-[100px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              )}
                              <span className="text-sm text-gray-500">
                                {newOffer.subscription_rebill_commission_type === 'percentage' ? '%' : newOffer.currency}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newOffer.make_private}
                        onChange={(e) => setNewOffer({ ...newOffer, make_private: e.target.checked })}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">Make private</span>
                    </label>
                    <p className="text-xs text-gray-500">
                      When this is checked, the registration link to the offer will be encrypted and unavailable to the public. A default offer cannot be made private.
                    </p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hide referral links from affiliates?</label>
                      <select
                        value={newOffer.hide_referral_links ? 'Yes' : 'No'}
                        onChange={(e) => setNewOffer({ ...newOffer, hide_referral_links: e.target.value === 'Yes' })}
                        className="w-full max-w-[120px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                      <p className="mt-1 text-xs text-gray-500">
                        If you select &quot;yes&quot;, the affiliate&apos;s referral link and link sharing tools will be hidden on the affiliate dashboard for affiliates in this offer.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hide coupon code promotion methods from affiliates?</label>
                      <select
                        value={newOffer.hide_coupon_promotion ? 'Yes' : 'No'}
                        onChange={(e) => setNewOffer({ ...newOffer, hide_coupon_promotion: e.target.value === 'Yes' })}
                        className="w-full max-w-[120px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                      <p className="mt-1 text-xs text-gray-500">
                        If you select &quot;yes&quot;, all coupon code promotion methods will be hidden on the affiliate dashboard for affiliates in this offer.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddOfferModal(false);
                    setNewOffer({
                      name: '',
                      commission_type: 'flat_rate',
                      amount: '',
                      currency: 'USD',
                      commission_terms: '',
                      attribution_window_days: 90,
                      auto_approve_affiliates: false,
                      selling_subscriptions: 'no',
                      subscription_max_payments: '',
                      subscription_rebill_commission_type: 'flat_rate',
                      subscription_rebill_commission_value: '',
                      make_private: false,
                      hide_referral_links: false,
                      hide_coupon_promotion: false,
                      enable_variable_commission: false,
                    });
                    setAdvancedOpen(false);
                    setError('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingOffer}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingOffer ? 'Creating…' : 'Create Offer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {affiliates.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No affiliates yet. Add one to get started.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Affiliate Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Affiliate ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Referral URL</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Creation Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Offer Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Orders</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AOV</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pending Conversions</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {affiliates.map((a) => {
                  const formatCurrency = (amount: number, currency: string = 'USD') => {
                    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
                  };
                  const formatDate = (iso: string) => {
                    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                  };
                  const primaryOffer = a.offer?.name || '—';

                  return (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {a.first_name && a.last_name ? `${a.first_name} ${a.last_name}` : a.name}
                        </div>
                        {a.company && <div className="text-xs text-gray-500">{a.company}</div>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono text-gray-600">
                          {a.affiliate_number != null ? `#${a.affiliate_number}` : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {a.affiliate_number != null ? (
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-blue-50 px-2 py-1 rounded text-blue-700 max-w-xs truncate border border-blue-200">
                              {getReferralUrl(a.affiliate_number, 'query')}
                            </code>
                            <button
                              type="button"
                              onClick={() => copyReferralUrl(a.affiliate_number, a.id, 'query')}
                              className="text-blue-600 hover:text-blue-800 font-medium text-xs px-2 py-1 border border-blue-300 rounded hover:bg-blue-50"
                              title="Copy referral URL"
                            >
                              {copiedAffiliateId === a.id ? '✓ Copied' : 'Copy'}
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(a.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs rounded ${
                            a.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : a.status === 'suspended'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {a.status}
                      </span>
                    </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{primaryOffer}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatCurrency(a.stats.revenue, a.stats.currency)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{a.stats.orders}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {a.stats.aov > 0 ? formatCurrency(a.stats.aov, a.stats.currency) : '—'}
                    </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{a.stats.pending_conversions}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button
                          type="button"
                          onClick={() => startEdit(a)}
                          className="text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Edit
                      </button>
                      <button
                          type="button"
                          onClick={() => handleDelete(a.id)}
                          className="text-red-600 hover:text-red-800 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
