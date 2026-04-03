import { clsx } from 'clsx';
import { forwardRef } from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          'inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-50',
          {
            'bg-nexus-accent text-nexus-bg hover:bg-nexus-accent/80': variant === 'primary',
            'border border-nexus-border text-nexus-text hover:bg-nexus-bg': variant === 'secondary',
            'text-nexus-dim hover:bg-nexus-bg hover:text-nexus-text': variant === 'ghost',
            'bg-nexus-red text-white hover:bg-nexus-red/80': variant === 'danger',
          },
          {
            'px-2.5 py-1.5 text-xs': size === 'sm',
            'px-4 py-2 text-sm': size === 'md',
            'px-6 py-3 text-base': size === 'lg',
          },
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
