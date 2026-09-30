import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, AlertCircle, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { privacyService } from '../../services/privacyService';

interface CreatePrivacyPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPinCreated: () => void;
}

export const CreatePrivacyPinModal: React.FC<CreatePrivacyPinModalProps> = ({
  isOpen,
  onClose,
  onPinCreated,
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'ENTER' | 'CONFIRM'>('ENTER');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setConfirmPin('');
      setStep('ENTER');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDigitInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setError('');

    if (step === 'ENTER') {
      setPin(digits);
      if (digits.length === 4) {
        // Move to confirm step
        setTimeout(() => {
          setStep('CONFIRM');
          setTimeout(() => inputRef.current?.focus(), 50);
        }, 200);
      }
    } else {
      setConfirmPin(digits);
      if (digits.length === 4) {
        if (digits === pin) {
          privacyService.savePin(digits);
          onPinCreated();
        } else {
          setError('PINs do not match. Please re-enter.');
          setTimeout(() => {
            setConfirmPin('');
            inputRef.current?.focus();
          }, 600);
        }
      }
    }
  };

  const currentVal = step === 'ENTER' ? pin : confirmPin;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 sm:p-7 shadow-2xl border border-slate-100 relative space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shadow-xs">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            {step === 'ENTER' ? 'Create Privacy PIN' : 'Confirm Your PIN'}
          </h2>
          <p className="text-xs text-slate-500 max-w-xs">
            {step === 'ENTER'
              ? 'Set a 4-digit PIN to instantly lock your screen when stepping away from the counter.'
              : 'Re-enter your 4-digit PIN to confirm.'}
          </p>
        </div>

        {/* Hidden Input with Auto-focus */}
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={currentVal}
          onChange={(e) => handleDigitInput(e.target.value)}
          className="opacity-0 absolute pointer-events-none"
          autoFocus
        />

        {/* 4 Digit Boxes */}
        <div
          onClick={() => inputRef.current?.focus()}
          className="flex items-center justify-center gap-3 cursor-pointer py-2"
        >
          {[0, 1, 2, 3].map((idx) => {
            const hasDigit = Boolean(currentVal[idx]);
            const isCurrent = currentVal.length === idx;
            return (
              <div
                key={idx}
                className={`w-12 h-14 rounded-2xl border-2 flex items-center justify-center text-xl font-bold font-mono transition-all ${
                  hasDigit
                    ? 'border-blue-600 bg-blue-50/40 text-blue-900 shadow-2xs'
                    : isCurrent
                    ? 'border-blue-500 ring-4 ring-blue-100 bg-white'
                    : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
              >
                {hasDigit ? '•' : ''}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="flex items-center gap-1.5 justify-center text-xs text-rose-600 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* On-Screen Keypad for Mouse / Touchscreen */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigitInput(currentVal + digit)}
              className="h-11 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-800 font-bold font-mono text-base border border-slate-200/80 transition-all flex items-center justify-center shadow-2xs"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              if (step === 'CONFIRM') {
                setStep('ENTER');
                setConfirmPin('');
                setPin('');
              } else {
                setPin('');
              }
              setError('');
              inputRef.current?.focus();
            }}
            className="h-11 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-500 font-semibold text-xs border border-slate-200/80 transition-all flex items-center justify-center"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleDigitInput(currentVal + '0')}
            className="h-11 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-800 font-bold font-mono text-base border border-slate-200/80 transition-all flex items-center justify-center shadow-2xs"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => {
              if (currentVal.length > 0) {
                handleDigitInput(currentVal.slice(0, -1));
              }
            }}
            className="h-11 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-500 font-semibold text-xs border border-slate-200/80 transition-all flex items-center justify-center"
          >
            ⌫
          </button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Saved 100% locally
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
