import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
}) => {
  const variants = {
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
    warning: 'bg-amber-50 text-amber-800 border border-amber-200/60',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200/60',
    info: 'bg-blue-50 text-blue-700 border border-blue-200/60',
    neutral: 'bg-slate-100 text-slate-700 border border-slate-200',
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 rounded-md font-medium tracking-tight whitespace-nowrap',
    md: 'text-xs px-2.5 py-1 rounded-lg font-semibold tracking-tight whitespace-nowrap',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  );
};
