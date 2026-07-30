// 내정보 페이지 — 프로필·주식 계좌 요약·닉네임/이메일 변경·최근 체결 내역·로그아웃
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Field } from '../components/ui/Field'
import { DevCodeNotice } from '../components/DevCodeNotice'
import { Logout } from '../components/ui/icons'
import { useAuth } from '../auth/AuthContext'
import { useInstruments } from '../hooks/useInstruments'
import { getAccountSummary } from '../services/accountService'
import { changeNickname, confirmEmailChange, requestEmailChange } from '../services/authService'
import { getTrades } from '../services/tradeService'
import type { AccountSummary, SignupMethod, Trade } from '../services/types'
import { isApiErrorCode, toUserMessage } from '../lib/errorMessages'
import { formatKRW, formatPercent, pnlTone } from '../lib/format'
import { formatDateTime, ratioToPercent } from '../lib/datetime'
import { sideLabels } from '../lib/labels'

const RECENT_TRADE_LIMIT = 8

const signupMethodLabels: Record<SignupMethod, string> = {
  EMAIL: '이메일 가입',
  KAKAO: '카카오 가입',
  NAVER: '네이버 가입',
}

/** 손익·수익 금액은 양수에도 부호를 붙여 보여준다 (음수 부호는 toLocaleString 이 붙인다). */
function signedKRW(value: number): string {
  return `${value > 0 ? '+' : ''}${formatKRW(value)}`
}

function formatQuantity(value: number): string {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 8 })
}

