// 회원가입 페이지 — 이메일 인증번호 발송 → 6자리 코드 확인 → 닉네임·비밀번호 3단계 실 API 흐름
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { DevCodeNotice } from '../components/DevCodeNotice'
import { Button } from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import { useAuth } from '../auth/AuthContext'
import { confirmEmailVerification, requestEmailVerification } from '../services/authService'
import { isApiErrorCode, toUserMessage } from '../lib/errorMessages'

/** 백엔드가 재발송 사이에 60초를 강제한다 (추가로 시간당 5회·일 10회 제한). */
const RESEND_COOLDOWN_SECONDS = 60

type Step = 1 | 2 | 3

const stepLabels: Record<Step, string> = {
  1: '이메일 확인',
  2: '인증번호 입력',
  3: '계정 정보',
}

const stepTitles: Record<Step, string> = {
  1: '이메일로 시작하기',
  2: '인증번호를 입력하세요',
  3: '계정 정보를 입력하세요',
}

const stepSubtitles: Record<Step, string> = {
  1: '가입에 사용할 이메일로 6자리 인증번호를 보냅니다.',
  2: '메일로 받은 6자리 숫자를 입력하면 이메일 인증이 끝납니다.',
  3: '닉네임과 비밀번호를 정하면 바로 모의투자를 시작할 수 있습니다.',
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}분 ${String(s).padStart(2, '0')}초`
}

export function Signup() {
  const { signupWithToken } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [token, setToken] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [termsAgreed, setTermsAgreed] = useState(false)

  const [error, setError] = useState('')
  const [nicknameError, setNicknameError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)

  // 재발송 대기 시간과 인증 토큰 남은 시간을 같은 1초 인터벌로 함께 줄인다.
  const [cooldown, setCooldown] = useState(0)
  const [tokenLeft, setTokenLeft] = useState(0)
  const ticking = cooldown > 0 || tokenLeft > 0

  useEffect(() => {
    if (!ticking) return
    const id = window.setInterval(() => {
      setCooldown((s) => (s > 0 ? s - 1 : 0))
      setTokenLeft((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => window.clearInterval(id)
  }, [ticking])

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
      await requestEmailVerification(trimmed)
      setEmail(trimmed)
      setCode('')
      setCooldown(RESEND_COOLDOWN_SECONDS)
      setStep(2)
      if (resend) setNotice('인증번호를 다시 보냈습니다.')
    } catch (err) {
      setError(
        toUserMessage(err, {
          DUPLICATE_RESOURCE: '이미 가입된 이메일입니다. 로그인해 주세요.',
          TOO_MANY_REQUESTS: '인증번호 발송 제한을 초과했습니다. 잠시 후 다시 시도해 주세요.',
          VALIDATION_ERROR: '이메일 형식이 올바르지 않습니다.',
        }),
      )
    } finally {
      setPending(false)
    }
  }

  const onSubmitEmail = (e: FormEvent) => {
    e.preventDefault()
    void sendCode(false)
  }

  const onSubmitCode = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
    if (!/^\d{6}$/.test(code)) {
      setError('인증번호는 숫자 6자리입니다.')
      return
    }
    setPending(true)
    try {
      const res = await confirmEmailVerification(email, code)
      setToken(res.signupVerificationToken)
      setTokenLeft(res.expiresInSeconds)
      setStep(3)
    } catch (err) {
      setError(
        toUserMessage(err, {
          EMAIL_VERIFICATION_FAILED: '인증번호가 일치하지 않거나 만료되었습니다. 다시 확인해 주세요.',
          TOO_MANY_REQUESTS: '인증 시도 횟수를 초과했습니다. 인증번호를 다시 발송해 주세요.',
          VALIDATION_ERROR: '인증번호는 숫자 6자리입니다.',
        }),
      )
    } finally {
      setPending(false)
    }
  }

  const backToEmail = () => {
    setStep(1)
    setCode('')
    setToken('')
    setTokenLeft(0)
    setError('')
    setNotice('')
  }

  const onSubmitAccount = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setNicknameError('')
    setNotice('')

    const trimmedNickname = nickname.trim()
    if (trimmedNickname.length < 2 || trimmedNickname.length > 50) {
      setNicknameError('닉네임은 2~50자로 입력해 주세요.')
      return
    }
    if (password.length < 8 || password.length > 100) {
      setError('비밀번호는 8자 이상 100자 이하로 입력해 주세요.')
      return
    }
    if (password !== passwordConfirm) {
      setError('비밀번호가 서로 일치하지 않습니다.')
      return
    }
    if (!termsAgreed) {
      setError('약관에 동의해야 가입할 수 있습니다.')
      return
    }
    if (!token) {
      backToEmail()
      setError('이메일 인증 정보가 없습니다. 이메일 인증을 다시 진행해 주세요.')
      return
    }

    setPending(true)
    try {
      // 가입 응답이 201 + 토큰이라 이 호출만으로 로그인 상태가 된다.
      await signupWithToken({
        email,
        nickname: trimmedNickname,
        password,
        termsAgreed: true,
        signupVerificationToken: token,
      })
      navigate('/trade', { replace: true })
    } catch (err) {
      // 이메일은 1단계에서 이미 검증됐으므로 이 단계의 중복은 닉네임 중복이다.
      if (isApiErrorCode(err, 'DUPLICATE_RESOURCE')) {
        setNicknameError('이미 사용 중인 닉네임입니다.')
      } else if (isApiErrorCode(err, 'EMAIL_VERIFICATION_REQUIRED')) {
        backToEmail()
        setError('이메일 인증 유효시간(30분)이 지났습니다. 이메일 인증을 다시 진행해 주세요.')
      } else {
        setError(
          toUserMessage(err, {
            VALIDATION_ERROR: '닉네임과 비밀번호 형식을 다시 확인해 주세요.',
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
      <StepIndicator step={step} />

      <div className="mt-6 space-y-4">
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
              hint="이 주소로 6자리 인증번호를 보냅니다."
            />
            <Button type="submit" size="lg" withIcon disabled={pending} className="w-full">
              {pending ? '발송 중…' : '인증번호 받기'}
            </Button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={onSubmitCode} noValidate className="space-y-4">
            <DevCodeNotice />
            <p className="text-sm text-muted">
              <span className="font-medium text-ink">{email}</span> 으로 인증번호를 보냈습니다.
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
            <Button type="submit" size="lg" withIcon disabled={pending} className="w-full">
              {pending ? '확인 중…' : '인증번호 확인'}
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
                {cooldown > 0 ? `재발송 (${cooldown}초 후)` : '인증번호 재발송'}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={onSubmitAccount} noValidate className="space-y-4">
            <p className="text-sm text-muted">
              <span className="font-medium text-ink">{email}</span> 인증이 완료되었습니다.
              {tokenLeft > 0 && (
                <span className="tabular"> 남은 유효시간 {formatCountdown(tokenLeft)}.</span>
              )}
            </p>
            <Field
              label="닉네임"
              name="nickname"
              placeholder="커뮤니티에 표시될 이름"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={50}
              error={nicknameError}
              hint="2~50자"
            />
            <Field
              label="비밀번호"
              name="password"
              type="password"
              placeholder="8자 이상"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Field
              label="비밀번호 확인"
              name="passwordConfirm"
              type="password"
              placeholder="비밀번호를 다시 입력하세요"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
            />
            <label className="flex items-start gap-3 rounded-2xl border border-line bg-elevated px-4 py-3 text-sm text-muted">
              <input
                type="checkbox"
                checked={termsAgreed}
                onChange={(e) => setTermsAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
              />
              <span>
                <span className="text-ink">서비스 이용약관과 개인정보 처리방침에 동의합니다.</span>{' '}
                (필수) 가입하면 각각 시드머니 1,000만원의 모의 주식·코인 계좌가 함께 만들어집니다.
              </span>
            </label>
            <Button type="submit" size="lg" withIcon disabled={pending} className="w-full">
              {pending ? '가입 중…' : '가입하고 시작하기'}
            </Button>
          </form>
        )}
      </div>
    </AuthLayout>
  )
}

function StepIndicator({ step }: { step: Step }) {
  const steps: Step[] = [1, 2, 3]
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s) => {
        const done = s < step
        const active = s === step
        return (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                active
                  ? 'bg-brand text-brand-ink shadow-glow'
                  : done
                    ? 'bg-brand-soft text-brand'
                    : 'bg-white/[0.05] text-muted'
              }`}
            >
              {s}
            </span>
            <span
              className={`truncate text-xs ${active ? 'font-medium text-ink' : 'text-muted'}`}
            >
              {stepLabels[s]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function SignupAside() {
  return (
    <div>
      <h2 className="font-display text-3xl font-semibold leading-tight text-ink">
        실제 거래일 시세로
        <br />
        연습부터 시작하세요
      </h2>
      <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted">
        가입하면 시드머니 1,000만원짜리 모의 주식·코인 계좌가 함께 열립니다. 주식은 실제 거래일
        분봉을 재생한 시세로, 코인은 빗썸 실시간 시세로 시장가 매매를 연습해 보세요.
      </p>
    </div>
  )
}
