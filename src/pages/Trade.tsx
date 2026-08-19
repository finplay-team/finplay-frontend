// 주식·코인 매매 화면 — 시장 탭으로 전환하며 시세(주식 SSE / 코인 폴링)·캔들·시장가/지정가 주문을 한 화면에서 처리한다
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CandleChart } from '../components/CandleChart'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { HelpTooltip } from '../components/ui/HelpTooltip'
import { MarketTabs } from '../components/ui/MarketTabs'
import { JournalEditor } from '../components/journal/JournalEditor'
import { useCandles } from '../hooks/useCandles'
import { useCryptoPrices } from '../hooks/useCryptoPrices'
import { useIdempotencyKey } from '../hooks/useIdempotencyKey'
import { useInstruments } from '../hooks/useInstruments'
import { useStockStream } from '../hooks/useStockStream'
import { formatDateTime, formatHhMm } from '../lib/datetime'
import { isApiErrorCode, toUserMessage } from '../lib/errorMessages'
import { formatKRW, formatPercent, formatPrice, pnlTone } from '../lib/format'
import { sideLabels } from '../lib/labels'
import { CRYPTO_QTY_DECIMALS, presetQuantity } from '../lib/quantity'
import { getAccountSummary } from '../services/accountService'
import { getHoldings } from '../services/holdingService'
import { placeLimitOrder, placeOrder } from '../services/orderService'
import { PendingOrders } from '../components/trade/PendingOrders'
import { OcoExitPlanPanel } from '../components/trade/OcoExitPlanPanel'
import { CommunityPreview } from '../components/trade/CommunityPreview'
import { DayRangeBar } from '../components/trade/DayRangeBar'
import { QuantityPresets } from '../components/trade/QuantityPresets'
import { useWatchlist } from '../hooks/useWatchlist'
import { Star } from '../components/ui/icons'
import { PriceMoveCards } from '../components/feedback/PriceMoveCards'
import {
  OrderTypeGuideButton,
  OrderTypeGuideDialog,
  hasSeenOrderTypeGuide,
  markOrderTypeGuideSeen,
} from '../components/tutorial/OrderTypeGuide'
import type {
  AccountSummary,
  CandleInterval,
  Holding,
  Instrument,
  LimitOrderResponse,
  Market,
  OrderExecutionResponse,
  OrderSide,
  PriceResponse,
} from '../services/types'

/** 서버 heartbeat 가 20초 주기이므로 이보다 오래 조용하면 정체로 본다. */
const STALE_MS = 40_000
/** 코인 시세·캔들 폴링 주기. 코인은 SSE 가 없다. */
const CRYPTO_POLL_MS = 5_000
/** 코인 계좌·보유는 시세와 달리 자주 바뀌지 않는다 — 더 느리게 다시 읽는다. */
const CRYPTO_ACCOUNT_REFRESH_MS = 15_000

/** 주문 실패 시 화면 문맥에 맞게 덮어쓰는 문구. 백엔드 message 는 쓰지 않고 code 로만 분기한다. */
const ORDER_ERROR_MESSAGES: Record<Market, Record<string, string>> = {
  STOCK: {
    MARKET_CLOSED: '장 시간이 아닙니다 (09:00~15:30). 주문이 접수되지 않았습니다.',
    PRICE_UNAVAILABLE: '현재 이 종목의 시세를 받을 수 없어 주문할 수 없습니다.',
    INSUFFICIENT_CASH: '주문 가능 현금이 부족합니다. 수량을 줄여 주세요.',
    INSUFFICIENT_QTY: '보유 수량이 부족합니다. 보유 수량을 다시 확인해 주세요.',
    IDEMPOTENCY_CONFLICT: '직전 주문과 요청이 충돌했습니다. 주문 내용을 확인하고 다시 시도해 주세요.',
    VALIDATION_ERROR: '주식은 1주 단위 정수만 주문할 수 있습니다. 수량을 확인해 주세요.',
    NOT_FOUND: '종목 또는 계좌를 찾을 수 없습니다.',
  },
  CRYPTO: {
    PRICE_UNAVAILABLE: '지금 이 코인의 시세를 받을 수 없어 주문할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    INSUFFICIENT_CASH: '주문 가능 현금이 부족합니다. 수량을 줄여 주세요.',
    INSUFFICIENT_QTY: '보유 수량이 부족합니다. 보유 수량을 다시 확인해 주세요.',
    IDEMPOTENCY_CONFLICT: '직전 주문과 요청이 충돌했습니다. 주문 내용을 확인하고 다시 시도해 주세요.',
    VALIDATION_ERROR: '주문 수량 형식을 확인해 주세요. 소수점 8자리까지 입력할 수 있습니다.',
    NOT_FOUND: '종목 또는 계좌를 찾을 수 없습니다.',
  },
}

/** 부호를 붙인 정확한 원화 금액. formatPnl 은 만 단위로 축약해 체결 금액 표시에는 쓸 수 없다. */
function signedKRW(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatKRW(Math.abs(value))}`
}

/** 10.00000000 처럼 scale 이 붙어 오는 수량을 불필요한 0 없이 표시한다. */
function formatQty(value: number): string {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 8 })
}

/**
 * 수량 입력창에 넣을 문자열. String(0.00000001) 은 "1e-8" 이 되고 그대로 주문 본문에 실리면
 * 백엔드가 파싱하지 못한다 → 항상 고정 소수로 만든 뒤 꼬리 0 만 지운다.
 */
function toQtyInput(value: number): string {
  return value
    .toFixed(CRYPTO_QTY_DECIMALS)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
}

/** 지정가 입력창에 천단위 콤마를 붙여 보여준다 — 저장값(limitPrice)은 콤마 없는 원본 그대로 둔다. */
function formatPriceInput(raw: string): string {
  if (raw === '') return ''
  const [intPart, frac] = raw.split('.')
  const withCommas = Number(intPart || '0').toLocaleString('ko-KR')
  return frac !== undefined ? `${withCommas}.${frac}` : withCommas
}

/**
 * tone 은 배지 테두리·글자색을 그 시장 자체의 액센트에 맞춘다 — 코인은 앰버, 주식은 파란색
 * (2026-08-18 피드백: 배지가 시장과 상관없이 항상 민트 배경으로 고정돼 있던 것을 고쳤다).
 */
function Pill({
  active = false,
  tone = 'brand',
  children,
}: {
  active?: boolean
  tone?: 'brand' | 'coin'
  children: ReactNode
}) {
  // 코인·주식 배지 둘 다 "빗썸 실시세"에 원래 있던 회색 배경(bg-white/[0.04])을 그대로 채우고,
  // 테두리·글자만 시장 액센트를 쓴다 — 코인은 앰버, 주식은 상태 점과 같은 딥 틸(#0D9488,
  // 브랜드 민트와 같은 hue 를 더 진하게). 2026-08-18 피드백.
  const activeTone =
    tone === 'coin'
      ? 'border border-coin-soft bg-white/[0.04] text-coin'
      : 'border border-[#0D9488] bg-white/[0.04] text-[#2DD4BF]'
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
        active ? activeTone : 'bg-white/[0.04] text-muted ring-1 ring-white/[0.08]'
      }`}
    >
      {children}
    </span>
  )
}