export function MyPage() {
  const { member, logout, refreshMember } = useAuth()
  const navigate = useNavigate()
  const { index } = useInstruments()

  const [summary, setSummary] = useState<AccountSummary | null>(null)
  const [summaryError, setSummaryError] = useState('')
  const [trades, setTrades] = useState<Trade[] | null>(null)
  const [tradesError, setTradesError] = useState('')

  useEffect(() => {
    let cancelled = false
    // 코인이 제거된 화면이라 두 시장을 합산하는 /api/portfolio 는 쓰지 않는다 (D3).
    getAccountSummary('STOCK')
      .then((s) => {
        if (!cancelled) setSummary(s)
      })
      .catch((e: unknown) => {
        if (!cancelled) setSummaryError(toUserMessage(e))
      })
    getTrades({ market: 'STOCK', limit: RECENT_TRADE_LIMIT })
      .then((page) => {
        if (!cancelled) setTrades(page.content)
      })
      .catch((e: unknown) => {
        if (!cancelled) setTradesError(toUserMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!member) {
    return (
      <div className="min-h-[100dvh] px-4 pb-24 pt-32">
        <p className="mx-auto max-w-3xl text-sm text-muted">회원 정보를 불러오는 중입니다…</p>
      </div>
    )
  }

  const isEmailAccount = member.signupMethod === 'EMAIL'

  const onLogout = async () => {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-[100dvh] px-4 pb-24 pt-32">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* 1. 프로필 */}
        <Card accent="brand" innerClassName="p-8">
          <Eyebrow>내정보</Eyebrow>
          <h1 className="mt-5 font-display text-2xl font-semibold text-ink">
            {member.nickname}님
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{member.email}</span>
            <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand">
              {signupMethodLabels[member.signupMethod]}
            </span>
          </div>
        </Card>

        {/* 2. 주식 계좌 요약 */}
        <Card innerClassName="p-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">주식 계좌 요약</h2>
            <span className="text-xs text-muted">시드머니 1,000만원</span>
          </div>
          {summaryError ? (
            <p className="mt-4 text-sm text-rose-300">{summaryError}</p>
          ) : !summary ? (
            <p className="mt-4 text-sm text-muted">불러오는 중…</p>
          ) : (
            <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="총 평가자산" value={formatKRW(summary.totalValue)} />
              <Stat label="주문가능 현금" value={formatKRW(summary.cashBalance)} />
              <Stat
                label="수익률"
                value={formatPercent(ratioToPercent(summary.returnRate))}
                tone={pnlTone(summary.returnRate)}
              />
              <Stat
                label="평가손익"
                value={signedKRW(summary.unrealizedPnl)}
                tone={pnlTone(summary.unrealizedPnl)}
              />
              <Stat
                label="실현손익"
                value={signedKRW(summary.realizedPnl)}
                tone={pnlTone(summary.realizedPnl)}
              />
            </dl>
          )}
        </Card>

        {/* 3. 닉네임 변경 */}
        <NicknameSection
          isEmailAccount={isEmailAccount}
          currentNickname={member.nickname}
          onChanged={refreshMember}
        />

        {/* 4. 이메일 변경 */}
        <EmailSection isEmailAccount={isEmailAccount} currentEmail={member.email} />

        {/* 5. 최근 체결 내역 */}
        <Card innerClassName="p-8">
          <h2 className="font-display text-lg font-semibold text-ink">최근 체결 내역</h2>
          {tradesError ? (
            <p className="mt-4 text-sm text-rose-300">{tradesError}</p>
          ) : !trades ? (
            <p className="mt-4 text-sm text-muted">불러오는 중…</p>
          ) : trades.length === 0 ? (
            <p className="mt-4 text-sm text-muted">아직 체결된 거래가 없습니다.</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="rounded-l-lg bg-elevated px-3 py-2 font-medium">종목</th>
                    <th className="bg-elevated px-3 py-2 font-medium">구분</th>
                    <th className="bg-elevated px-3 py-2 text-right font-medium">단가</th>
                    <th className="bg-elevated px-3 py-2 text-right font-medium">수량</th>
                    <th className="bg-elevated px-3 py-2 text-right font-medium">거래금액</th>
                    <th className="bg-elevated px-3 py-2 text-right font-medium">수수료</th>
                    <th className="bg-elevated px-3 py-2 text-right font-medium">실현손익</th>
                    <th className="rounded-r-lg bg-elevated px-3 py-2 text-right font-medium">
                      체결시각
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => (
                    <tr key={t.tradeId} className="border-b border-line/60 last:border-0">
                      <td className="px-3 py-3 text-ink">
                        {/* 백엔드 응답에 종목명이 없어 캐시로 조인한다. 캐시 로딩 중에는 id 를 보여준다. */}
                        {index?.byId.get(t.instrumentId)?.name ?? `#${t.instrumentId}`}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            t.side === 'BUY'
                              ? 'bg-gain/15 text-gain'
                              : 'bg-loss/15 text-loss'
                          }`}
                        >
                          {sideLabels[t.side]}
                        </span>
                      </td>
                      <td className="tabular px-3 py-3 text-right text-ink">
                        {formatKRW(t.price)}
                      </td>
                      <td className="tabular px-3 py-3 text-right text-ink">
                        {formatQuantity(t.quantity)}
                      </td>
                      <td className="tabular px-3 py-3 text-right text-ink">
                        {formatKRW(t.amount)}
                      </td>
                      <td className="tabular px-3 py-3 text-right text-muted">
                        {formatKRW(t.fee)}
                      </td>
                      <td
                        className={`tabular px-3 py-3 text-right ${
                          t.realizedPnl === null ? 'text-muted' : pnlTone(t.realizedPnl)
                        }`}
                      >
                        {/* 매수 체결은 실현손익이 null 이다 — 0 으로 보여주면 거짓이 된다. */}
                        {t.realizedPnl === null ? '—' : signedKRW(t.realizedPnl)}
                      </td>
                      <td className="tabular px-3 py-3 text-right text-muted">
                        {formatDateTime(t.executedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 6. 로그아웃 */}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            onClick={() => void onLogout()}
            withIcon
            icon={<Logout width={15} height={15} />}
          >
            로그아웃
          </Button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tabular mt-1 text-lg font-semibold ${tone ?? 'text-ink'}`}>{value}</dd>
    </div>
  )
}

/** 소셜 가입 계정은 reauthToken(OAuth 왕복)이 필요해 구현 범위를 벗어난다 — 폼을 비활성화한다. */
function SocialReauthNotice() {
  return (
    <p className="mt-4 rounded-2xl border border-line bg-elevated px-4 py-3 text-xs leading-relaxed text-muted">
      소셜 가입 계정은 변경 시 소셜 재인증이 필요해 아직 이 화면에서 변경할 수 없습니다.
    </p>
  )
}

function NicknameSection({
  isEmailAccount,
  currentNickname,
  onChanged,
}: {
  isEmailAccount: boolean
  currentNickname: string
  onChanged: () => Promise<void>
}) {
  const [nickname, setNickname] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [error, setError] = useState('')
  const [nicknameError, setNicknameError] = useState('')
  const [done, setDone] = useState('')
  const [pending, setPending] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setNicknameError('')
    setDone('')

    const trimmed = nickname.trim()
    if (trimmed.length < 2 || trimmed.length > 50) {
      setNicknameError('닉네임은 2~50자로 입력해 주세요.')
      return
    }
    if (!currentPassword) {
      setError('현재 비밀번호를 입력해 주세요.')
      return
    }

    setPending(true)
    try {
      await changeNickname({ nickname: trimmed, currentPassword })
      await onChanged()
      setNickname('')
      setCurrentPassword('')
      setDone('닉네임을 변경했습니다.')
    } catch (err) {
      // 이 요청에서 중복될 수 있는 값은 닉네임뿐이므로 필드에 붙인다.
      if (isApiErrorCode(err, 'DUPLICATE_RESOURCE')) {
        setNicknameError('이미 사용 중인 닉네임입니다.')
      } else {
        setError(
          toUserMessage(err, {
            REAUTHENTICATION_FAILED: '현재 비밀번호가 올바르지 않습니다.',
            VALIDATION_ERROR: '닉네임은 2~50자로 입력해 주세요.',
          }),
        )
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <Card innerClassName="p-8">
      <h2 className="font-display text-lg font-semibold text-ink">닉네임 변경</h2>
      <p className="mt-1 text-sm text-muted">
        현재 닉네임은 <span className="text-ink">{currentNickname}</span> 입니다. 커뮤니티 글의
        작성자 이름도 함께 바뀝니다.
      </p>

      {!isEmailAccount ? (
        <SocialReauthNotice />
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
          {error && <p className="text-sm text-rose-300">{error}</p>}
          {done && <p className="text-sm text-brand">{done}</p>}
          <Field
            label="새 닉네임"
            name="newNickname"
            placeholder="2~50자"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={50}
            error={nicknameError}
            /* autoComplete 이 없으면 Chrome 이 [텍스트][비밀번호] 조합을 로그인 폼으로 보고
               이 칸에 저장된 이메일을 자동으로 채운다 (브라우저에서 재현 확인). */
            autoComplete="nickname"
          />
          <Field
            label="현재 비밀번호"
            name="nicknameCurrentPassword"
            type="password"
            placeholder="본인 확인을 위해 필요합니다"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="new-password"
          />
          <Button type="submit" disabled={pending}>
            {pending ? '변경 중…' : '닉네임 변경'}
          </Button>
        </form>
      )}
    </Card>
  )
}

function EmailSection({
  isEmailAccount,
  currentEmail,
}: {
  isEmailAccount: boolean
  currentEmail: string
}) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<'request' | 'confirm'>('request')
  const [newEmail, setNewEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const onRequest = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmed = newEmail.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('이메일 형식이 올바르지 않습니다.')
      return
    }
    if (!currentPassword) {
      setError('현재 비밀번호를 입력해 주세요.')
      return
    }

    setPending(true)
    try {
      await requestEmailChange({ newEmail: trimmed, currentPassword })
      setNewEmail(trimmed)
      setCode('')
      setPhase('confirm')
    } catch (err) {
      setError(
        toUserMessage(err, {
          REAUTHENTICATION_FAILED: '현재 비밀번호가 올바르지 않습니다.',
          DUPLICATE_RESOURCE: '이미 사용 중인 이메일입니다.',
          TOO_MANY_REQUESTS: '인증번호 발송 제한을 초과했습니다. 잠시 후 다시 시도해 주세요.',
          VALIDATION_ERROR: '이메일 형식이 올바르지 않습니다.',
        }),
      )
    } finally {
      setPending(false)
    }
  }

  const onConfirm = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(code)) {
      setError('인증번호는 숫자 6자리입니다.')
      return
    }

    setPending(true)
    try {
      await confirmEmailChange(newEmail, code)
      // 서버가 모든 리프레시 토큰을 폐기해 현재 세션이 죽는다. 먼저 /login 으로 이동해
      // 안내 문구를 넘긴 뒤 세션을 비운다 (순서를 바꾸면 ProtectedRoute 가 문구 없이 튕긴다).
      navigate('/login', {
        replace: true,
        state: {
          notice: '이메일을 변경해 모든 기기에서 로그아웃되었습니다. 새 이메일로 다시 로그인해 주세요.',
        },
      })
      await logout()
    } catch (err) {
      setError(
        toUserMessage(err, {
          EMAIL_VERIFICATION_FAILED: '인증번호가 일치하지 않거나 만료되었습니다. 다시 확인해 주세요.',
          TOO_MANY_REQUESTS: '인증 시도 횟수를 초과했습니다. 처음부터 다시 시도해 주세요.',
          VALIDATION_ERROR: '인증번호는 숫자 6자리입니다.',
        }),
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Card innerClassName="p-8">
      <h2 className="font-display text-lg font-semibold text-ink">이메일 변경</h2>
      <p className="mt-1 text-sm text-muted">
        현재 이메일은 <span className="text-ink">{currentEmail}</span> 입니다. 변경을 완료하면 보안을
        위해 모든 기기에서 로그아웃되고 새 이메일로 다시 로그인해야 합니다.
      </p>

      {!isEmailAccount ? (
        <SocialReauthNotice />
      ) : phase === 'request' ? (
        <form onSubmit={onRequest} noValidate className="mt-5 space-y-4">
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <Field
            label="새 이메일"
            name="newEmail"
            type="email"
            placeholder="new@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            /* 저장된 "현재" 이메일이 자동으로 채워지면 안 된다 — 여기는 바꿀 새 주소다. */
            autoComplete="off"
          />
          <Field
            label="현재 비밀번호"
            name="emailCurrentPassword"
            type="password"
            placeholder="본인 확인을 위해 필요합니다"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            /* current-password 로 두면 Chrome 이 이 폼을 로그인 폼으로 보고 위 칸까지 채운다. */
            autoComplete="new-password"
          />
          <Button type="submit" disabled={pending}>
            {pending ? '발송 중…' : '인증번호 받기'}
          </Button>
        </form>
      ) : (
        <form onSubmit={onConfirm} noValidate className="mt-5 space-y-4">
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <DevCodeNotice />
          <p className="text-sm text-muted">
            <span className="font-medium text-ink">{newEmail}</span> 으로 인증번호를 보냈습니다.
          </p>
          <Field
            label="인증번호 6자리"
            name="emailChangeCode"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoComplete="one-time-code"
            className="tabular tracking-[0.4em]"
          />
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={pending}>
              {pending ? '변경 중…' : '이메일 변경 완료'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setPhase('request')
                setCode('')
                setError('')
              }}
              className="text-sm text-muted transition-colors hover:text-ink"
            >
              이메일 다시 입력
            </button>
          </div>
        </form>
      )}
    </Card>
  )
}
