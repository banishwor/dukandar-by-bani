import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  fullWidth?: boolean;
  isLoading?: boolean;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      isLoading = false,
      icon: Icon,
      iconPosition = 'left',
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-1 select-none';

    const variants = {
      primary: 'bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-900 shadow-sm',
      secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 focus:ring-slate-400',
      outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-400 shadow-xs',
      ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-300',
      danger: 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-600 shadow-sm',
      success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-600 shadow-sm',
    };

    const sizes = {
      sm: 'text-xs h-9 px-3 rounded-lg gap-1.5 min-h-[36px]',
      md: 'text-sm h-11 px-4 rounded-xl gap-2 min-h-[44px]',
      lg: 'text-base h-12 px-6 rounded-xl gap-2.5 min-h-[48px]',
      icon: 'h-10 w-10 p-0 rounded-xl min-h-[40px] min-w-[40px]',
    };

    const widthClass = fullWidth ? 'w-full' : '';

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${widthClass} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
        ) : Icon && iconPosition === 'left' ? (
          <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />
        ) : null}

        {children}

        {!isLoading && Icon && iconPosition === 'right' ? (
          <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />
        ) : null}
      </button>
    );
  }
);

Button.displayName = 'Button';
