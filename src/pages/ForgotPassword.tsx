// 비밀번호 찾기 페이지 — 이메일로 재설정 코드 발송 → 코드+새 비밀번호로 확정 2단계 실 API 흐름
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { DevCodeNotice } from '../components/DevCodeNotice'
import { Button } from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import { confirmPasswordReset, requestPasswordReset } from '../services/authService'
import { isApiErrorCode, toUserMessage } from '../lib/errorMessages'

/** 백엔드가 재발송 사이에 60초를 강제한다 (추가로 시간당 5회·일 10회 제한). */
const RESEND_COOLDOWN_SECONDS = 60

type Step = 1 | 2

const stepTitles: Record<Step, string> = {
  1: '비밀번호를 잊으셨나요?',
  2: '인증번호와 새 비밀번호를 입력하세요',
}

const stepSubtitles: Record<Step, string> = {
  1: '가입할 때 쓴 이메일로 6자리 재설정 코드를 보냅니다.',
  2: '메일로 받은 6자리 숫자와 새로 쓸 비밀번호를 입력해 주세요.',
}

export function ForgotPassword() {
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)

  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = window.setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => window.clearInterval(id)
  }, [cooldown])

  const sendCode = async (resend: boolean) => {
    setError('')
    setNotice('')
    const trimmed = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('이메일 형식이 올바르지 않습니다.')
      return
    }
    setPending(true)
    try {
      await requestPasswordReset(trimmed)
      setEmail(trimmed)
      setCode('')
      setCooldown(RESEND_COOLDOWN_SECONDS)
      setStep(2)
      if (resend) setNotice('재설정 코드를 다시 보냈습니다.')
    } catch (err) {
      if (isApiErrorCode(err, 'NOT_FOUND')) {
        setError('가입되지 않은 이메일입니다.')
      } else if (isApiErrorCode(err, 'SOCIAL_ACCOUNT_ONLY')) {
        setError('이 이메일은 소셜 로그인 계정이라 비밀번호가 없습니다. 소셜 로그인으로 이용해 주세요.')
      } else {
        setError(
          toUserMessage(err, {
            TOO_MANY_REQUESTS: '재설정 코드 발송 제한을 초과했습니다. 잠시 후 다시 시도해 주세요.',
            VALIDATION_ERROR: '이메일 형식이 올바르지 않습니다.',
          }),
        )
      }
    } finally {
      setPending(false)
    }
  }

  const onSubmitEmail = (e: FormEvent) => {
    e.preventDefault()
    void sendCode(false)
  }

  const backToEmail = () => {
    setStep(1)
    setCode('')
    setNewPassword('')
    setNewPasswordConfirm('')
    setError('')
    setNotice('')
  }

  const onSubmitReset = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')

    if (!/^\d{6}$/.test(code)) {
      setError('인증번호는 숫자 6자리입니다.')
      return
    }
    if (newPassword.length < 8 || newPassword.length > 100) {
      setError('비밀번호는 8자 이상 100자 이하로 입력해 주세요.')
      return
    }
    if (newPassword !== newPasswordConfirm) {
      setError('비밀번호가 서로 일치하지 않습니다.')
      return
    }

    setPending(true)
    try {
      await confirmPasswordReset(email, code, newPassword)
      // 재설정은 항상 전 기기 로그아웃이라 토큰이 오지 않는다 — 세션을 만들지 않고 로그인 화면으로 보낸다.
      navigate('/login', {
        replace: true,
        state: { notice: '비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.' },
      })
    } catch (err) {
      if (isApiErrorCode(err, 'SOCIAL_ACCOUNT_ONLY')) {
        setError('이 이메일은 소셜 로그인 계정이라 비밀번호가 없습니다. 소셜 로그인으로 이용해 주세요.')
      } else {
        setError(
          toUserMessage(err, {
            // 미가입 이메일·코드 불일치·만료·이미 소비됨·재발송으로 무효화된 이전 코드가 전부 같은
            // 코드로 오고 사유가 구분되지 않는다 — 회원가입 인증 확인 실패 문구와 같은 방식으로 뭉뚱그린다.
            EMAIL_VERIFICATION_FAILED: '인증번호가 올바르지 않거나 만료됐습니다. 다시 확인해 주세요.',
            TOO_MANY_REQUESTS: '인증 시도 횟수를 초과했습니다. 재설정 코드를 다시 발송해 주세요.',
            VALIDATION_ERROR: '입력값을 다시 확인해 주세요.',
          }),
        )
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout
      title={stepTitles[step]}
      subtitle={stepSubtitles[step]}
      aside={<ForgotPasswordAside />}
      footer={
        <>
          비밀번호가 기억나셨나요?{' '}
          <Link to="/login" className="font-medium text-brand hover:underline">
            로그인
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-2xl border border-brand/25 bg-brand-soft/50 px-4 py-3 text-sm text-brand">
            {notice}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={onSubmitEmail} noValidate className="space-y-4">
            <Field
              label="이메일"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              hint="이 주소로 6자리 재설정 코드를 보냅니다."
            />
            <Button type="submit" size="lg" withIcon disabled={pending} className="w-full">
              {pending ? '발송 중…' : '재설정 코드 받기'}
            </Button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={onSubmitReset} noValidate className="space-y-4">
            <DevCodeNotice />
            <p className="text-sm text-muted">
              <span className="font-medium text-ink">{email}</span> 으로 재설정 코드를 보냈습니다.
            </p>
            <Field
              label="인증번호 6자리"
              name="code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoComplete="one-time-code"
              className="tabular tracking-[0.4em]"
            />
            <Field
              label="새 비밀번호"
              name="newPassword"
              type="password"
              placeholder="8자 이상"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Field
              label="새 비밀번호 확인"
              name="newPasswordConfirm"
              type="password"
              placeholder="비밀번호를 다시 입력하세요"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              autoComplete="new-password"
            />
            <Button type="submit" size="lg" withIcon disabled={pending} className="w-full">
              {pending ? '변경 중…' : '비밀번호 재설정'}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={backToEmail}
                className="text-muted transition-colors hover:text-ink"
              >
                이메일 다시 입력
              </button>
              <button
                type="button"
                onClick={() => void sendCode(true)}
                disabled={pending || cooldown > 0}
                className="font-medium text-brand transition-opacity hover:underline disabled:text-muted disabled:no-underline"
              >
                {cooldown > 0 ? `재발송 (${cooldown}초 후)` : '재설정 코드 재발송'}
              </button>
            </div>
          </form>
        )}
      </div>
    </AuthLayout>
  )
}

function ForgotPasswordAside() {
  return (
    <div>
      <h2 className="font-display text-3xl font-semibold leading-tight text-ink">
        괜찮아요,
        <br />
        다시 시작하면 됩니다
      </h2>
      <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted">
        가입할 때 쓴 이메일로 재설정 코드를 보내드립니다. 코드를 확인하고 새 비밀번호를 정하면
        모든 기기에서 다시 로그인해야 해요.
      </p>
    </div>
  )
}
