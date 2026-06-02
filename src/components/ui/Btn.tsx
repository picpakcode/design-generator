import React from 'react'

export type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'indigo'
export type BtnSize = 'sm' | 'md'

const base = 'inline-flex items-center justify-center gap-1.5 font-bold uppercase tracking-widest rounded transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed'

const sizes: Record<BtnSize, string> = {
  sm: 'h-7 px-3 text-[10px]',
  md: 'h-8 px-4 text-[11px]',
}

const variants: Record<BtnVariant, string> = {
  primary:   'bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-700 dark:hover:bg-gray-600',
  secondary: 'border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 bg-white dark:bg-transparent hover:border-gray-400 hover:text-gray-900 dark:hover:border-gray-400 dark:hover:text-gray-200',
  ghost:     'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200',
  indigo:    'bg-indigo-600 text-white hover:bg-indigo-500',
}

export function Btn({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }) {
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export default Btn
