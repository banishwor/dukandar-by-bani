import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  prefixElement?: React.ReactNode;
  suffixElement?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, prefixElement, suffixElement, id, className = '', ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-slate-700 tracking-wide">
            {label}
            {props.required && <span className="text-rose-500 ml-0.5">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          {prefixElement && (
            <div className="absolute left-3.5 flex items-center pointer-events-none text-slate-400 text-sm font-medium">
              {prefixElement}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium transition-all focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:border-blue-600 ${
              props.type === 'number' || props.inputMode === 'decimal' ? 'tabular-nums font-mono' : ''
            } ${prefixElement ? 'pl-9' : ''} ${suffixElement ? 'pr-9' : ''} ${
              error ? 'border-rose-400 focus-visible:border-rose-500 focus-visible:ring-rose-200' : 'border-slate-200/90 hover:border-slate-300'
            } ${className}`}
            {...props}
          />
          {suffixElement && (
            <div className="absolute right-3.5 flex items-center text-slate-400 text-sm">
              {suffixElement}
            </div>
          )}
        </div>
        {error ? (
          <p className="text-xs font-medium text-rose-600 mt-0.5">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-slate-500">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
