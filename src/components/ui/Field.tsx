// 라벨·에러 메시지를 포함한 폼 입력 필드 (회원가입·로그인 공용)
import type { InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export function Field({ label, error, hint, id, className = '', ...rest }: Props) {
  const fieldId = id ?? rest.name
  return (
    <label htmlFor={fieldId} className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <input
        id={fieldId}
        className={`w-full rounded-2xl border bg-white px-4 py-3 text-[15px] text-ink outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/10 ${
          error ? 'border-rose-400' : 'border-line'
        } ${className}`}
        {...rest}
      />
      {error ? (
        <span className="mt-1.5 block text-xs text-rose-500">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  )
}
