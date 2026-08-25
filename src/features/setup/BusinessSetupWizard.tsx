import React, { useState } from 'react';
import { Store, Coins, CheckCircle, ArrowRight, ArrowLeft, Sparkles, Building2, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useBusiness } from '../../contexts/BusinessContext';
import { motion, AnimatePresence } from 'motion/react';

const CURRENCIES = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee (₹)' },
  { code: 'USD', symbol: '$', name: 'US Dollar ($)' },
  { code: 'EUR', symbol: '€', name: 'Euro (€)' },
  { code: 'GBP', symbol: '£', name: 'British Pound (£)' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham (AED)' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar (CA$)' },
  { code: 'AUD', symbol: 'AU$', name: 'Australian Dollar (AU$)' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar (S$)' },
];

const BUSINESS_TYPES = [
  'Retail Store',
  'Grocery / Supermarket',
  'Wholesale Trader',
  'Services & Consulting',
  'Electronics & Hardware',
  'Restaurant & Cafe',
  'Pharmacy / Medical',
  'Garments & Apparel',
  'Manufacturing / Workshop',
  'Other Business',
];

export const BusinessSetupWizard: React.FC = () => {
  const { createBusiness, deviceId } = useBusiness();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState('Retail Store');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [currencyCode, setCurrencyCode] = useState('INR');
  const [currencySymbol, setCurrencySymbol] = useState('₹');
  const [financialYearStart, setFinancialYearStart] = useState('04-01');
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);

  // Validation
  const [nameError, setNameError] = useState('');

  const handleNextToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError('Business name is required to continue.');
      return;
    }
    setNameError('');
    setStep(2);
  };

  const handleCurrencySelect = (code: string, symbol: string) => {
    setCurrencyCode(code);
    setCurrencySymbol(symbol);
  };

  const handleCompleteSetup = async () => {
    try {
      setIsSubmitting(true);
      await createBusiness({
        businessId: '', // will be set in repository
        name: name.trim(),
        type,
        currencyCode,
        currencySymbol,
        financialYearStart,
        paymentTermsDays,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
      });
    } catch (err) {
      console.error('Failed to setup business', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100">
      {/* Background ambient accents */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl">
        {/* Top Header Badge */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Business Setup</h1>
              <p className="text-xs text-slate-400">Local-first business manager</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              Step {step} of 3
            </span>
          </div>
        </div>

        {/* Progress indicator bar */}
        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-8">
          <div
            className="bg-blue-500 h-full transition-all duration-300 ease-out"
            style={{ width: step === 1 ? '33%' : step === 2 ? '66%' : '100%' }}
          />
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <h2 className="text-xl font-bold text-white mb-2">Business Identity</h2>
              <p className="text-sm text-slate-400 mb-6">
                Tell us about your business. All data is saved securely on this device.
              </p>

              <form onSubmit={handleNextToStep2} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Business Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Ramesh General Store, Apex Services"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (nameError) setNameError('');
                    }}
                    className={`w-full min-h-[46px] px-4 py-2.5 rounded-xl border bg-slate-800/80 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      nameError ? 'border-rose-500' : 'border-slate-700 hover:border-slate-600'
                    }`}
                  />
                  {nameError && <p className="text-xs text-rose-400 mt-1">{nameError}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Business Category</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {BUSINESS_TYPES.map((t) => (
                      <option key={t} value={t} className="bg-slate-900 text-white">
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Phone Number (Optional)</label>
                    <input
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800/80 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email (Optional)</label>
                    <input
                      type="email"
                      placeholder="business@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800/80 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="pt-6 flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-500 text-white font-semibold"
                    icon={ArrowRight}
                    iconPosition="right"
                  >
                    Continue to Preferences
                  </Button>
                </div>
              </form>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <h2 className="text-xl font-bold text-white mb-2">Currency & Preferences</h2>
              <p className="text-sm text-slate-400 mb-6">
                Choose the default currency symbol and billing terms for invoices.
              </p>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2.5">
                    Select Default Currency
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {CURRENCIES.map((c) => {
                      const isSelected = currencyCode === c.code;
                      return (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => handleCurrencySelect(c.code, c.symbol)}
                          className={`p-3 rounded-xl text-left border transition-all flex flex-col gap-1 ${
                            isSelected
                              ? 'bg-blue-600/20 border-blue-500 text-white ring-1 ring-blue-500'
                              : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                          }`}
                        >
                          <span className="text-lg font-bold text-blue-400">{c.symbol}</span>
                          <span className="text-xs font-semibold">{c.code}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Financial Year Start
                    </label>
                    <select
                      value={financialYearStart}
                      onChange={(e) => setFinancialYearStart(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800/80 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="04-01" className="bg-slate-900">April 1st (Standard)</option>
                      <option value="01-01" className="bg-slate-900">January 1st (Calendar)</option>
                      <option value="07-01" className="bg-slate-900">July 1st</option>
                      <option value="10-01" className="bg-slate-900">October 1st</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Default Credit Terms (Days)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={paymentTermsDays}
                      onChange={(e) => setPaymentTermsDays(Number(e.target.value) || 0)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800/80 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="pt-6 flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep(1)}
                    className="text-slate-300 hover:text-white"
                    icon={ArrowLeft}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    onClick={() => setStep(3)}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-semibold"
                    icon={ArrowRight}
                    iconPosition="right"
                  >
                    Review & Complete
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-400 mx-auto mb-3">
                  <CheckCircle className="w-7 h-7" />
                </div>
                <h2 className="text-xl font-bold text-white">Ready to Start!</h2>
                <p className="text-sm text-slate-400">
                  Your business profile is prepared for offline operations.
                </p>
              </div>

              <div className="bg-slate-800/60 rounded-2xl p-5 border border-slate-700/80 space-y-3 mb-6">
                <div className="flex justify-between items-center text-sm pb-2 border-b border-slate-700/50">
                  <span className="text-slate-400">Business Name</span>
                  <span className="font-bold text-white">{name}</span>
                </div>
                <div className="flex justify-between items-center text-sm pb-2 border-b border-slate-700/50">
                  <span className="text-slate-400">Category</span>
                  <span className="text-slate-200">{type}</span>
                </div>
                <div className="flex justify-between items-center text-sm pb-2 border-b border-slate-700/50">
                  <span className="text-slate-400">Currency</span>
                  <span className="font-bold text-blue-400">{currencySymbol} ({currencyCode})</span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-400 pt-1">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Device ID
                  </span>
                  <span className="font-mono text-slate-300">{deviceId.substring(0, 18)}...</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(2)}
                  className="text-slate-300 hover:text-white"
                  icon={ArrowLeft}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  isLoading={isSubmitting}
                  onClick={handleCompleteSetup}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 shadow-lg shadow-emerald-950/50"
                  icon={Sparkles}
                >
                  Launch My Business
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
