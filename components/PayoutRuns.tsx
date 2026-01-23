'use client';

import { useState, useEffect } from 'react';

interface PayoutRun {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  payout_reference: string | null;
  commission_count: number;
  created_at: string;
  updated_at: string;
}

export default function PayoutRuns() {
  const [payoutRuns, setPayoutRuns] = useState<PayoutRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    period_start: '',
    period_end: '',
    commission_ids: [] as string[],
  });
  const [eligibileCommissions, setEligibileCommissions] = useState<any[]>([]);

  useEffect(() => {
    fetchPayoutRuns();
    fetchEligibleCommissions();
  }, []);

  const fetchPayoutRuns = async () => {
    try {
      const res = await fetch('/api/admin/payout-runs');
      const data = await res.json();
      setPayoutRuns(data.payoutRuns || []);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching payout runs:', err);
      setLoading(false);
    }
  };

  const fetchEligibleCommissions = async () => {
    try {
      const res = await fetch('/api/admin/commissions/pending');
      const data = await res.json();
      // Filter for eligible commissions only
      const eligible = (data.commissions || []).filter((c: any) => 
        c.status === 'eligible' || c.status === 'approved'
      );
      setEligibileCommissions(eligible);
    } catch (err) {
      console.error('Error fetching eligible commissions:', err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.commission_ids.length === 0) {
      alert('Please select at least one commission');
      return;
    }
    
    try {
      const res = await fetch('/api/admin/payout-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchPayoutRuns();
        await fetchEligibleCommissions();
        setShowCreateForm(false);
        setFormData({ period_start: '', period_end: '', commission_ids: [] });
        alert('Payout run created successfully!');
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Error creating payout run:', err);
      alert('Failed to create payout run');
    }
  };

  const handleExport = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/payout-runs/${id}/export`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payout_run_${id}_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Failed to export payout run');
      }
    } catch (err) {
      console.error('Error exporting payout run:', err);
      alert('Failed to export payout run');
    }
  };

  const handleApprove = async (id: string) => {
    if (!confirm('Are you sure you want to approve this payout run? This will mark all commissions as paid.')) {
      return;
    }

    const payoutReference = prompt('Enter payout reference (optional):');
    
    try {
      const res = await fetch(`/api/admin/payout-runs/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payout_reference: payoutReference || null }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchPayoutRuns();
        await fetchEligibleCommissions();
        alert(`Payout run approved! ${data.paid_count} commissions marked as paid.`);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Error approving payout run:', err);
      alert('Failed to approve payout run');
    }
  };

  const toggleCommission = (commissionId: string) => {
    setFormData(prev => {
      if (prev.commission_ids.includes(commissionId)) {
        return {
          ...prev,
          commission_ids: prev.commission_ids.filter(id => id !== commissionId),
        };
      } else {
        return {
          ...prev,
          commission_ids: [...prev.commission_ids, commissionId],
        };
      }
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: string, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(parseFloat(amount));
  };

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          {showCreateForm ? 'Cancel' : 'Create Payout Run'}
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Create Payout Run</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period Start *
                </label>
                <input
                  type="date"
                  required
                  value={formData.period_start}
                  onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period End *
                </label>
                <input
                  type="date"
                  required
                  value={formData.period_end}
                  onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Commissions ({formData.commission_ids.length} selected)
              </label>
              <div className="border border-gray-300 rounded-md max-h-64 overflow-y-auto">
                {eligibileCommissions.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">No eligible commissions</div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-12">
                          <input
                            type="checkbox"
                            checked={formData.commission_ids.length === eligibileCommissions.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  commission_ids: eligibileCommissions.map((c: any) => c.id),
                                });
                              } else {
                                setFormData({ ...formData, commission_ids: [] });
                              }
                            }}
                            className="rounded"
                          />
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Affiliate</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Eligible Date</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {eligibileCommissions.map((commission: any) => (
                        <tr key={commission.id}>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={formData.commission_ids.includes(commission.id)}
                              onChange={() => toggleCommission(commission.id)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm">
                            {commission.affiliate_name}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm">{commission.order_number}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm font-semibold">
                            {formatCurrency(commission.amount, commission.currency)}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(commission.eligible_date)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              Create Payout Run
            </button>
          </form>
        </div>
      )}

      {/* Payout Runs List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {payoutRuns.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No payout runs yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Commissions</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {payoutRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {formatDate(run.period_start)} - {formatDate(run.period_end)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 text-xs rounded ${
                        run.status === 'approved' ? 'bg-green-100 text-green-800' :
                        run.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{run.commission_count}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {run.payout_reference || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(run.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button
                        onClick={() => handleExport(run.id)}
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                      >
                        Export CSV
                      </button>
                      {run.status === 'draft' && (
                        <button
                          onClick={() => handleApprove(run.id)}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs"
                        >
                          Approve
                        </button>
                      )}
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