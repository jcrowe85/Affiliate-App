'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FaDollarSign, 
  FaChartLine, 
  FaStar, 
  FaShieldAlt, 
  FaRecycle, 
  FaHandshake,
  FaCheck,
  FaArrowRight,
  FaEnvelope,
  FaLock,
  FaUser,
  FaBuilding,
  FaPhone,
  FaMapMarkerAlt
} from 'react-icons/fa';

export default function AffiliateSignupPage() {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
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
    password: '',
    confirm_password: '',
  });

  const scrollToForm = () => {
    setShowForm(true);
    setTimeout(() => {
      const formElement = document.getElementById('signup-form');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/affiliate-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          source: 'Public Signup Page',
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/affiliate/login');
        }, 3000);
      } else {
        setError(data.error || 'Failed to create account. Please try again.');
      }
    } catch (err: any) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#120d0a] text-white relative overflow-hidden">
      {/* Background Pattern */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: 'url(/images/fleur-pattern.svg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Hero Section */}
      <section className="relative z-10 pt-24 pb-16 px-6 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <FaHandshake className="text-3xl text-white" />
            </div>
            <h1 className="text-5xl md:text-6xl font-semibold mb-4 text-white">
              Partner with Fleur & Blossom
            </h1>
            <p className="text-xl md:text-2xl text-white/75 max-w-2xl mx-auto leading-relaxed">
              Unlock unparalleled earning potential with our industry-leading affiliate program. High payouts, recurring revenue, and a brand customers love.
            </p>
          </div>
          <button
            onClick={scrollToForm}
            className="inline-flex items-center justify-center h-14 px-8 bg-white text-black font-semibold rounded-full hover:opacity-90 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            Join Our Affiliate Program
            <FaArrowRight className="ml-2" size={18} />
          </button>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="relative z-10 py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold text-center mb-12 text-white">
            Why Partner With Us?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* High Initial Payouts */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:bg-white/8 transition-all">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-6">
                <FaDollarSign className="text-3xl text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4 text-white">High Initial Payouts (CPL)</h3>
              <p className="text-white/75 leading-relaxed">
                Start earning immediately with competitive Cost Per Lead (CPL) commissions. We value your traffic and pay generously for quality leads.
              </p>
            </div>

            {/* Recurring Revenue */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:bg-white/8 transition-all">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-6">
                <FaRecycle className="text-3xl text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4 text-white">Recurring Revenue (Rebills)</h3>
              <p className="text-white/75 leading-relaxed">
                Benefit from our subscription-based products. Drive a customer once, and earn residuals on their recurring payments for months or even years!
              </p>
            </div>

            {/* Industry-Leading Offers */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:bg-white/8 transition-all">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-6">
                <FaStar className="text-3xl text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4 text-white">Industry-Leading Offers</h3>
              <p className="text-white/75 leading-relaxed">
                Promote products that convert. Our offers are meticulously crafted, tested, and optimized to ensure maximum success for our partners.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold text-center mb-12 text-white">
            What You Get
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 text-center">
              <FaChartLine className="text-4xl text-white mx-auto mb-4" />
              <h4 className="text-lg font-semibold mb-2 text-white">Real-Time Tracking</h4>
              <p className="text-white/75 text-sm">Monitor your clicks, conversions, and earnings instantly.</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 text-center">
              <FaHandshake className="text-4xl text-white mx-auto mb-4" />
              <h4 className="text-lg font-semibold mb-2 text-white">Dedicated Support</h4>
              <p className="text-white/75 text-sm">Access to a dedicated affiliate manager to help you succeed.</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 text-center">
              <FaShieldAlt className="text-4xl text-white mx-auto mb-4" />
              <h4 className="text-lg font-semibold mb-2 text-white">Fraud Protection</h4>
              <p className="text-white/75 text-sm">Robust systems to ensure fair play and protect your earnings.</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 text-center">
              <FaDollarSign className="text-4xl text-white mx-auto mb-4" />
              <h4 className="text-lg font-semibold mb-2 text-white">Timely Payouts</h4>
              <p className="text-white/75 text-sm">Reliable and on-time payments directly to your preferred method.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-semibold mb-6 text-white">
            Ready to Boost Your Income?
          </h2>
          <p className="text-xl md:text-2xl mb-10 text-white/75 max-w-2xl mx-auto">
            Join a network of successful partners promoting high-demand products.
          </p>
          <button
            onClick={scrollToForm}
            className="inline-flex items-center justify-center h-14 px-8 bg-white text-black font-semibold rounded-full hover:opacity-90 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            Sign Up Now
            <FaArrowRight className="ml-2" size={18} />
          </button>
        </div>
      </section>

      {/* Signup Form Section */}
      <section id="signup-form" className={`relative z-10 py-16 px-6 transition-opacity ${showForm ? 'opacity-100' : 'opacity-0'}`}>
        <div className="max-w-3xl mx-auto">
          {success ? (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-12 text-center">
              <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <FaCheck className="text-4xl text-white" />
              </div>
              <h2 className="text-3xl font-semibold mb-4 text-white">Application Submitted!</h2>
              <p className="text-lg text-white/75 mb-6">
                We will review your details and get back to you shortly. Redirecting to login...
              </p>
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-white/20 border-t-white"></div>
            </div>
          ) : (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 md:p-12">
              <h2 className="text-3xl font-semibold mb-2 text-center text-white">
                Affiliate Partnership Application
              </h2>
              <p className="text-center text-white/75 mb-8">Fill out the form below to get started</p>

              {error && (
                <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-200 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Personal Information */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Personal Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-2">First Name *</label>
                      <div className="relative">
                        <FaUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60" size={16} />
                        <input
                          type="text"
                          required
                          value={formData.first_name}
                          onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30"
                          placeholder="John"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-2">Last Name *</label>
                      <div className="relative">
                        <FaUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60" size={16} />
                        <input
                          type="text"
                          required
                          value={formData.last_name}
                          onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30"
                          placeholder="Doe"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-white/90 mb-2">Company (Optional)</label>
                    <div className="relative">
                      <FaBuilding className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60" size={16} />
                      <input
                        type="text"
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30"
                        placeholder="Company Name"
                      />
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Contact Information</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-2">Email Address *</label>
                      <div className="relative">
                        <FaEnvelope className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60" size={16} />
                        <input
                          type="email"
                          required
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30"
                          placeholder="john@example.com"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-2">PayPal Email (Optional)</label>
                      <div className="relative">
                        <FaEnvelope className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60" size={16} />
                        <input
                          type="email"
                          value={formData.paypal_email}
                          onChange={(e) => setFormData({ ...formData, paypal_email: e.target.value })}
                          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30"
                          placeholder="For payouts (can be same as email above)"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-2">Phone Number (Optional)</label>
                      <div className="relative">
                        <FaPhone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60" size={16} />
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30"
                          placeholder="(555) 123-4567"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Address (Optional)</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-2">Address Line 1</label>
                      <div className="relative">
                        <FaMapMarkerAlt className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60" size={16} />
                        <input
                          type="text"
                          value={formData.address_line1}
                          onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30"
                          placeholder="123 Main St"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-2">Address Line 2</label>
                      <input
                        type="text"
                        value={formData.address_line2}
                        onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                        className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30"
                        placeholder="Apt, Suite, etc."
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2">City</label>
                        <input
                          type="text"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30"
                          placeholder="City"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2">State</label>
                        <input
                          type="text"
                          value={formData.state}
                          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                          className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30"
                          placeholder="State"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2">ZIP Code</label>
                        <input
                          type="text"
                          value={formData.zip}
                          onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                          className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30"
                          placeholder="12345"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Password */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Account Password</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-2">Password *</label>
                      <div className="relative">
                        <FaLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60" size={16} />
                        <input
                          type="password"
                          required
                          minLength={8}
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30"
                          placeholder="Minimum 8 characters"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-2">Confirm Password *</label>
                      <div className="relative">
                        <FaLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60" size={16} />
                        <input
                          type="password"
                          required
                          minLength={8}
                          value={formData.confirm_password}
                          onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
                          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/15 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30"
                          placeholder="Confirm your password"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 bg-white text-black font-semibold rounded-full hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-black border-t-transparent mr-2"></div>
                      Creating Account...
                    </span>
                  ) : (
                    <>
                      Apply Now
                      <FaArrowRight className="ml-2" size={18} />
                    </>
                  )}
                </button>

                <p className="text-sm text-white/60 text-center">
                  By creating an account, you agree to our terms of service and privacy policy.
                  Your account will be reviewed and activated within 24-48 hours.
                </p>
              </form>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 bg-black/20 backdrop-blur-sm border-t border-white/10 py-8 text-center">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-white/60">&copy; {new Date().getFullYear()} Fleur & Blossom. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
