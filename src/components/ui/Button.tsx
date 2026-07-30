// 버튼-인-버튼 트레일링 아이콘과 물리적 프레스 모션을 갖춘 CTA 버튼
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from './icons'

type Variant = 'primary' | 'ghost' | 'soft'
type Size = 'md' | 'lg'

interface CommonProps {
  children: ReactNode
  variant?: Variant
  size?: Size
  withIcon?: boolean
  icon?: ReactNode
  className?: string
}

const variantStyles: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-black',
  soft: 'bg-brand-soft text-brand hover:bg-brand-soft/80',
  ghost: 'bg-white/70 text-ink ring-1 ring-black/[0.06] hover:bg-white',
}

const iconBg: Record<Variant, string> = {
  primary: 'bg-white/15 text-white',
  soft: 'bg-brand/15 text-brand',
  ghost: 'bg-black/5 text-ink',
}

const sizeStyles: Record<Size, string> = {
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3.5 text-[15px]',
}

function inner(children: ReactNode, variant: Variant, withIcon: boolean, icon: ReactNode) {
  return (
    <>
      <span className="font-medium">{children}</span>
      {withIcon && (
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full transition-transform duration-500 ease-spring group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105 ${iconBg[variant]}`}
        >
          {icon ?? <ArrowUpRight width={15} height={15} />}
        </span>
      )}
    </>
  )
}

const shellClass = (
  variant: Variant,
  size: Size,
  withIcon: boolean,
  className: string,
) =>
  [
    'group inline-flex items-center justify-center gap-2 rounded-full',
    'transition-all duration-500 ease-spring active:scale-[0.98]',
    withIcon ? 'pr-2' : '',
    variantStyles[variant],
    sizeStyles[size],
    className,
  ]
    .filter(Boolean)
    .join(' ')

interface ButtonProps
  extends CommonProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> {}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  withIcon = false,
  icon,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button className={shellClass(variant, size, withIcon, className)} {...rest}>
      {inner(children, variant, withIcon, icon)}
    </button>
  )
}

interface LinkButtonProps extends CommonProps {
  to: string
}

export function LinkButton({
  children,
  to,
  variant = 'primary',
  size = 'md',
  withIcon = false,
  icon,
  className = '',
}: LinkButtonProps) {
  return (
    <Link to={to} className={shellClass(variant, size, withIcon, className)}>
      {inner(children, variant, withIcon, icon)}
    </Link>
  )
}