export function Trade() {
  const navigate = useNavigate()
  // 코인이 우선 시장이라 기본 탭도 코인으로 연다(탭 순서도 MarketTabs.tsx에서 코인이 먼저다).
  const [market, setMarket] = useState<Market>('CRYPTO')
  const isCrypto = market === 'CRYPTO'
  // 주식은 브랜드 민트 대신 이 화면 전용 딥 틸 액센트를 쓴다(2026-08-18 피드백) — Card 의 deepTeal accent 참고.
  const accent = isCrypto ? 'coin' : 'deepTeal'

  // 코인 탭에서는 주식 SSE 를 붙잡아 둘 이유가 없다.
  const {
    prices: stockPrices,
    marketStatus,
    sourceTradingDate,
    state: streamState,
    lastMessageAt,
    error: streamError,
  } = useStockStream({ enabled: !isCrypto })
  const { index, loading: instrumentsLoading, error: instrumentsError } = useInstruments()

  // 정체 판정용 시계. lastMessageAt 은 조용해지면 갱신되지 않으므로 별도 tick 이 필요하다.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(timer)
  }, [])

  const instruments = useMemo<Instrument[]>(
    () =>
      index
        ? [...index.byId.values()]
            // 튜토리얼 전용 샘플 종목(031)은 실제 거래 화면에 섞이면 안 된다 — 여기서 항상 제외한다.
            .filter((i) => i.market === market && !i.isTutorialSample)
            .sort((a, b) => a.instrumentId - b.instrumentId)
        : [],
    [index, market],
  )

  const cryptoIds = useMemo(
    () => (isCrypto ? instruments.map((i) => i.instrumentId) : []),
    [instruments, isCrypto],
  )
  const {
    prices: cryptoPrices,
    lastUpdatedAt: cryptoUpdatedAt,
    error: cryptoPriceError,
  } = useCryptoPrices({ instrumentIds: cryptoIds, enabled: isCrypto, pollMs: CRYPTO_POLL_MS })

  const [selectedId, setSelectedId] = useState<number | null>(null)
  // 시장이 바뀌면 앞 시장의 종목 선택은 무효다.
  useEffect(() => {
    setSelectedId(null)
  }, [market])
  useEffect(() => {
    if (selectedId === null && instruments.length > 0) setSelectedId(instruments[0].instrumentId)
  }, [selectedId, instruments])

  const selected = selectedId === null ? null : (index?.byId.get(selectedId) ?? null)
  // 주식 스트림은 instrumentId 가 아니라 symbol 로 키를 잡는다. 코인은 instrumentId 다.
  const snapshot: { price: number | null; sourceTime: string | null; status: string } | undefined =
    selected
      ? isCrypto
        ? (cryptoPrices[selected.instrumentId] as PriceResponse | undefined)
        : stockPrices[selected.symbol]
      : undefined
  // 코인 STALE(연결 유지 + 10초 초과)도 마지막 실제 가격을 그대로 보여준다 — UNAVAILABLE(연결 끊김·수신 이력 없음)만 숨긴다.
  const currentPrice =
    snapshot?.status === 'AVAILABLE' || snapshot?.status === 'STALE' ? snapshot.price : null
  const isStalePrice = snapshot?.status === 'STALE'

  // 주식은 서버 분 크론에만 새 봉이 생긴다 → 분이 넘어갈 때만 재조회한다. 코인은 폴링이다.
  const minuteTick = Math.floor((lastMessageAt ?? 0) / 60_000)
  const [interval, setInterval_] = useState<CandleInterval>('1m')
  /**
   * 차트 박스 안 탭 — 처음엔 변동 원인을 팝업으로 띄웠는데, 이 박스 안에서 차트/변동 원인을
   * 탭으로 바로 전환하는 편이 낫다는 피드백으로 바꿨다(2026-08-19). 종목명·현재가 행은 탭과
   * 무관하게 위에 고정해 둔다.
   */
  const [chartTab, setChartTab] = useState<'chart' | 'priceMoves'>('chart')
  // 코인 ↔ 주식 전환은 종목 자체가 바뀌는 것과 같다 — 변동 원인 탭을 보던 중에 시장을 바꾸면
  // 새 시장에서도 그 탭이 그대로 남아 차트가 안 보이는 버그가 있었다(2026-08-19 피드백).
  useEffect(() => {
    setChartTab('chart')
  }, [market])
  // 차트 옆 세 번째 컬럼 — 주문 패널과 커뮤니티 미리보기를 쌓아 두지 않고 탭으로 전환한다.
  const [rightPanelTab, setRightPanelTab] = useState<'order' | 'community'>('order')
  // 차트/변동 원인 탭과 같은 이유 — 커뮤니티 탭을 보던 중에 시장을 바꾸면 새 시장에서도 그
  // 탭이 그대로 남아 주문 폼이 안 보이는 문제가 있었다(2026-08-19 피드백).
  useEffect(() => {
    setRightPanelTab('order')
  }, [market])
  const {
    candles,
    loading: candlesLoading,
    error: candlesError,
  } = useCandles({
    instrumentId: selectedId,
    market,
    minuteTick,
    pollMs: CRYPTO_POLL_MS,
    interval,
  })

  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [accountNonce, setAccountNonce] = useState(0)

  // 코인은 분 tick 이 없다 — 자체 주기로 계좌·보유를 다시 읽는다.
  const [cryptoAccountTick, setCryptoAccountTick] = useState(0)
  useEffect(() => {
    if (!isCrypto) return
    const timer = setInterval(() => setCryptoAccountTick((n) => n + 1), CRYPTO_ACCOUNT_REFRESH_MS)
    return () => clearInterval(timer)
  }, [isCrypto])

  // 두 계좌는 완전히 분리돼 있다. 새 응답이 오기 전까지 앞 시장의 잔고를 그대로 두면 안 된다.
  useEffect(() => {
    setAccount(null)
    setHoldings(null)
    setAccountError(null)
  }, [market])

  // 잔고는 스트림으로 오지 않는다. 시장 전환·분 경과·주문 성공 직후에 직접 다시 읽는다.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [summary, list] = await Promise.all([getAccountSummary(market), getHoldings(market)])
        if (cancelled) return
        setAccount(summary)
        setHoldings(list)
        setAccountError(null)
      } catch (e) {
        if (!cancelled) setAccountError(toUserMessage(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [market, minuteTick, accountNonce, cryptoAccountTick])

  /**
   * 매도 가능 수량. 서버가 availableQuantity 를 주지 않으므로 예약분을 직접 뺀다 —
   * 지정가 매도로 잠긴 수량은 시장가로 중복 매도할 수 없고 409 INSUFFICIENT_QTY 가 난다.
   */
  const held = useMemo(() => {
    if (!holdings || !selected) return 0
    const holding = holdings.find((h) => h.instrumentId === selected.instrumentId)
    if (!holding) return 0
    const available = holding.quantity - holding.reservedQuantity
    if (available <= 0) return 0
    // 주식은 정수 주만 주문할 수 있고, 코인은 소수 수량 그대로 매도할 수 있다.
    return isCrypto ? available : Math.floor(available)
  }, [holdings, isCrypto, selected])

  /** OCO(손절·익절) 패널이 쓸 해당 holding 전신 — 보유하지 않은 종목은 null이다. */
  const selectedHolding = useMemo(() => {
    if (!holdings || !selected) return null
    return holdings.find((h) => h.instrumentId === selected.instrumentId) ?? null
  }, [holdings, selected])

  const [side, setSide] = useState<OrderSide>('BUY')
  const [quantity, setQuantity] = useState('')
  /** 코인 시장가 매수는 수량이 아니라 금액으로 산다(실제 빗썸도 그렇다) — 이 입력을 quantity 로 환산해 쓴다. */
  const [amountInput, setAmountInput] = useState('')
  /** 지정가는 코인 전용이다 — 주식에 걸면 백엔드가 400 을 낸다. */
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET')
  const [limitPrice, setLimitPrice] = useState('')
  /** 지정가의 "주문 금액" 입력 — 실제 빗썸처럼 주문수량과 서로 연동된다(하나 입력하면 나머지가 계산됨). */
  const [limitAmountInput, setLimitAmountInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [result, setResult] = useState<OrderExecutionResponse | null>(null)
  /** 지정가는 체결이 아니라 접수 결과다 — 시장가 체결 카드와 섞으면 사용자가 체결된 줄 안다. */
  const [limitResult, setLimitResult] = useState<LimitOrderResponse | null>(null)
  /**
   * 매수·매도 체결 직후 "투자일기 작성하러가기" 버튼 상태 — result.tradeId 로 식별한다.
   * 새 주문이 체결되면 result 자체가 바뀌어 tradeId 가 더 이상 일치하지 않으므로 별도 초기화가 필요 없다.
   */
  const [journalTradeId, setJournalTradeId] = useState<number | null>(null)
  const [journalSavedTradeId, setJournalSavedTradeId] = useState<number | null>(null)
  // 성공한 주문의 키를 그대로 재사용하면 서버가 같은 체결을 재생해 두 번째 주문이 조용히 삼켜진다.
  const [successNonce, setSuccessNonce] = useState(0)
  /** 미체결 목록을 즉시 다시 읽게 하는 신호. */
  const [pendingNonce, setPendingNonce] = useState(0)
  /** 손절·익절 OCO 패널 토글 — 기본은 접혀 있다. */
  const [ocoOpen, setOcoOpen] = useState(false)
  /** 미체결 지정가 주문 팝업 — 주문 탭 박스 안 버튼으로 열고, 박스 폭·높이 안에서만 뜬다. */
  const [pendingOrdersOpen, setPendingOrdersOpen] = useState(false)
  useEffect(() => {
    if (!pendingOrdersOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingOrdersOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pendingOrdersOpen])
  // disabled 상태만으로는 빠른 더블클릭이 두 핸들러를 모두 통과한다. 동기 플래그로 한 번 더 막는다.
  const submittingRef = useRef(false)
  /**
   * 시장가·지정가 설명. 주문 유형을 처음 마주하는 브라우저에서 한 번만 자동으로 띄우고,
   * 그 뒤에는 주문 패널의 버튼으로만 연다.
   */
  const [orderTypeGuideOpen, setOrderTypeGuideOpen] = useState(false)
  useEffect(() => {
    if (hasSeenOrderTypeGuide()) return
    setOrderTypeGuideOpen(true)
  }, [])
  const closeOrderTypeGuide = useCallback(() => {
    // 직접 열어 본 경우에도 "봤다"로 남긴다 — 이미 읽은 설명을 나중에 또 자동으로 덮지 않는다.
    markOrderTypeGuideSeen()
    setOrderTypeGuideOpen(false)
  }, [])

  const isLimit = isCrypto && orderType === 'LIMIT'
  /** 코인 시장가 매수만 금액 입력이다 — 매도는 보유 수량 기준이라 그대로 수량 입력을 쓴다. */
  const isAmountMode = isCrypto && !isLimit && side === 'BUY'

  const watchlist = useWatchlist()

  /**
   * 관심목록 종목을 원래 목록에서 옮기지 않는다 — 별도 "즐겨찾기한 종목" 묶음으로 위에 따로
   * 모아 다시 보여준다. 아래 전체 목록은 원래 순서(instrumentId 순) 그대로, 즐겨찾기 종목도
   * 제 위치에 그대로 남는다(두 곳에 같은 종목이 나타날 수 있다 — 의도된 동작이다).
   */
  const favoriteInstruments = useMemo(
    () => instruments.filter((i) => watchlist.has(i.instrumentId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instruments, watchlist.items],
  )

  /** 종목 목록 한 행 — "즐겨찾기한 종목" 묶음과 전체 목록이 같은 행을 그대로 재사용한다. */
  const renderInstrumentRow = (instrument: Instrument) => {
    const price = isCrypto ? cryptoPrices[instrument.instrumentId] : stockPrices[instrument.symbol]
    const active = instrument.instrumentId === selectedId
    /*
     * ring(box-shadow)이 아니라 border 를 쓴다 — 이 행의 조상에 overflow:hidden(카드) +
     * overflow-y-auto(목록 스크롤 영역)이 겹쳐 있어서, box-shadow 기반 ring 이 위·왼쪽 모서리가
     * 잘려 보이는 렌더링 버그를 냈다(2026-08-18 피드백). border 는 box-shadow 가 아니라 박스
     * 모델 자체라 이런 클리핑에 영향받지 않는다.
     */
    // 주식은 브랜드 민트 대신 이 화면 전용 딥 틸 액센트(#0D9488)를 쓴다(2026-08-18 피드백).
    const activeTone = isCrypto
      ? 'bg-coin-soft border border-coin/40'
      : 'bg-[#0D9488]/10 border border-[#0D9488]/40'
    const starred = watchlist.has(instrument.instrumentId)
    const starBusy = watchlist.busy.has(instrument.instrumentId)
    return (
      // ★ 를 행 버튼 안에 넣으면 버튼 중첩이라 유효하지 않은 HTML 이다 → 형제로 둔다.
      <li key={instrument.instrumentId} className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => setSelectedId(instrument.instrumentId)}
          aria-current={active}
          className={`flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-300 ${
            active ? activeTone : 'hover:bg-white/[0.04]'
          }`}
        >
          <span className="min-w-0">
            <span
              className={`block truncate text-sm font-medium ${
                active ? (isCrypto ? 'text-coin' : 'text-[#2DD4BF]') : 'text-ink'
              }`}
            >
              {instrument.name}
            </span>
            <span className="mt-0.5 block text-xs text-muted tabular">{instrument.symbol}</span>
          </span>
          <span className="flex-none text-right">
            {price && (price.status === 'AVAILABLE' || price.status === 'STALE') && price.price !== null ? (
              <span className="block text-sm font-medium text-ink tabular">
                {formatPrice(price.price)}
                {price.status === 'STALE' && (
                  <span className="ml-1 text-[10px] font-normal text-muted">지연</span>
                )}
              </span>
            ) : (
              <span className="block text-xs text-muted">시세 없음</span>
            )}
            {!instrument.tradable && (
              <span className="mt-1 inline-block rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-muted">
                거래정지
              </span>
            )}
          </span>
        </button>
        {/* 관심목록은 거래 가능 여부를 검사하지 않는 것이 계약이다. 거래정지 종목도 담을 수 있어야 하므로 tradable 로 막지 않는다. */}
        <button
          type="button"
          onClick={() => void watchlist.toggle(instrument.instrumentId)}
          disabled={starBusy || watchlist.items === null}
          aria-pressed={starred}
          aria-label={`${instrument.name} 관심목록 ${starred ? '해제' : '등록'}`}
          className={`flex-none rounded-full p-2 transition-colors duration-300 disabled:opacity-40 ${
            starred ? 'text-brand' : 'text-muted hover:text-ink'
          }`}
        >
          <Star width={16} height={16} fill={starred ? 'currentColor' : 'none'} />
        </button>
      </li>
    )
  }

  /**
   * 서버 멱등 해시에 limitPrice 가 들어가는지 문서에 없다(MUST-VERIFY). 키를 가격까지 종속시켜
   * 만들면 서버가 빠뜨렸더라도 키 자체가 달라 replay 경로에 들어가지 않는다.
   */
  const idempotencyKey = useIdempotencyKey([
    market,
    selectedId,
    side,
    quantity,
    orderType,
    limitPrice,
    successNonce,
  ])

  // 주식으로 돌아오면 지정가 상태를 남겨 둘 수 없다 — 주식 지정가는 백엔드에 없다.
  useEffect(() => {
    if (!isCrypto) setOrderType('MARKET')
  }, [isCrypto])

  // 시장·종목·매매구분·주문유형이 바뀌면 앞선 결과와 오류는 더 이상 이 주문의 것이 아니다.
  useEffect(() => {
    setResult(null)
    setLimitResult(null)
    setOrderError(null)
    setQuantity('')
    setAmountInput('')
    setLimitAmountInput('')
  }, [market, selectedId, side, orderType])

  /**
   * 지정가 진입 시(또는 종목·매매구분 전환 시) "주문 가격"에 현재가를 기본값으로 채운다 — 그 뒤엔
   * 시세가 계속 바뀌어도 사용자가 수정한 값을 그대로 둔다(currentPrice 를 deps 에서 뺀 이유).
   */
  useEffect(() => {
    if (!isLimit) {
      setLimitPrice('')
      return
    }
    if (currentPrice !== null) setLimitPrice(String(currentPrice))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLimit, selectedId, side])

  const quantityNumber = quantity === '' ? 0 : Number(quantity)
  const limitPriceNumber = limitPrice === '' ? 0 : Number(limitPrice)
  /** 지정가는 현재가가 아니라 입력한 지정가로 금액을 계산한다. */
  const unitPrice = isLimit ? (limitPriceNumber > 0 ? limitPriceNumber : null) : currentPrice
  const estimatedAmount =
    unitPrice !== null && quantityNumber > 0 ? unitPrice * quantityNumber : null

  /** 서버가 availableCash 를 주지 않는다 — 예약분을 직접 빼야 실제 주문 가능 금액이다. */
  const availableCash = account ? account.cashBalance - account.reservedCash : null

  /**
   * 코인 수량 입력창 placeholder 에 쓸 "최소 ≈ N" 힌트 — 실제 빗썸처럼 최소 주문금액을 채우는
   * 수량을 올림해서 보여준다(내림하면 min 을 못 채워 주문이 막힐 수 있다). 매수·매도 공통이다.
   */
  const minQtyHint =
    isCrypto && selected && selected.minOrderAmount > 0 && unitPrice !== null && unitPrice > 0
      ? formatQty(
          Math.ceil((selected.minOrderAmount / unitPrice) * 10 ** CRYPTO_QTY_DECIMALS) /
            10 ** CRYPTO_QTY_DECIMALS,
        )
      : null

  /** 주문수량이 바뀌면 지정가 × 수량으로 "주문 금액" 칸도 같이 갱신한다(실제 빗썸처럼 서로 연동). */
  const syncLimitAmountFromQuantity = (qty: number) => {
    if (!isLimit) return
    setLimitAmountInput(limitPriceNumber > 0 && qty > 0 ? String(Math.round(qty * limitPriceNumber)) : '')
  }

  const handleQuantityChange = (raw: string) => {
    if (isCrypto) {
      // 코인은 소수 수량이다. 숫자와 소수점 하나만 남기고 소수 8자리로 자른다.
      let cleaned = raw.replace(/[^0-9.]/g, '')
      const firstDot = cleaned.indexOf('.')
      if (firstDot !== -1) {
        cleaned =
          cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
        const [whole, frac = ''] = cleaned.split('.')
        cleaned = `${whole}.${frac.slice(0, CRYPTO_QTY_DECIMALS)}`
      }
      if (side === 'SELL' && held > 0 && cleaned !== '' && Number(cleaned) > held) {
        setQuantity(toQtyInput(held))
        syncLimitAmountFromQuantity(held)
        return
      }
      setQuantity(cleaned)
      syncLimitAmountFromQuantity(cleaned === '' ? 0 : Number(cleaned))
      return
    }
    // 주식 수량에 소수점이 있으면 백엔드가 400 VALIDATION_ERROR 를 낸다 → 입력 자체에서 막는다.
    const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '')
    if (side === 'SELL' && held > 0 && digits !== '' && Number(digits) > held) {
      setQuantity(toQtyInput(held))
      return
    }
    setQuantity(digits)
  }

  /** 금액 입력은 원 단위 정수만 받는다. */
  const handleAmountChange = (raw: string) => {
    setAmountInput(raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, ''))
  }

  /**
   * 지정가 "주문 금액" 입력 — 반대로 여기 입력하면 지정가 기준으로 주문수량을 역산한다.
   * 코인 수량은 소수 8자리까지라 내림해서 채운다(직접 입력과 동일한 규칙).
   */
  const handleLimitAmountChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '')
    setLimitAmountInput(digits)
    if (limitPriceNumber <= 0 || digits === '') {
      setQuantity('')
      return
    }
    const scale = 10 ** CRYPTO_QTY_DECIMALS
    const qty = Math.floor((Number(digits) / limitPriceNumber) * scale) / scale
    setQuantity(qty > 0 ? toQtyInput(qty) : '')
  }

  /** 지정가를 바꾸면(직접 입력·"현재가" 버튼) 이미 넣어 둔 수량 기준으로 주문 금액도 다시 계산한다. */
  useEffect(() => {
    if (!isLimit) return
    setLimitAmountInput(
      limitPriceNumber > 0 && quantityNumber > 0
        ? String(Math.round(limitPriceNumber * quantityNumber))
        : '',
    )
    // quantityNumber 는 의도적으로 뺐다 — 수량 입력 쪽은 handleQuantityChange 가 이미 직접 동기화한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLimit, limitPriceNumber])

  const amountNumber = amountInput === '' ? 0 : Number(amountInput)

  /** 금액 입력을 실제 주문 수량으로 환산한다 — 서버 API는 quantity 만 받는다. */
  useEffect(() => {
    if (!isAmountMode) return
    const qty = presetQuantity({
      side: 'BUY',
      isCrypto: true,
      ratio: 1,
      availableCash: amountNumber,
      held,
      unitPrice,
    })
    setQuantity(qty > 0 ? toQtyInput(qty) : '')
  }, [isAmountMode, amountNumber, unitPrice, held])

  /**
   * 비율 버튼을 지금 누를 수 없는 이유. 주문 자체를 막는 disableReason 과 달리 "채울 수량을
   * 계산할 수 없는" 경우만 본다 — 매도는 가격이 필요 없어 보유 수량만 따진다.
   */
  const presetDisabledReason = useMemo<string | null>(() => {
    // 보유 수량이 0이면 각 버튼이 채울 수량도 0이 되어 자연히 잠긴다 — 별도 안내 문구는 필요 없다(2026-08-19 피드백).
    if (side === 'SELL') return null
    if (availableCash === null) return '가진 돈을 불러오는 중이에요.'
    if (availableCash <= 0) return '주문에 쓸 수 있는 돈이 없어요.'
    // 지정가는 가격을 안 넣으면 unitPrice 가 null 이 되어 채울 수량이 자연히 0이 된다 — 별도 안내는 없앴다(2026-08-19 피드백).
    if (isLimit) return null
    if (currentPrice === null) return '지금 가격을 받지 못해서 얼마나 살 수 있는지 계산할 수 없어요.'
    // 시세가 STALE 이어도 막지 않는다 — 이 화면은 STALE 가격으로도 주문을 허용하므로(disableReason
    // 참고), 비율 버튼만 잠그면 "주문은 되는데 버튼은 안 눌리는" 상태가 된다.
    return null
  }, [availableCash, currentPrice, isLimit, side])

  const disableReason = useMemo<string | null>(() => {
    if (!selected) return '주문할 종목을 선택해 주세요.'
    if (!selected.tradable) return '거래정지 종목입니다.'
    if (!isCrypto && streamState !== 'open')
      return '시세 서버에 연결하는 중입니다. 잠시 후 다시 시도해 주세요.'
    // 코인은 24시간 거래라 장 운영 시간 개념이 없다.
    if (!isCrypto && marketStatus !== 'OPEN') return '장 시간이 아닙니다 (09:00~15:30).'
    // 지정가는 현재 시세를 필요로 하지 않는다 — 서버가 생성 시점에 즉시체결 판정을 하지 않고
    // 예약만 잡기 때문이다. 시세가 없다고 막으면 실제로는 가능한 주문을 막는 것이 된다.
    if (!isLimit) {
      if (isCrypto && snapshot === undefined) return '시세를 불러오는 중입니다.'
      if (!snapshot || snapshot.status === 'UNAVAILABLE' || snapshot.price === null)
        return isCrypto
          ? '지금 이 코인의 시세를 받을 수 없습니다. 시세가 다시 들어오면 주문할 수 있습니다.'
          : '현재 이 종목의 시세를 받을 수 없어 주문할 수 없습니다.'
    }
    if (isLimit && limitPriceNumber <= 0) return '지정가를 입력해 주세요.'
    if (quantityNumber <= 0)
      return isCrypto ? '주문 수량을 입력해 주세요. (예: 0.001)' : '주문 수량을 1주 이상 입력해 주세요.'
    if (side === 'SELL' && held <= 0) return '보유한 수량이 없어 매도할 수 없습니다.'
    if (side === 'SELL' && quantityNumber > held)
      return `보유 수량이 부족합니다. (보유 ${formatQty(held)})`
    if (
      side === 'BUY' &&
      selected.minOrderAmount > 0 &&
      estimatedAmount !== null &&
      estimatedAmount < selected.minOrderAmount
    )
      return `최소 주문금액은 ${formatKRW(selected.minOrderAmount)}입니다.`
    return null
  }, [
    estimatedAmount,
    held,
    isCrypto,
    isLimit,
    limitPriceNumber,
    marketStatus,
    quantityNumber,
    selected,
    side,
    snapshot,
    streamState,
  ])

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      // 이 검사는 상태 커밋을 기다리지 않으므로 더블클릭의 두 번째 호출도 여기서 걸린다.
      if (submittingRef.current) return
      if (!selected || disableReason) return

      submittingRef.current = true
      setSubmitting(true)
      setOrderError(null)
      setResult(null)
      setLimitResult(null)
      try {
        if (isLimit) {
          // 지정가는 체결이 아니라 PENDING 접수다. 예약분이 응답에 실려 오지 않아 계좌를 다시 읽는다.
          const accepted = await placeLimitOrder(
            {
              market: 'CRYPTO',
              instrumentId: selected.instrumentId,
              side,
              quantity,
              limitPrice,
            },
            idempotencyKey,
          )
          setLimitResult(accepted)
          setPendingNonce((n) => n + 1)
        } else {
          const execution = await placeOrder(
            {
              market,
              instrumentId: selected.instrumentId,
              side,
              orderType: 'MARKET',
              // 코인 소수 수량은 입력 문자열 그대로 보낸다 (Number 변환은 지수 표기로 깨질 수 있다).
              quantity: isCrypto ? quantity : String(quantityNumber),
            },
            idempotencyKey,
          )
          setResult(execution)
        }
        setSuccessNonce((n) => n + 1)
        setAccountNonce((n) => n + 1) // 잔고·보유는 스트림이 아니라 직접 다시 읽어야 갱신된다
      } catch (e) {
        // 같은 본문 재시도는 키를 유지해야 서버가 원래 응답을 재생한다.
        // 충돌은 우리 키 관리가 어긋난 경우이므로 자동 재시도 없이 키만 회전시킨다.
        if (isApiErrorCode(e, 'IDEMPOTENCY_CONFLICT')) setSuccessNonce((n) => n + 1)
        // 서버 멱등 해시가 limitPrice 를 빼먹어 다른 주문의 응답이 재생된 경우다. 성공으로 보여주면 안 된다.
        if (e instanceof Error && e.message === 'IDEMPOTENT_REPLAY_MISMATCH') {
          setSuccessNonce((n) => n + 1)
          setOrderError(
            '직전 주문과 응답이 일치하지 않아 주문을 취소했습니다. 미체결 목록을 확인한 뒤 다시 시도해 주세요.',
          )
        } else {
          setOrderError(toUserMessage(e, ORDER_ERROR_MESSAGES[market]))
        }
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [
      disableReason,
      idempotencyKey,
      isCrypto,
      isLimit,
      limitPrice,
      market,
      quantity,
      quantityNumber,
      selected,
      side,
    ],
  )

  const stale = isCrypto
    ? cryptoUpdatedAt !== null && now - cryptoUpdatedAt > CRYPTO_POLL_MS * 4
    : lastMessageAt !== null && now - lastMessageAt > STALE_MS
  // 백엔드는 전일 종가를 주지 않는다. 등락률은 첫 분봉의 시가 대비로만 계산할 수 있다.
  const openPrice = candles.length > 0 ? candles[0].open : null
  const changePercent =
    openPrice !== null && openPrice !== 0 && currentPrice !== null
      ? ((currentPrice - openPrice) / openPrice) * 100
      : null
  // "-2.3%" 보다 "-2,300원"이 먼저 와닿는다 — 같은 자리에 금액도 함께 보여준다.
  const changeAmount =
    openPrice !== null && currentPrice !== null ? currentPrice - openPrice : null

  const emptyChartMessage = candlesLoading
    ? '분봉을 불러오는 중입니다.'
    : isCrypto
      ? '아직 수집된 분봉이 없습니다. 빗썸 시세가 들어오면 5초마다 갱신됩니다.'
      : marketStatus === 'CLOSED'
        ? '장 준비 전입니다. 분봉은 09:01부터 공개됩니다.'
        : '아직 공개된 분봉이 없습니다. 매분 새 봉이 추가됩니다.'

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden px-8 pb-8 pt-20 md:pt-24">
      <div className="orb -top-24 left-1/4 h-72 w-72 animate-float-orb" aria-hidden />

      {/*
        3컬럼(목록·차트·주문)이 들어서면서 max-w-6xl 로는 옆 공간이 남는다 — 2026-08-18 피드백으로
        폭 제한 자체를 없앴다. 바깥 wrapper 의 px-4 가 화면 끝 여백을 대신한다.
      */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/*
          1. 헤더 + 시장 탭 + 시세 상태. 좌측 정렬 ↔ 가운데 정렬을 몇 번 오갔는데(2026-08-19
          피드백) 최종적으로 다시 가운데 정렬. 계좌 요약 스트립은 헤더 오른쪽 빈 자리로 옮겨봤다가
          계속 어색하다는 피드백을 받고 원래 자리(차트 컬럼 맨 위)로 되돌아가 있다 — 헤더 정렬과는
          이제 무관하다.
        */}
        <header className="shrink-0 pb-3 pt-3 text-center">
          {/*
            "모의투자" 라벨은 최종적으로 뺀다 — 붙였다 뗐다 하다가 없는 쪽으로 확정됐다
            (2026-08-19 피드백). 다시 붙이지 않는다.
          */}
          <MarketTabs market={market} onChange={setMarket} size="lg" />

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {isCrypto ? (
              <>
                <Pill active={!stale} tone="coin">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      stale ? 'bg-muted' : 'animate-pulse-soft bg-coin'
                    }`}
                    aria-hidden
                  />
                  {cryptoUpdatedAt === null ? '시세 불러오는 중' : '24시간 거래'}
                </Pill>
                <Pill>빗썸 실시세</Pill>
              </>
            ) : (
              <>
                {/*
                  이전엔 "실시간 수신"(SSE 연결 상태) 배지와 "장 운영 중/장 마감"(marketStatus) 배지가
                  따로 있었다. 하나로 합쳐 marketStatus 텍스트로 통일했다(2026-08-18 피드백) — 점(dot)
                  애니메이션은 여전히 스트림이 실제로 살아있는지(streamState === 'open' && !stale)를
                  보여준다. 장 마감/운영 중 둘 다 항상 색이 채워진 상태로 보여준다 — 상태를 한눈에
                  알아보기 쉽게(2026-08-18 피드백).
                */}
                <Pill active>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      streamState === 'open' && !stale
                        ? 'animate-pulse-soft bg-[#2DD4BF]'
                        : 'bg-muted'
                    }`}
                    aria-hidden
                  />
                  {marketStatus === 'OPEN'
                    ? '장 운영 중'
                    : marketStatus === 'CLOSED'
                      ? '장 마감'
                      : '장 상태 확인 중'}
                </Pill>
                {sourceTradingDate && <Pill>{sourceTradingDate} 장 재생 중</Pill>}
              </>
            )}
          </div>

          {/*
            코인·주식 설명 둘 다 구현 디테일("5초마다 폴링", "차트 시각은 그 거래일 기준") 대신
            사용자 관점 문구로 바꿨다(2026-08-18 피드백 — 위 배지가 이미 상태를 보여주니, 이 문장은
            "왜/어떻게 쓰면 좋은지"로 풀어준다). sourceTradingDate 는 백엔드가 정하는 값이라(보통
            직전 영업일) 날짜가 바뀌면 이 문구도 자동으로 같이 바뀐다.
          */}
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            {isCrypto
              ? '빗썸 실시간 시세로 24시간 언제든 코인 매매를 연습해보세요.'
              : sourceTradingDate
                ? `${sourceTradingDate} 장 움직임을 오늘 시간에 맞춰 그대로, 실전처럼 연습해보세요.`
                : '과거 거래일의 시세를 오늘 장 시간에 맞춰 재생하는 방식입니다. 재생할 거래일이 준비되면 여기에 표시됩니다.'}
          </p>
          {stale && !isCrypto && (
            <p className="mt-2 text-sm text-loss">
              시세 수신이 40초 이상 없습니다. 자동으로 재연결을 시도하고 있습니다.
            </p>
          )}
          {streamError && !isCrypto && <p className="mt-2 text-sm text-loss">{streamError}</p>}
          {cryptoPriceError && isCrypto && (
            <p className="mt-2 text-sm text-loss">{cryptoPriceError}</p>
          )}
          {instrumentsError && (
            <p className="mt-2 text-sm text-loss">{toUserMessage(instrumentsError)}</p>
          )}
        </header>

        {/*
          종목 목록(3) | 나머지(차트 4 · 주문 패널 5~7) 2컬럼 그리드.
          처음엔 목록에 row-span-2, 고정 바에 col-span-2 를 써서 한 그리드 안에 다 넣었는데, 목록(긴
          컬럼)이 row-span 되는 행 트랙 높이 계산에 끼어들면서 1행(고정 바) 트랙 자체가 목록 높이만큼
          부풀어 고정 바 밑에 빈 여백이 크게 생겼다(주식처럼 목록이 길 때 특히 눈에 띔, 2026-08-18
          피드백). 그래서 "나머지"를 통째로 별도 중첩 그리드로 뺐다 — 바깥 그리드는 목록·중첩그리드
          단 2개뿐이라 row-span 자체가 없고, 트랙 부풀림 버그가 구조적으로 발생하지 않는다.
          모바일(<lg)은 각 그리드가 단일 컬럼으로 접혀 DOM 순서(목록 → 차트 → 주문)대로 쌓인다.

          컬럼 폭: 예전엔 목록 minmax(0,20rem) + 나머지 1fr 이라, 창을 넓히면 남는 폭이 전부 차트로
          가서 큰 화면에서 차트만 비정상적으로 커졌다(2026-08-19 피드백 — "차트가 너무 크다").
          목록·차트·주문 세 폭이 항상 20:46:22 비율을 유지하며 같이 커지고 작아지게, 고정
          rem 대신 fr 로 바꿨다(정확한 비율은 이 그리드의 20fr 과 안쪽 그리드의 46fr·22fr 이
          합쳐져서 나온다 — 안쪽 grid 의 "나머지" 트랙이 이 그리드의 68fr 만큼만 받으므로,
          46:22 로 다시 나눈 값이 전체 기준으로도 정확히 20:46:22 가 된다).
        */}
        <div className="mt-5 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,20fr)_minmax(0,68fr)]">
          {/* 3. 종목 목록 */}
          {/*
            목록·차트·주문 세 컬럼이 전부 부모 그리드 행(위 min-h-0 flex-1)에서 나온 h-full 을 쓴다
            (아래 두 군데도 반드시 같은 패턴) — 브라우저 창 높이가 바뀌면 셋이 똑같이 함께 커지거나
            작아진다. 이전엔 max-h-[calc(100vh-556px)] 같은 매직 넘버를 썼는데, 헤더 줄바꿈 등으로
            실제 남는 높이가 달라지면 값이 안 맞아 컬럼끼리 높이가 어긋나거나 밑에 여백이 남거나
            내용이 잘려 보였다(2026-08-19 피드백). 글자 크기는 절대 건드리지 않는다(transform: scale
            은 안 쓴다) — 컬럼 자체의 높이만 화면에 맞추고, 그 안 내용이 넘치면 그 컬럼 안에서만
            스크롤된다.
          */}
          <Card className="min-h-0" innerClassName="flex h-full min-h-0 flex-col p-3">
            <h2 className="shrink-0 px-2 pb-2 text-sm font-semibold text-ink">
              {isCrypto ? '코인' : '종목'}
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto">
            {instrumentsLoading ? (
              // 텍스트 한 줄 대신 실제 행과 같은 크기의 자리표시를 둬 목록이 튀어오르지 않게 한다
              <ul aria-label="종목을 불러오는 중" className="space-y-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1 space-y-1.5">
                      <span className="skeleton block h-3.5 w-2/3" />
                      <span className="skeleton block h-2.5 w-1/3" />
                    </span>
                    <span className="skeleton h-3.5 w-16 flex-none" />
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {/*
                  즐겨찾기 종목을 아래 전체 목록에서 옮기는 게 아니다 — 원래 자리는 그대로 두고,
                  같은 종목을 위쪽에 별도로 한 번 더 모아 보여준다(의도된 중복 노출).
                  즐겨찾기가 하나도 없어도 이 섹션 자체(라벨 + 안내 문구)는 보여준다 — 그래야
                  별 아이콘을 처음 보는 사용자가 "누르면 여기에 고정되겠구나"를 미리 알 수 있다
                  (2026-08-18 피드백). watchlist.items 가 로딩 중(null)일 때만 숨긴다.
                */}
                {watchlist.items !== null && (
                  <>
                    {/* 옅은 배경으로 한 묶음임을 표시 — 아래 전체 목록과 색부터 구분된다. */}
                    <div className="rounded-2xl bg-white/[0.03] p-2">
                      <p className="px-1 pb-1 pt-1 text-xs font-medium text-muted">즐겨찾기한 종목</p>
                      {favoriteInstruments.length > 0 ? (
                        // 스크롤 박스에 가두지 않는다 — 종목 수만큼 자연스럽게 늘어나고 페이지가 대신 스크롤된다.
                        <ul className="space-y-1">
                          {favoriteInstruments.map((instrument) => renderInstrumentRow(instrument))}
                        </ul>
                      ) : (
                        <p className="px-1 pb-1 text-xs leading-relaxed text-muted">
                          별 아이콘을 누르면 종목이 여기에 고정돼요.
                        </p>
                      )}
                    </div>
                    <div aria-hidden className="my-6 border-t border-line" />
                  </>
                )}
                <ul className="space-y-1">
                  {instruments.map((instrument) => renderInstrumentRow(instrument))}
                </ul>
              </>
            )}
            {watchlist.error && (
              <p className="mt-2 px-3 text-xs text-rose-300">{watchlist.error}</p>
            )}
            </div>
          </Card>

          {/*
            차트 · 주문 패널 — 목록 옆 컬럼. 예전엔 여기에 스크롤을 따라다니는 현재가 고정 바가
            추가로 있었는데, sticky 그리드 아이템이 자기 행(row) 트랙 계산에 끼어들어 옆 목록이
            길어질 때(특히 주식) 행 자체가 부풀어 밑에 빈 여백이 크게 생기는 문제가 반복됐다.
            바를 없애고 그 정보(종목명·가격·등락)는 바로 아래 차트 카드 제목 옆으로 옮겼다
            (2026-08-18 피드백). 목록과 같은 h-full + overflow-y-auto.

            46fr·22fr 은 바깥 그리드 20fr·68fr 과 짝을 이루는 값이다(위 주석 참고) — 이 그리드가
            받는 폭(바깥 그리드의 68fr 만큼)을 다시 46:22 로 나눠서, 전체 기준 목록:차트:주문 =
            20:46:22 비율이 유지되게 한다. 창을 넓히고 좁혀도 세 컬럼이 이 비율 그대로 같이
            커지고 작아진다(2026-08-19 피드백).
          */}
          <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,46fr)_minmax(0,22fr)]">
            <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto">
            {/*
              계좌 요약 스트립(총 평가자산·주문가능 현금·평가손익 3개)을 헤더 오른쪽으로 옮겨도
              보고 여러 스타일로 바꿔봤지만 계속 어색하다는 피드백을 받았다. 다시 보니 이 화면은
              "지금 매매하는" 화면이라 3개 다 필요한 게 아니라 주문가능 현금 하나만 의미가
              있다는 판단으로, 계좌 요약 카드 자체를 여기서 없애고 주문가능 현금만 주문 탭
              안으로 옮겼다(2026-08-19 피드백, 아래 rightPanelTab === 'order' 블록 참고). 총
              평가자산·평가손익은 Portfolio 화면에 이미 있다.
            */}
            <Card className="min-h-0 flex-1" innerClassName="flex h-full min-h-0 flex-col p-5">
              <div className="shrink-0 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">
                    {selected ? selected.name : '종목을 선택해 주세요'}
                  </h2>
                  <p className="mt-1 text-xs text-muted tabular">
                    {selected ? selected.symbol : '—'}
                    {snapshot?.sourceTime ? ` · ${formatHhMm(snapshot.sourceTime)} 기준` : ''}
                    {isStalePrice ? ' · 지연' : ''}
                  </p>
                </div>
                {selected && (
                  <div className="text-right">
                    {/*
                      가격을 위로, 등락 텍스트를 아래로 — 정렬도 items-start 로 바꿔서 가격이
                      "삼성전자" 종목명과 같은 줄에 나란히 오게 했다(2026-08-19 피드백).
                    */}
                    <p className="text-base font-semibold text-ink tabular md:text-lg">
                      {currentPrice !== null ? formatPrice(currentPrice) : '시세 없음'}
                    </p>
                    {changePercent !== null && changeAmount !== null && (
                      <p className={`mt-1 text-xs tabular ${pnlTone(changePercent)}`}>
                        {isCrypto ? '차트 시작 대비' : '장 시작 대비'} {signedKRW(changeAmount)} (
                        {formatPercent(changePercent)})
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/*
                종목명·현재가 행 바로 아래, 차트/변동 원인 탭. -mx-5 로 p-5 패딩을 뚫고 나가
                주문/커뮤니티 탭과 같은 모양(edge-to-edge + border-b)을 낸다.
              */}
              {selectedId !== null && (
                <div className="-mx-5 mt-3 grid shrink-0 grid-cols-2 border-b border-line">
                  {(
                    [
                      ['chart', '차트'],
                      ['priceMoves', '변동 원인'],
                    ] as const
                  ).map(([value, label]) => {
                    const active = chartTab === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setChartTab(value)}
                        aria-pressed={active}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors duration-300 ${
                          active
                            ? `border-b-2 text-ink ${isCrypto ? 'border-coin' : 'border-[#0D9488]'}`
                            : 'border-b-2 border-transparent text-muted hover:text-ink'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}

              {chartTab === 'priceMoves' && selectedId !== null && (
                <div className="-mx-5 -mb-5 mt-1 min-h-0 flex-1 overflow-y-auto">
                  <PriceMoveCards bare instrumentId={selectedId} />
                </div>
              )}

              {(chartTab === 'chart' || selectedId === null) && (
                <>
              {/* 봉 주기 전환 — 백엔드가 대소문자를 구분하므로 '1m'(분)과 '1M'(월)을 섞지 않는다 */}
              <div className="mt-3 flex shrink-0 items-center gap-1">
                {(
                  [
                    ['1m', '분'],
                    ['1d', '일'],
                    ['1w', '주'],
                    ['1M', '월'],
                  ] as const
                ).map(([value, label]) => {
                  const active = interval === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setInterval_(value)}
                      aria-pressed={active}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors duration-300 ${
                        active
                          ? 'bg-white/[0.1] text-ink ring-1 ring-white/[0.14]'
                          : 'text-muted hover:text-ink'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              {/*
                차트는 flex-1 min-h-0 로 남는 세로 공간을 전부 가져가고, aspect-[21/9] 로 가로세로
                비율을 고정한다 — 바닥 높이(min-h) 없이 창을 줄이면 이 비율을 유지한 채 그대로
                작아진다(스크롤 대신 축소, 2026-08-19 피드백). CandleChart 내부는 h-full(퍼센트
                높이)이 아니라 flex-1(그로우 기반)로 자기 몫을 채운다 — min-height 로 세운 flex
                아이템 여러 겹을 거치는 퍼센트 높이는 크롬이 "정의된 높이"로 인정하지 않아 0으로
                무너지는 버그가 있었다(2026-08-19 피드백 후속 수정 2). 그 덕에 여기서 바닥 높이를
                없애도 차트가 사라지지 않고 그냥 작아지기만 한다.
              */}
              <div className="mt-2 flex aspect-[21/9] min-h-0 flex-1 flex-col">
                <CandleChart
                  candles={candles}
                  interval={interval}
                  emptyMessage={emptyChartMessage}
                  fillHeight
                />
              </div>
              {candlesError && (
                <p className="mt-2 shrink-0 text-xs text-loss">{toUserMessage(candlesError)}</p>
              )}
              {/* 이미 받아 둔 캔들로만 계산한다 — 하루 저가·고가를 위한 API 호출은 따로 없다. */}
              <div className="shrink-0">
                <DayRangeBar candles={candles} interval={interval} currentPrice={currentPrice} />
              </div>

                </>
              )}
            </Card>
          </div>

            {/*
              5~7. 주문 패널 + 미체결 지정가 주문 + 커뮤니티 미리보기 — 차트 옆(lg 이상) 컬럼.
              둘을 쌓아 두지 않고 한 박스 안에서 탭으로 전환한다(2026-08-18 피드백, 와이어프레임 참고)
              — 탭 버튼이 박스 밖에 따로 뜨는 게 아니라 박스 상단에 붙어 있어야 한다.
              목록·차트 컬럼과 같은 h-full + overflow-y-auto.
            */}
            <div className="h-full min-h-0 space-y-5 overflow-y-auto">
            <Card accent={accent} innerClassName="p-0 overflow-hidden">
              <div className="grid grid-cols-2 border-b border-line">
                {(
                  [
                    ['order', '주문'],
                    ['community', '커뮤니티'],
                  ] as const
                ).map(([value, label]) => {
                  const active = rightPanelTab === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRightPanelTab(value)}
                      aria-pressed={active}
                      className={`px-4 py-3 text-sm font-medium transition-colors duration-300 ${
                        active
                          ? `border-b-2 text-ink ${isCrypto ? 'border-coin' : 'border-[#0D9488]'}`
                          : 'border-b-2 border-transparent text-muted hover:text-ink'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              <div className="p-5">
                {rightPanelTab === 'order' && (
                  <>
              {/* 코인 시장가·지정가 매수 안내는 매수/매도 토글 아래로 옮겨 매수 탭에서만 보여준다(2026-08-19 피드백) — 아래 참고. */}
              {!isCrypto && (
                <p className="whitespace-pre-line text-xs leading-relaxed text-muted">
                  시장가 주문만 지원하며, 현재가에 즉시 체결됩니다.
                </p>
              )}
              {/* 자동으로 한 번 뜬 설명을 나중에 다시 볼 수 있는 경로 — 시장가·지정가 구분은 코인 전용이라 주식 탭엔 안 둔다(2026-08-19 피드백). */}
              {isCrypto && (
                <div className="mt-2">
                  <OrderTypeGuideButton onClick={() => setOrderTypeGuideOpen(true)} />
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-3 space-y-3">
                <div className="flex w-full items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
                  {(['BUY', 'SELL'] as OrderSide[]).map((value) => {
                    const active = side === value
                    const activeTone =
                      value === 'BUY'
                        ? 'bg-gain/15 text-gain ring-1 ring-gain/40'
                        : 'bg-loss/15 text-loss ring-1 ring-loss/40'
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSide(value)}
                        aria-pressed={active}
                        className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all duration-400 ease-spring ${
                          active ? activeTone : 'text-muted hover:text-ink'
                        }`}
                      >
                        {sideLabels[value]}
                      </button>
                    )
                  })}
                </div>

                {/* 주문 유형 — 지정가는 코인 전용이라 주식 탭에서는 아예 보이지 않는다. 매수/매도 토글
                    바로 아래로 옮겼다(2026-08-19 피드백). */}
                {isCrypto && (
                  <div className="flex w-full items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
                    {(
                      [
                        ['MARKET', '시장가'],
                        ['LIMIT', '지정가'],
                      ] as const
                    ).map(([value, label]) => {
                      const active = orderType === value
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setOrderType(value)}
                          aria-pressed={active}
                          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all duration-400 ease-spring ${
                            active ? 'bg-coin-soft text-coin ring-1 ring-coin/40' : 'text-muted hover:text-ink'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* 코인 시장가·지정가 안내. 매수/매도 토글 바로 아래(매수는 주문가능 현금 박스 위)에 둔다.
                    지정가 매도는 별도 안내가 없어 여기서 다루지 않는다(2026-08-19 피드백). */}
                {isCrypto && (side === 'BUY' || !isLimit) && (
                  <p className="whitespace-pre-line text-xs leading-relaxed text-muted">
                    {side === 'BUY' && isLimit ? (
                      <>
                        지정한 가격에 도달하면 자동으로 체결됩니다.
                        {'\n'}그 전까지는 체결되지 않고, 주문한 만큼의 현금·수량만 미리 묶어둡니다.
                      </>
                    ) : (
                      <>
                        지금 보이는 가격 근처에서 즉시 체결됩니다.
                        {'\n'}시세가 계속 바뀌어 {side === 'BUY' ? '매수' : '매도'} 순간과 조금 다를 수 있습니다.
                      </>
                    )}
                  </p>
                )}

                {/* 매수/매도 토글 바로 아래 둔다(2026-08-19 피드백). 수량 입력창과 같은 모양(라벨은 박스
                    밖, 값은 테두리 있는 박스 안)으로 맞췄다. 매수는 주문가능 현금, 매도는 매도가능 수량이다. */}
                <div>
                  <p className="mb-1.5 text-sm font-medium text-ink">주문 가능</p>
                  <div className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] tabular">
                    {side === 'BUY' ? (
                      accountError ? (
                        <span className="text-loss">{accountError}</span>
                      ) : (
                        <span className="text-ink">
                          {availableCash !== null ? formatKRW(availableCash) : '—'}
                        </span>
                      )
                    ) : (
                      <span className="text-ink">
                        {formatQty(held)}
                        {isCrypto ? ` ${selected?.symbol ?? ''}` : '주'}
                      </span>
                    )}
                  </div>
                  {/* 예약이 있을 때만 알린다 — 현금 잔액과 주문가능액이 왜 다른지 설명해 줘야 한다. */}
                  {side === 'BUY' && account !== null && account.reservedCash > 0 && (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">
                      현금 {formatKRW(account.cashBalance)} 중{' '}
                      <span className="tabular text-coin">
                        {formatKRW(account.reservedCash)}
                      </span>
                      이 미체결 지정가 매수로 예약돼 있습니다.
                    </p>
                  )}
                </div>

                {/* 지정가 입력 — 실제 빗썸처럼 "주문 가격"을 "주문 수량"보다 먼저 둔다(2026-08-19 피드백). */}
                {isLimit && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <label htmlFor="order-limit-price" className="text-sm font-medium text-ink">
                        주문 가격
                      </label>
                      <HelpTooltip label="주문 가격이 뭔지 설명 보기">
                        내가 {side === 'BUY' ? '사고' : '팔고'} 싶은 목표가예요. 현재가가 이 가격에
                        도달하면 자동으로 체결되고, 도달하기 전까지는 미체결 상태로 대기해요.
                      </HelpTooltip>
                    </div>
                    <input
                      id="order-limit-price"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      value={formatPriceInput(limitPrice)}
                      onChange={(e) => setLimitPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-coin focus:ring-4 focus:ring-coin/15"
                    />
                  </div>
                )}

                <div>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <label
                        htmlFor={isAmountMode ? 'order-amount' : 'order-quantity'}
                        className="text-sm font-medium text-ink"
                      >
                        {isAmountMode ? '주문 금액' : isCrypto ? '주문 수량' : '수량 (주)'}
                      </label>
                      {isCrypto && (
                        <HelpTooltip
                          label={
                            isAmountMode ? '주문 금액이 뭔지 설명 보기' : '주문 수량이 뭔지 설명 보기'
                          }
                        >
                          {isAmountMode
                            ? '얼마(원화)만큼 살지 정하는 칸이에요. 입력한 금액을 현재가로 나눠 수량을 계산해서 즉시 매수해요.'
                            : isLimit
                              ? '몇 개(코인 개수)를 주문할지 정하는 칸이에요. 바로 아래 주문 금액과 서로 연동돼서, 하나를 입력하면 나머지가 자동으로 계산돼요.'
                              : '몇 개(코인 개수)를 주문할지 정하는 칸이에요.'}
                        </HelpTooltip>
                      )}
                    </div>
                    {/* 매도는 바로 위 "주문 가능" 박스가 보유 수량을 이미 보여주므로 여기서 또 보여주지 않는다.
                        매수도 마찬가지로 "주문 가능" 박스와 중복이라 최대 구매 가능 수량을 따로 보여주지 않는다(2026-08-19 피드백). */}
                  </div>
                  {isAmountMode ? (
                    <input
                      id="order-amount"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={
                        selected && selected.minOrderAmount > 0
                          ? `최소 금액 ${formatKRW(selected.minOrderAmount)}`
                          : '100000'
                      }
                      value={formatPriceInput(amountInput)}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15"
                    />
                  ) : (
                    <input
                      id="order-quantity"
                      // 형식을 직접 통제해야 하므로 number 대신 text + 시장별 필터를 쓴다.
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder={
                        isCrypto && minQtyHint
                          ? `최소 ≈ ${minQtyHint}`
                          : isCrypto
                            ? '0.001'
                            : '0'
                      }
                      value={quantity}
                      onChange={(e) => handleQuantityChange(e.target.value)}
                      className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15"
                    />
                  )}
                  {isAmountMode ? (
                    // 금액 버전 비율 프리셋 — 가진 돈 × 비율을 그대로 금액 입력에 채운다.
                    <div
                      role="group"
                      aria-label="가진 돈의 비율로 금액 채우기"
                      className="mt-2 flex flex-wrap items-center justify-end gap-1.5"
                    >
                      {[0.1, 0.25, 0.5, 0.75, 1].map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          disabled={availableCash === null || availableCash <= 0}
                          onClick={() => {
                            if (availableCash === null) return
                            const amt = ratio >= 1 ? availableCash : availableCash * ratio
                            handleAmountChange(String(Math.floor(amt)))
                          }}
                          className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-muted transition-colors hover:bg-white/[0.1] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/[0.06] disabled:hover:text-muted"
                        >
                          {ratio < 1 ? `${ratio * 100}%` : '최대'}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <>
                      {/*
                        비율 프리셋. 기준 가격은 주문금액 계산과 같은 unitPrice 를 쓴다 — 지정가일 때는
                        현재가가 아니라 입력한 지정가다(서버가 예약하는 현금도 지정가 기준이다).
                        수량은 handleQuantityChange 로 흘려 보내 기존 정수/소수 규칙을 그대로 태운다.
                      */}
                      <QuantityPresets
                        side={side}
                        isCrypto={isCrypto}
                        availableCash={availableCash}
                        held={held}
                        unitPrice={unitPrice}
                        disabledReason={presetDisabledReason}
                        onPick={(qty) => handleQuantityChange(toQtyInput(qty))}
                      />
                      {/* 실제 빗썸에 없는 패턴이라 뺐다 — 퍼센트 버튼 + (지정가는 주문금액 입력)으로 충분하다(2026-08-19 피드백). */}
                    </>
                  )}
                </div>

                {/* 지정가 "주문 금액" — 주문수량과 서로 연동되는 입력창(실제 빗썸과 동일). 하나에 입력하면
                    지정가 기준으로 나머지가 자동 계산된다(2026-08-19 피드백). */}
                {isLimit && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <label htmlFor="order-limit-amount" className="text-sm font-medium text-ink">
                        주문 금액
                      </label>
                      <HelpTooltip label="주문 금액이 뭔지 설명 보기">
                        얼마(원화)만큼 주문할지 정하는 칸이에요. 바로 위 주문 수량과 서로 연동돼서,
                        하나를 입력하면 나머지가 자동으로 계산돼요.
                      </HelpTooltip>
                    </div>
                    <input
                      id="order-limit-amount"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={
                        selected && selected.minOrderAmount > 0
                          ? `최소 금액 ${formatKRW(selected.minOrderAmount)}`
                          : '0'
                      }
                      value={formatPriceInput(limitAmountInput)}
                      onChange={(e) => handleLimitAmountChange(e.target.value)}
                      className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-coin focus:ring-4 focus:ring-coin/15"
                    />
                  </div>
                )}

                {!isLimit && (
                <div className="space-y-1.5 rounded-2xl bg-elevated px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">
                      {isAmountMode
                        ? '예상 매수'
                        : side === 'SELL'
                          ? '예상 매도'
                          : '예상 주문금액 (추정)'}
                    </span>
                    <span className="font-medium text-ink tabular">
                      {isAmountMode
                        ? `${formatQty(quantityNumber)} ${selected?.symbol ?? ''}`
                        : formatKRW(estimatedAmount ?? 0)}
                    </span>
                  </div>
                  {/* 최소 주문금액은 코인 전용 — 주식은 1주 단위라 최소 금액이 곧 현재가라 보여줘도 의미가 없다(2026-08-19 피드백).
                      금액 입력 모드와 매도는 입력창 placeholder(최소 금액/최소 ≈ 수량)가 이미 알려주므로 중복 표시하지 않는다. */}
                  {!isAmountMode && side === 'BUY' && isCrypto && selected && selected.minOrderAmount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted">최소 주문금액</span>
                      <span className="text-muted tabular">
                        {formatKRW(selected.minOrderAmount)}
                      </span>
                    </div>
                  )}
                  <ul className="list-disc space-y-1 pl-4 pt-1 text-xs leading-relaxed text-muted">
                    <li className="whitespace-pre-line">
                      {isAmountMode
                        ? '현재가 기준 예상 수량이며, 체결 시점 가격에 따라 실제와 다를 수 있어요.'
                        : '현재가 × 수량으로 계산한 추정치예요.'}
                    </li>
                    <li>최대 주문 가능 금액은 10억원 입니다.</li>
                  </ul>
                </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  variant={side === 'BUY' ? 'buy' : 'sell'}
                  className="w-full"
                  disabled={submitting || disableReason !== null}
                >
                  {submitting
                    ? '주문 처리 중'
                    : isCrypto && selected
                      ? `${selected.symbol} ${sideLabels[side]}`
                      : sideLabels[side]}
                </Button>
              </form>

              {/* "수량을 입력해 주세요"·"지정가를 입력해 주세요" 안내는 불필요한 잔소리라 뺐다 —
                  다른 차단 사유만 보여준다(2026-08-19 피드백). */}
              {disableReason &&
                disableReason !==
                  (isCrypto
                    ? '주문 수량을 입력해 주세요. (예: 0.001)'
                    : '주문 수량을 1주 이상 입력해 주세요.') &&
                disableReason !== '지정가를 입력해 주세요.' && (
                  <p className="mt-3 text-xs leading-relaxed text-muted">{disableReason}</p>
                )}
              {orderError && <p className="mt-3 text-sm text-loss">{orderError}</p>}

              {/* 지정가는 체결이 아니라 접수다 — 시장가 체결 카드와 문구를 분명히 구분한다. */}
              {limitResult && (
                <div className="mt-5 rounded-2xl border border-coin/30 bg-coin-soft/40 p-4">
                  <p className="text-sm font-medium text-coin">
                    지정가 {sideLabels[limitResult.side]} 주문이 접수되었습니다.
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <dt className="text-muted">지정가</dt>
                      <dd className="mt-0.5 text-ink tabular">
                        {formatPrice(limitResult.limitPrice)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">수량</dt>
                      <dd className="mt-0.5 text-ink tabular">{formatQty(limitResult.quantity)}</dd>
                    </div>
                  </dl>
                  {/*
                    "아직 체결되지 않았습니다"로 단정하면 안 된다 — 체결은 서버의 다음 가격 틱에서
                    일어나고 응답 시점에는 결과를 알 수 없다. 접수 사실만 말하고 확인처를 알려 준다.
                  */}
                  <p className="mt-3 text-[11px] leading-relaxed text-muted">
                    체결 여부는 접수 응답에 담기지 않습니다. 체결 조건을 이미 만족했다면 곧바로 체결되고,
                    아니면 아래 미체결 목록에 남습니다. 목록은 5초마다 갱신되며 체결되면 사라지고
                    체결 내역으로 옮겨집니다.
                  </p>
                </div>
              )}

              {result && (
                <div
                  className={`mt-5 rounded-2xl border p-4 ${
                    isCrypto ? 'border-coin/30 bg-coin-soft/40' : 'border-brand/30 bg-brand-soft/40'
                  }`}
                >
                  <p
                    className={`text-sm font-medium ${isCrypto ? 'text-coin' : 'text-brand'}`}
                  >
                    {sideLabels[result.side]} 주문이 체결되었습니다.
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <dt className="text-muted">체결단가</dt>
                      <dd className="mt-0.5 text-ink tabular">{formatPrice(result.price)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">수량</dt>
                      <dd className="mt-0.5 text-ink tabular">
                        {formatQty(result.quantity)}
                        {isCrypto ? '' : '주'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">거래금액</dt>
                      <dd className="mt-0.5 text-ink tabular">{formatKRW(result.amount)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">수수료</dt>
                      <dd className="mt-0.5 text-ink tabular">{formatKRW(result.fee)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">실현손익</dt>
                      <dd
                        className={`mt-0.5 tabular ${
                          result.realizedPnl === null ? 'text-muted' : pnlTone(result.realizedPnl)
                        }`}
                      >
                        {result.realizedPnl === null ? '—' : signedKRW(result.realizedPnl)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">체결시각</dt>
                      <dd className="mt-0.5 text-ink tabular">
                        {formatDateTime(result.executedAt)}
                      </dd>
                    </div>
                  </dl>

                  {/* 매수·매도 모두 체결 직후 바로 작성란을 띄운다 — Portfolio 체결내역에서도 같은 진입점을 제공한다. */}
                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-4">
                    {journalTradeId === result.tradeId ? (
                      <JournalEditor
                        journalType={result.side === 'BUY' ? 'BUY' : 'SELL'}
                        tradeId={result.tradeId}
                        mode="create"
                        onSaved={() => {
                          setJournalTradeId(null)
                          setJournalSavedTradeId(result.tradeId)
                        }}
                        onCancel={() => setJournalTradeId(null)}
                      />
                    ) : (
                      <>
                        {journalSavedTradeId === result.tradeId ? (
                          <p className="text-xs text-muted">투자일기를 저장했습니다.</p>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setJournalTradeId(result.tradeId)}
                          >
                            투자일기 작성하러가기
                          </Button>
                        )}
                        {/*
                          매도 체결만 수익 인증 카드로 공유할 수 있다(매수는 실현손익이 없다).
                          코인·주식 모두 지원 — 클릭 시 커뮤니티 글쓰기 화면으로 이동하며 이 체결 id 를 실어 보낸다.
                        */}
                        {result.side === 'SELL' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              navigate('/community', { state: { sharedTradeId: result.tradeId } })
                            }
                          >
                            수익 인증 카드로 공유하기
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 손절·익절 자동 예약(OCO) — 지정가 매매 바로 아래, 기본은 접힌 토글이다. 코인 holding 전용(021)이고
                  보유 중인 걸 파는 개념이라 side 필드 자체가 없다(항상 SELL) — 매도 탭에서만 보여준다.
                  시장가는 "지금 즉시 판다"는 의도라 "나중에 조건 닿으면 판다"는 예약형 OCO와 성격이 달라
                  섞으면 헷갈린다는 피드백으로, 지정가 매도에서만 보여준다(2026-08-19). */}
              {isCrypto && side === 'SELL' && isLimit && (
                <div className="mt-4 border-t border-white/[0.08] pt-3">
                  <button
                    type="button"
                    onClick={() => setOcoOpen((v) => !v)}
                    aria-expanded={ocoOpen}
                    aria-controls="oco-exit-plan-panel"
                    className="flex w-full items-center justify-between rounded-2xl border border-line bg-elevated px-4 py-3 text-sm text-ink transition-colors duration-300 hover:bg-white/[0.06]"
                  >
                    <span className="font-medium">손절·익절 자동 예약 (OCO) {ocoOpen ? '닫기' : '설정'}</span>
                    <span
                      aria-hidden="true"
                      className={`text-muted transition-transform duration-300 ${ocoOpen ? 'rotate-180' : ''}`}
                    >
                      ▾
                    </span>
                  </button>
                  {ocoOpen && (
                    <div id="oco-exit-plan-panel" className="mt-3">
                      <OcoExitPlanPanel
                        holding={selectedHolding}
                        refreshNonce={pendingNonce}
                        onChanged={() => {
                          // 예약 생성·취소로 reservedQuantity가 바뀌는데 응답에 실리지 않는다 — 계좌·보유를 다시 읽어야 한다.
                          setAccountNonce((n) => n + 1)
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 미체결 지정가 주문 — 탭 박스 안 가장 아래, 버튼을 눌러야 여는 팝업으로 뺀다(2026-08-19 피드백:
                  이전엔 접으면 아래 콘텐츠가 밀려 스크롤이 길어지는 아코디언이었다). 주식 지정가는 백엔드에
                  없어(주식은 재생 데이터라 "이 가격 도달 시" 조건이 성립하지 않는다) 코인 탭에서만 보여준다. */}
              {isCrypto && (
                <div className="mt-4 border-t border-white/[0.08] pt-3">
                  <button
                    type="button"
                    onClick={() => setPendingOrdersOpen(true)}
                    className="flex w-full items-center justify-between rounded-2xl border border-line bg-elevated px-4 py-3 text-sm text-ink transition-colors duration-300 hover:bg-white/[0.06]"
                  >
                    <span className="font-medium">미체결 지정가 주문</span>
                    <span aria-hidden="true" className="text-muted">
                      ›
                    </span>
                  </button>
                </div>
              )}
                  </>
                )}

                {/* 7. 커뮤니티 미리보기 — CommunityPreview 는 여기서만 쓰여서 자기 Card 를 빼고 이 탭 박스 안 콘텐츠로 그린다 */}
                {rightPanelTab === 'community' && selected && (
                  <CommunityPreview instrumentId={selected.instrumentId} instrumentName={selected.name} />
                )}
              </div>

              {/*
                6. 미체결 지정가 주문 팝업 — Card(bezel-core)가 이미 relative overflow-hidden 이라
                absolute 로 띄우면 박스 폭·높이를 벗어나지 못하고 그 안에서만 뜬다("보폭 안에서"
                피드백). PendingOrders 는 Portfolio 화면에서 독립 Card 로도 쓰여서 bare 모드로
                자체 Card·제목을 생략하고 여기 팝업 셸에 끼워 넣는다.
              */}
              {pendingOrdersOpen && rightPanelTab === 'order' && isCrypto && (
                <div
                  className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4"
                  onClick={() => setPendingOrdersOpen(false)}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="미체결 지정가 주문"
                    className="max-h-full w-full overflow-y-auto rounded-2xl border border-line bg-canvas shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="sticky top-0 flex items-center justify-between border-b border-line bg-canvas px-4 py-3">
                      <h3 className="font-display text-sm font-semibold text-ink">미체결 지정가 주문</h3>
                      <button
                        type="button"
                        onClick={() => setPendingOrdersOpen(false)}
                        aria-label="닫기"
                        className="text-muted transition-colors duration-300 hover:text-ink"
                      >
                        ✕
                      </button>
                    </div>
                    <PendingOrders
                      bare
                      market={market}
                      refreshNonce={pendingNonce}
                      onChanged={() => {
                        // 예약분 변화가 응답에 실려 오지 않아 계좌·보유를 반드시 다시 읽어야 한다.
                        setAccountNonce((n) => n + 1)
                      }}
                    />
                  </div>
                </div>
              )}
            </Card>
            </div>
          </div>
        </div>
      </div>

      <OrderTypeGuideDialog open={orderTypeGuideOpen} onClose={closeOrderTypeGuide} />
    </div>
  )
}
