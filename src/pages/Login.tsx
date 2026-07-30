// 로그인 페이지 — mock 인증 후 원래 경로 또는 랭킹으로 이동, 데모 계정 안내 포함
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { SocialLogin } from '../components/SocialLogin'
import { Button } from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import { useAuth } from '../auth/AuthContext'

interface LocationState {
  from?: string
}

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as LocationState | null)?.from ?? '/rankings'

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
      setError(err instanceof Error ? err.message : '로그인 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (kind: 'user' | 'admin') => {
    setForm(
      kind === 'user'
        ? { email: 'user@investory.app', password: 'demo1234' }
        : { email: 'admin@investory.app', password: 'admin1234' },
    )
    setError('')
  }

  return (
    <AuthLayout
      title="다시 오신 걸 환영합니다"
      subtitle="이메일로 로그인하고 오늘의 순위와 기록을 확인하세요."
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
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        )}
        <Field
          label="이메일"
          name="email"
          type="email"
          placeholder="you@investory.app"
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

      <SocialLogin mode="login" />

      <div className="mt-6 rounded-2xl border border-line bg-canvas p-4">
        <p className="text-xs font-medium text-ink">데모 계정으로 빠르게 둘러보기</p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => fillDemo('user')}
            className="flex-1 rounded-xl bg-white px-3 py-2 text-xs text-ink ring-1 ring-black/[0.06] transition-all hover:ring-brand/40"
          >
            일반 유저
          </button>
          <button
            onClick={() => fillDemo('admin')}
            className="flex-1 rounded-xl bg-white px-3 py-2 text-xs text-ink ring-1 ring-black/[0.06] transition-all hover:ring-brand/40"
          >
            관리자
          </button>
        </div>
      </div>
    </AuthLayout>
  )
}

function LoginAside() {
  return (
    <div>
      <h2 className="font-display text-3xl font-semibold leading-tight text-white">
        순위는 참고일 뿐,
        <br />
        중요한 건 습관입니다
      </h2>
      <p className="mt-6 max-w-xs text-sm leading-relaxed text-white/70">
        실현손익 랭킹과 미실현까지 포함한 AI 리포트를 나란히 보며, 숫자 뒤에 가려진 투자 습관을
        점검하세요.
      </p>
    </div>
  )
}
