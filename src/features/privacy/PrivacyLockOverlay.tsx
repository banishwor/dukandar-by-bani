import React, { useState, useEffect, useRef } from 'react';
import { Lock, ShieldAlert, KeyRound, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { privacyService } from '../../services/privacyService';
import { useBusiness } from '../../contexts/BusinessContext';

interface PrivacyLockOverlayProps {
  isOpen: boolean;
  onUnlock: () => void;
  onResetPin: () => void;
}

export const PrivacyLockOverlay: React.FC<PrivacyLockOverlayProps> = ({
  isOpen,
  onUnlock,
  onResetPin,
}) => {
  const { business } = useBusiness();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  // Recovery Mode State (only accessible after >= 7 failed attempts)
  const [isRecovering, setIsRecovering] = useState(false);
  const [businessNameInput, setBusinessNameInput] = useState('');
  const [recoveryError, setRecoveryError] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setIsRecovering(false);
      setBusinessNameInput('');
      setRecoveryError('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Focus lock input on any click within overlay
  const handleOverlayClick = () => {
    if (!isRecovering) {
      inputRef.current?.focus();
    }
  };

  const handleDigitInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setPin(digits);
    setError('');

    if (digits.length === 4) {
      // Auto-validate immediately upon 4 digits
      const isValid = privacyService.verifyPin(digits);
      if (isValid) {
        setFailedAttempts(0);
        privacyService.setPrivacyActive(false);
        onUnlock();
      } else {
        setFailedAttempts((prev) => prev + 1);
        setIsShaking(true);
        setError('Incorrect PIN. Please try again.');
        setTimeout(() => {
          setPin('');
          setIsShaking(false);
          inputRef.current?.focus();
        }, 600);
      }
    }
  };

  const handleRecoverySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');

    if (privacyService.verifyBusinessNameForReset(business?.name, businessNameInput)) {
      privacyService.clearPin();
      setFailedAttempts(0);
      setIsRecovering(false);
      onResetPin();
    } else {
      setRecoveryError('Store name does not match registered business name.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={handleOverlayClick}
      className="fixed top-0 bottom-0 right-0 left-0 md:left-64 lg:left-72 z-50 backdrop-blur-2xl bg-slate-900/60 flex items-center justify-center p-4 animate-in fade-in duration-300"
    >
      <div
        className={`bg-slate-900/90 border border-slate-700/80 rounded-3xl max-w-sm w-full p-6 sm:p-8 shadow-2xl text-white backdrop-blur-xl relative space-y-6 text-center transition-transform duration-200 ${
          isShaking ? 'translate-x-[-10px] ring-2 ring-rose-500 animate-pulse' : ''
        }`}
      >
        {/* Lock Icon */}
        <div className="flex flex-col items-center space-y-2.5">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">Privacy Mode Active</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Transactions & financial figures are hidden
            </p>
          </div>
        </div>

        {!isRecovering ? (
          <>
            {/* Hidden Input for Keyboard Typing */}
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => handleDigitInput(e.target.value)}
              className="opacity-0 absolute pointer-events-none"
              autoFocus
            />

            {/* 4 Digit Boxes */}
            <div
              onClick={() => inputRef.current?.focus()}
              className="flex items-center justify-center gap-3.5 cursor-pointer py-1"
            >
              {[0, 1, 2, 3].map((idx) => {
                const hasDigit = Boolean(pin[idx]);
                const isCurrent = pin.length === idx;
                return (
                  <div
                    key={idx}
                    className={`w-12 h-14 rounded-2xl border-2 flex items-center justify-center text-2xl font-bold font-mono transition-all ${
                      hasDigit
                        ? 'border-amber-400 bg-amber-400/20 text-amber-300 shadow-sm'
                        : isCurrent
                        ? 'border-blue-400 ring-4 ring-blue-500/30 bg-slate-800'
                        : 'border-slate-700 bg-slate-800/60 text-slate-600'
                    }`}
                  >
                    {hasDigit ? '•' : ''}
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="flex items-center gap-1.5 justify-center text-xs text-rose-400 font-semibold animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* On-Screen Keypad for Mouse / Touchscreen */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDigitInput(pin + digit);
                  }}
                  className="h-11 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:bg-slate-600 text-white font-bold font-mono text-lg border border-slate-700/80 transition-all flex items-center justify-center shadow-xs"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPin('');
                  setError('');
                  inputRef.current?.focus();
                }}
                className="h-11 rounded-2xl bg-slate-800/50 hover:bg-slate-700 text-slate-400 font-semibold text-xs border border-slate-700/60 transition-all flex items-center justify-center"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDigitInput(pin + '0');
                }}
                className="h-11 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:bg-slate-600 text-white font-bold font-mono text-lg border border-slate-700/80 transition-all flex items-center justify-center shadow-xs"
              >
                0
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (pin.length > 0) {
                    handleDigitInput(pin.slice(0, -1));
                  }
                }}
                className="h-11 rounded-2xl bg-slate-800/50 hover:bg-slate-700 text-slate-400 font-semibold text-xs border border-slate-700/60 transition-all flex items-center justify-center"
              >
                ⌫
              </button>
            </div>

            {/* Secret Recovery Link (Only shown after >= 7 failed attempts, no counter shown) */}
            {failedAttempts >= 7 && (
              <div className="pt-2 animate-in fade-in duration-300">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRecovering(true);
                  }}
                  className="text-xs text-slate-400 hover:text-amber-300 underline transition-colors"
                >
                  Forgot PIN? Reset with Store Name
                </button>
              </div>
            )}
          </>
        ) : (
          /* Secret Store Name Verification Box */
          <form onSubmit={handleRecoverySubmit} className="space-y-4 text-left pt-1">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-1">
              <span className="text-xs font-bold text-amber-300 block flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" /> Reset Privacy PIN
              </span>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Enter your exact registered store name to verify ownership and reset your 4-digit PIN.
              </p>
            </div>

            <div>
              <label className="text-xs text-slate-300 font-semibold block mb-1">
                Registered Store Name:
              </label>
              <input
                type="text"
                value={businessNameInput}
                onChange={(e) => setBusinessNameInput(e.target.value)}
                placeholder="e.g. My Business"
                autoFocus
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {recoveryError && (
              <div className="flex items-center gap-1.5 text-xs text-rose-400 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{recoveryError}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsRecovering(false)}
                className="w-1/2 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Back
              </button>
              <button
                type="submit"
                className="w-1/2 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-sm transition-all"
              >
                Verify & Reset
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
