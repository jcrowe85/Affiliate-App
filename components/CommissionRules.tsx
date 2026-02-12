'use client';

import { useState, useEffect } from 'react';

interface CommissionRule {
  id: string;
  name: string;
  rule_type: string;
  applies_to: string;
  value: string;
  max_payments: number | null;
  max_months: number | null;
  selling_plan_ids: string[] | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export default function CommissionRules() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    rule_type: 'percentage',
    applies_to: 'one_time',
    value: '',
    max_payments: '',
    max_months: '',
    selling_plan_ids: [] as string[],
    active: true,
  });

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/admin/commission-rules');
      const data = await res.json();
      setRules(data.rules || []);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching rules:', err);
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/commission-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          max_payments: formData.max_payments || null,
          max_months: formData.max_months || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchRules();
        setShowCreateForm(false);
        resetForm();
        alert('Commission rule created successfully!');
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Error creating rule:', err);
      alert('Failed to create commission rule');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    
    try {
      const res = await fetch(`/api/admin/commission-rules/${editingRule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          max_payments: formData.max_payments || null,
          max_months: formData.max_months || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchRules();
        setEditingRule(null);
        resetForm();
        alert('Commission rule updated successfully!');
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Error updating rule:', err);
      alert('Failed to update commission rule');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this commission rule?')) return;
    
    try {
      const res = await fetch(`/api/admin/commission-rules/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchRules();
        alert('Commission rule deleted successfully!');
      } else {
        const data = await res.json();
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Error deleting rule:', err);
      alert('Failed to delete commission rule');
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/admin/commission-rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      });
      if (res.ok) {
        await fetchRules();
      } else {
        alert('Failed to toggle rule status');
      }
    } catch (err) {
      console.error('Error toggling rule:', err);
      alert('Failed to toggle rule status');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      rule_type: 'percentage',
      applies_to: 'one_time',
      value: '',
      max_payments: '',
      max_months: '',
      selling_plan_ids: [],
      active: true,
    });
  };

  const startEdit = (rule: CommissionRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      rule_type: rule.rule_type,
      applies_to: rule.applies_to,
      value: rule.value,
      max_payments: rule.max_payments?.toString() || '',
      max_months: rule.max_months?.toString() || '',
      selling_plan_ids: rule.selling_plan_ids || [],
      active: rule.active,
    });
    setShowCreateForm(true);
  };

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => {
            setShowCreateForm(!showCreateForm);
            setEditingRule(null);
            resetForm();
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          {showCreateForm ? 'Cancel' : 'Create Rule'}
        </button>
      </div>

      {/* Create/Edit Form */}
      {showCreateForm && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">
            {editingRule ? 'Edit Commission Rule' : 'Create New Commission Rule'}
          </h3>
          <form onSubmit={editingRule ? handleUpdate : handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rule Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Standard 10% Commission"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rule Type *
                </label>
                <select
                  required
                  value={formData.rule_type}
                  onChange={(e) => setFormData({ ...formData, rule_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="percentage">Percentage</option>
                  <option value="flat">Flat Fee</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Applies To *
                </label>
                <select
                  required
                  value={formData.applies_to}
                  onChange={(e) => setFormData({ ...formData, applies_to: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="one_time">One-Time Orders</option>
                  <option value="subscription_initial">Subscription Initial</option>
                  <option value="subscription_rebill">Subscription Rebill</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Value * {formData.rule_type === 'percentage' ? '(%)' : '($)'}
                </label>
                <input
                  type="number"
                  required
                  step={formData.rule_type === 'percentage' ? '0.01' : '0.01'}
                  min="0"
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  placeholder={formData.rule_type === 'percentage' ? '10' : '5.00'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {(formData.applies_to === 'subscription_initial' || formData.applies_to === 'subscription_rebill') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Payments (optional)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.max_payments}
                      onChange={(e) => setFormData({ ...formData, max_payments: e.target.value })}
                      placeholder="12"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Stop after N payments</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Months (optional)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.max_months}
                      onChange={(e) => setFormData({ ...formData, max_months: e.target.value })}
                      placeholder="6"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Stop after N months</p>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={formData.active ? 'active' : 'inactive'}
                  onChange={(e) => setFormData({ ...formData, active: e.target.value === 'active' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </button>
          </form>
        </div>
      )}

      {/* Rules List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {rules.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No commission rules yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Applies To</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Limits</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{rule.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm capitalize">{rule.rule_type}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {rule.applies_to.replace(/_/g, ' ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">
                      {rule.rule_type === 'percentage' ? `${rule.value}%` : `$${rule.value}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {rule.max_payments && `Max ${rule.max_payments} payments`}
                      {rule.max_payments && rule.max_months && ', '}
                      {rule.max_months && `Max ${rule.max_months} months`}
                      {!rule.max_payments && !rule.max_months && '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 text-xs rounded ${
                        rule.active ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300'
                      }`}>
                        {rule.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button
                        onClick={() => startEdit(rule)}
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(rule.id, rule.active)}
                        className={`px-3 py-1 rounded text-xs ${
                          rule.active
                            ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {rule.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}