// 로그인 페이지 — 실제 /api/auth/login 으로 인증하고 원래 경로 또는 거래 화면으로 이동
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { SocialLoginButtons } from '../components/SocialLoginButtons'
import { Button } from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import { useAuth } from '../auth/AuthContext'
import { toUserMessage } from '../lib/errorMessages'

interface LocationState {
  from?: string
  /** 이메일 변경 등으로 세션이 끊겨 강제 재로그인이 필요할 때 이유를 전달한다. */
  notice?: string
}

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as LocationState | null
  const from = state?.from ?? '/trade'
  const notice = state?.notice

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate(from, { replace: true })
    } catch (err) {
      // 이 화면에서는 401 이 "다시 로그인" 이 아니라 자격 증명 오류다.
      setError(
        toUserMessage(err, { UNAUTHORIZED: '이메일 또는 비밀번호가 올바르지 않습니다.' }),
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="다시 오신 걸 환영합니다"
      subtitle="이메일로 로그인하고 계좌와 매매 기록을 확인하세요."
      aside={<LoginAside />}
      footer={
        <>
          아직 계정이 없으신가요?{' '}
          <Link to="/signup" className="font-medium text-brand hover:underline">
            회원가입
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {notice && (
          <div className="rounded-2xl border border-brand/25 bg-brand-soft/50 px-4 py-3 text-sm text-brand">
            {notice}
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}
        <Field
          label="이메일"
          name="email"
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={update('email')}
          autoComplete="email"
        />
        <Field
          label="비밀번호"
          name="password"
          type="password"
          placeholder="비밀번호"
          value={form.password}
          onChange={update('password')}
          autoComplete="current-password"
        />
        <Button type="submit" size="lg" withIcon disabled={loading} className="w-full">
          {loading ? '로그인 중…' : '로그인'}
        </Button>
      </form>
      <div className="mt-6">
        <SocialLoginButtons />
      </div>
    </AuthLayout>
  )
}

function LoginAside() {
  return (
    <div>
      <h2 className="font-display text-3xl font-semibold leading-tight text-ink">
        오늘 다시 흐르는
        <br />
        지난 거래일의 시세
      </h2>
      <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted">
        실제 거래일 분봉을 실시간으로 재생하는 시세로 시장가 모의매매를 하고, 체결 내역과 계좌
        수익률을 확인하고, 커뮤니티에서 판단을 나눠 보세요.
      </p>
    </div>
  )
}
