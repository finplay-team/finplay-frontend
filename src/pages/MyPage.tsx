// 내정보 페이지 — 프로필·주식/코인 계좌 요약·닉네임/이메일 변경·최근 체결 내역·로그아웃
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
import type { AccountSummary, Market, NicknameChangeRequest, SignupMethod, Trade } from '../services/types'
import { ApiError } from '../lib/apiClient'
import { isApiErrorCode, toUserMessage } from '../lib/errorMessages'
import { openReauthPopup, providerFromSignupMethod } from '../lib/reauthPopup'
import { formatKRW, formatPercent, pnlTone } from '../lib/format'
import { formatDateTime, ratioToPercent } from '../lib/datetime'
import { sideLabels } from '../lib/labels'

const RECENT_TRADE_LIMIT = 8

/** 화면 순서를 고정한다 — 주식이 먼저다. */
const MARKETS: Market[] = ['STOCK', 'CRYPTO']

/** 응답의 Trade 에는 market 이 없다. 어느 호출에서 왔는지를 붙여 표에서 구분한다. */
type RecentTrade = Trade & { market: Market }

const marketMeta: Record<Market, { label: string; accent: 'brand' | 'coin'; tone: string; chip: string }> = {
  STOCK: {
    label: '주식',
    accent: 'brand',
    tone: 'text-brand',
    chip: 'bg-brand-soft text-brand',
  },
  CRYPTO: {
    label: '코인',
    accent: 'coin',
    tone: 'text-coin',
    chip: 'bg-coin-soft text-coin',
  },
}

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

  // 가입하면 주식·코인 계좌가 함께 생긴다. 한쪽만 보여주면 반대쪽 매매가 이 화면에서 사라진다.
  // 두 시장을 합산하는 /api/portfolio 는 쓰지 않는다 — 계좌는 구조적으로 분리돼 있고
  // 수익률 분모도 계좌마다 1,000만원이라 합산값은 화면의 다른 숫자와 이어지지 않는다.
  const [summaries, setSummaries] = useState<Record<Market, AccountSummary | null>>({
    STOCK: null,
    CRYPTO: null,
  })
  const [summaryErrors, setSummaryErrors] = useState<Record<Market, string>>({
    STOCK: '',
    CRYPTO: '',
  })
  const [trades, setTrades] = useState<RecentTrade[] | null>(null)
  const [tradesError, setTradesError] = useState('')

  useEffect(() => {
    let cancelled = false

    for (const market of MARKETS) {
      getAccountSummary(market)
        .then((s) => {
          if (!cancelled) setSummaries((prev) => ({ ...prev, [market]: s }))
        })
        .catch((e: unknown) => {
          // 한쪽 계좌가 실패해도 반대쪽은 그대로 보여준다.
          if (!cancelled) setSummaryErrors((prev) => ({ ...prev, [market]: toUserMessage(e) }))
        })
    }

    // 체결 내역은 시장별 엔드포인트뿐이라 두 번 부른 뒤 체결시각으로 합친다.
    // 응답의 Trade 에는 market 이 없으므로 어느 호출에서 왔는지로 표시한다.
    Promise.all(
      MARKETS.map((market) =>
        getTrades({ market, limit: RECENT_TRADE_LIMIT }).then((page) =>
          page.content.map((t): RecentTrade => ({ ...t, market })),
        ),
      ),
    )
      .then((pages) => {
        if (cancelled) return
        const merged = pages
          .flat()
          .sort((a, b) => b.executedAt.localeCompare(a.executedAt))
          .slice(0, RECENT_TRADE_LIMIT)
        setTrades(merged)
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

        {/* 2. 계좌 요약 — 주식·코인 두 계좌를 나란히 둔다 (합산하지 않는다) */}
        <section>
          <div className="grid gap-4 md:grid-cols-2">
            {MARKETS.map((market) => (
              <AccountCard
                key={market}
                market={market}
                summary={summaries[market]}
                error={summaryErrors[market]}
              />
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            두 계좌는 완전히 분리돼 있습니다. 시드머니도 수익률 기준도 계좌마다 따로이고, 계좌 사이
            이체는 없습니다.
          </p>
        </section>

        {/* 3. 닉네임 변경 */}
        <NicknameSection
          signupMethod={member.signupMethod}
          currentNickname={member.nickname}
          onChanged={refreshMember}
        />

        {/* 4. 이메일 변경 — OAuth 전용 회원에게는 재인증 팝업 왕복이 아직 없어 칸 자체를 숨긴다
               (finplay-api docs/prd.md AUTH-005, 2026-08-16 결정). 이메일 회원만 이 카드를 본다. */}
        {isEmailAccount && <EmailSection currentEmail={member.email} />}

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
              <table className="w-full min-w-[660px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="rounded-l-lg bg-elevated px-2.5 py-2 font-medium">시장</th>
                    <th className="bg-elevated px-3 py-2 font-medium">종목</th>
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
                    // tradeId 는 시장별로 매겨져 두 시장에서 겹칠 수 있다 → 키에 market 을 붙인다.
                    <tr
                      key={`${t.market}-${t.tradeId}`}
                      className="border-b border-line/60 last:border-0"
                    >
                      <td className="px-3 py-3">
                        <span
                          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${marketMeta[t.market].chip}`}
                        >
                          {marketMeta[t.market].label}
                        </span>
                      </td>
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

/** 한 계좌의 요약 카드. 로딩·오류를 카드 안에서 처리해 반대쪽 계좌에 영향을 주지 않는다. */
function AccountCard({
  market,
  summary,
  error,
}: {
  market: Market
  summary: AccountSummary | null
  error: string
}) {
  const meta = marketMeta[market]
  return (
    <Card accent={meta.accent} className="h-full" innerClassName="flex h-full flex-col p-6 md:p-7">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={`font-display text-lg font-semibold ${meta.tone}`}>{meta.label} 계좌</h2>
        <span className="whitespace-nowrap text-xs text-muted">시드머니 1,000만원</span>
      </div>
      {error ? (
        <p className="mt-4 text-sm text-rose-300">{error}</p>
      ) : !summary ? (
        <dl className="mt-6 grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <div className="skeleton h-2.5 w-16" />
              <div className="skeleton mt-2 h-5 w-24" />
            </div>
          ))}
        </dl>
      ) : (
        <dl className="mt-6 grid grid-cols-2 gap-4">
          <Stat label="총 평가자산" value={formatKRW(summary.totalValue)} />
          <Stat
            label="수익률"
            value={formatPercent(ratioToPercent(summary.returnRate))}
            tone={pnlTone(summary.returnRate)}
          />
          <Stat label="주문가능 현금" value={formatKRW(summary.cashBalance)} />
          <Stat label="보유 평가금액" value={formatKRW(summary.holdingsValue)} />
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
  )
}

const providerLabels: Record<Exclude<SignupMethod, 'EMAIL'>, string> = {
  KAKAO: '카카오',
  NAVER: '네이버',
}

function NicknameSection({
  signupMethod,
  currentNickname,
  onChanged,
}: {
  signupMethod: SignupMethod
  currentNickname: string
  onChanged: () => Promise<void>
}) {
  const isEmailAccount = signupMethod === 'EMAIL'
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
    if (isEmailAccount && !currentPassword) {
      setError('현재 비밀번호를 입력해 주세요.')
      return
    }

    setPending(true)
    try {
      // OAuth 전용 회원은 팝업으로 같은 provider 계정 재인증을 마쳐야 reauthToken을 받는다
      // (finplay-api spec 039) — 이메일 회원의 현재 비밀번호 입력과 같은 자리를 대신한다.
      const request: NicknameChangeRequest = isEmailAccount
        ? { nickname: trimmed, currentPassword }
        : { nickname: trimmed, reauthToken: await openReauthPopup(providerFromSignupMethod(signupMethod)) }
      await changeNickname(request)
      await onChanged()
      setNickname('')
      setCurrentPassword('')
      setDone('닉네임을 변경했습니다.')
    } catch (err) {
      // 이 요청에서 중복될 수 있는 값은 닉네임뿐이므로 필드에 붙인다.
      if (isApiErrorCode(err, 'DUPLICATE_RESOURCE')) {
        setNicknameError('이미 사용 중인 닉네임입니다.')
      } else if (err instanceof ApiError) {
        setError(
          toUserMessage(err, {
            REAUTHENTICATION_FAILED: isEmailAccount
              ? '현재 비밀번호가 올바르지 않습니다.'
              : '재인증에 실패했습니다. 연결된 계정으로 다시 시도해 주세요.',
            VALIDATION_ERROR: '닉네임은 2~50자로 입력해 주세요.',
          }),
        )
      } else if (err instanceof Error) {
        // 재인증 팝업 자체의 실패(차단·닫힘) — 백엔드 오류가 아니라 이 화면에서 만든 메시지다.
        setError(err.message)
      } else {
        setError(toUserMessage(err))
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
        {isEmailAccount ? (
          <Field
            label="현재 비밀번호"
            name="nicknameCurrentPassword"
            type="password"
            placeholder="본인 확인을 위해 필요합니다"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="new-password"
          />
        ) : (
          <p className="text-xs leading-relaxed text-muted">
            변경 버튼을 누르면 {providerLabels[signupMethod]} 재인증 창이 열립니다. 본인 확인을
            위해 필요합니다.
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? '변경 중…' : '닉네임 변경'}
        </Button>
      </form>
    </Card>
  )
}

function EmailSection({ currentEmail }: { currentEmail: string }) {
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

      {phase === 'request' ? (
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
