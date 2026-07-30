// 회원가입 페이지 — 입력 검증 후 계좌 자동생성(1,000만원) mock 가입 처리
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { SocialLogin } from '../components/SocialLogin'
import { Button } from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import { Check } from '../components/ui/icons'
import { useAuth } from '../auth/AuthContext'

interface Errors {
  email?: string
  nickname?: string
  password?: string
  confirm?: string
  agree?: string
  form?: string
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', nickname: '', password: '', confirm: '' })
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [loading, setLoading] = useState(false)

  const update = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const validate = (): Errors => {
    const next: Errors = {}
    if (!emailRe.test(form.email)) next.email = '올바른 이메일 형식이 아닙니다.'
    if (form.nickname.trim().length < 2) next.nickname = '닉네임은 2자 이상이어야 합니다.'
    if (form.password.length < 8) next.password = '비밀번호는 8자 이상이어야 합니다.'
    if (form.confirm !== form.password) next.confirm = '비밀번호가 일치하지 않습니다.'
    if (!agree) next.agree = '약관에 동의해야 가입할 수 있습니다.'
    return next
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    try {
      await signup({ email: form.email, nickname: form.nickname, password: form.password })
      navigate('/rankings')
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : '가입 중 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="투자 기록을 시작하세요"
      subtitle="가입하면 주식·코인 계좌가 각각 생성되고 시드머니 1,000만원이 지급됩니다."
      aside={<SignupAside />}
      footer={
        <>
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="font-medium text-brand hover:underline">
            로그인
          </Link>
        </>
      }
    >
      <SocialLogin mode="signup" showDivider={false} />

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-muted">또는 이메일로 가입</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {errors.form && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {errors.form}
          </div>
        )}
        <Field
          label="이메일"
          name="email"
          type="email"
          placeholder="you@investory.app"
          value={form.email}
          onChange={update('email')}
          error={errors.email}
          autoComplete="email"
        />
        <Field
          label="닉네임"
          name="nickname"
          placeholder="랭킹에 표시될 이름"
          value={form.nickname}
          onChange={update('nickname')}
          error={errors.nickname}
        />
        <Field
          label="비밀번호"
          name="password"
          type="password"
          placeholder="8자 이상"
          value={form.password}
          onChange={update('password')}
          error={errors.password}
          autoComplete="new-password"
        />
        <Field
          label="비밀번호 확인"
          name="confirm"
          type="password"
          placeholder="다시 한번 입력"
          value={form.confirm}
          onChange={update('confirm')}
          error={errors.confirm}
          autoComplete="new-password"
        />

        <label className="flex items-start gap-3 pt-1">
          <button
            type="button"
            onClick={() => setAgree((v) => !v)}
            className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-md border transition-colors ${
              agree ? 'border-brand bg-brand text-white' : 'border-line bg-white'
            }`}
            aria-pressed={agree}
          >
            {agree && <Check width={13} height={13} />}
          </button>
          <span className="text-sm text-muted">
            <span className="text-ink">이용약관</span> 및{' '}
            <span className="text-ink">개인정보 처리방침</span>에 동의합니다. 본 서비스는 가상 자산
            기반 모의투자 교육 도구입니다.
          </span>
        </label>
        {errors.agree && <p className="text-xs text-rose-500">{errors.agree}</p>}

        <Button type="submit" size="lg" withIcon disabled={loading} className="w-full">
          {loading ? '계좌 생성 중…' : '가입하고 계좌 받기'}
        </Button>
      </form>
    </AuthLayout>
  )
}

function SignupAside() {
  return (
    <div>
      <h2 className="font-display text-3xl font-semibold leading-tight text-white">
        기록하는 투자자만
        <br />
        복기할 수 있습니다
      </h2>
      <ul className="mt-8 space-y-4">
        {[
          '주식·코인 계좌 각 1,000만원 지급',
          '매매마다 근거·메모로 투자일기 작성',
          'AI가 습관을 분석해 주간 리포트 제공',
        ].map((t) => (
          <li key={t} className="flex items-center gap-3 text-white/80">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white/15">
              <Check width={14} height={14} />
            </span>
            <span className="text-sm">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
