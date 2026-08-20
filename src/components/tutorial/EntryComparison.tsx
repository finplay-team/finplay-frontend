// 완료 화면의 진입별 대조 카드 — 실제 손익과 "안 팔았다면"을 나란히 그린다
import { formatKRW, formatSignedKRW, pnlTone } from '../../lib/format'
import type {
  PracticeEntryResponse,
  PracticeExitPreset,
  PracticeSellCause,
} from '../../services/tutorialTypes'

/**
 * 서버는 프리셋 표시 이름을 주지 않는다(계약 명시) — 화면이 정하는 말이라 여기 한 곳에만 두고,
 * 매수 전 프리셋 선택 UI(AttemptTutorialFlow.tsx)도 이 맵을 그대로 가져다 쓴다.
 */
export const PRESET_LABEL: Record<PracticeExitPreset, string> = {
  CAUTIOUS: '조심스럽게',
  BALANCED: '보통',
  RELAXED: '느긋하게',
}

/**
 * `MANUAL`은 "사용자가 직접 팔았다"는 뜻이다. 예약이 가리키지 않는 매도는 전부 여기 들어가므로
 * 예약 자체가 없는 주식 튜토리얼도 MANUAL이다 — "예약이 안 걸렸다"는 식으로 읽히는 말을 쓰지 않는다.
 */
const CAUSE_LABEL: Record<PracticeSellCause, string> = {
  STOP_LOSS: '손절로 팔림',
  TAKE_PROFIT: '익절로 팔림',
  MANUAL: '직접 팔았습니다',
}

const CAUSE_TONE: Record<PracticeSellCause, string> = {
  STOP_LOSS: 'border-loss/40 bg-loss/10 text-loss',
  TAKE_PROFIT: 'border-gain/40 bg-gain/10 text-gain',
  MANUAL: 'border-line bg-elevated text-muted',
}

/** 코인은 소수 수량이 나온다 — 반올림해 "0개"라고 말하지 않도록 자리를 살린다. */
function formatQuantity(value: number): string {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 8 })
}

function Chip({ tone, children }: { tone: string; children: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}>{children}</span>
  )
}

function EntryCard({ entry }: { entry: PracticeEntryResponse }) {
  const sold = entry.sellPrice !== null && entry.sellQuantity !== null
  /**
   * 부분 매도한 진입에서는 아래 두 금액이 **판 수량 기준**이라 산 수량과 다르다. 두 금액을 전체 매수
   * 수량의 것으로 읽으면 틀리므로, 다를 때는 라벨과 별개로 한 줄을 더 붙여 밝힌다.
   */
  const partial =
    sold && entry.sellQuantity !== null && Math.abs(entry.sellQuantity - entry.buyQuantity) > 1e-8

  return (
    <article className="rounded-2xl border border-line bg-elevated/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{entry.entrySequence}번째 진입</p>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="border-line bg-elevated text-muted">{PRESET_LABEL[entry.exitPreset]}</Chip>
          {entry.sellCause !== null && (
            <Chip tone={CAUSE_TONE[entry.sellCause]}>{CAUSE_LABEL[entry.sellCause]}</Chip>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted tabular">
        <span className="text-ink">{formatKRW(entry.buyPrice)}</span>에{' '}
        {formatQuantity(entry.buyQuantity)}개를 샀고
        {sold ? (
          <>
            {' '}
            <span className="text-ink">{formatKRW(entry.sellPrice as number)}</span>에{' '}
            {formatQuantity(entry.sellQuantity as number)}개를 팔았습니다.
          </>
        ) : (
          <> 아직 팔지 않았습니다.</>
        )}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted tabular">
        기준선은 손절 {formatKRW(entry.stopLossPrice)} · 익절 {formatKRW(entry.takeProfitPrice)}이었습니다.
      </p>

      {sold && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-elevated px-3 py-2.5">
            <p className="text-[11px] text-muted">실제 손익{partial ? ' (판 만큼)' : ''}</p>
            <p className={`mt-0.5 tabular text-lg font-semibold ${pnlTone(entry.realizedPnl ?? 0)}`}>
              {entry.realizedPnl === null ? '-' : formatSignedKRW(entry.realizedPnl)}
            </p>
          </div>
          {/*
            대본을 쓰지 않는 실행은 서버가 이 값을 주지 않는다(priceAfterSell이 null이라 계산 자체가 없다).
            그때는 칸을 통째로 뺀다 — 빈 칸을 남기면 "0원"이나 "계산 중"으로 읽힌다.
          */}
          {entry.unrealizedPnlIfHeld !== null && (
            <div className="rounded-xl border border-dashed border-line px-3 py-2.5">
              <p className="text-[11px] text-muted">안 팔았다면</p>
              <p className={`mt-0.5 tabular text-lg font-semibold ${pnlTone(entry.unrealizedPnlIfHeld)}`}>
                {formatSignedKRW(entry.unrealizedPnlIfHeld)}
              </p>
            </div>
          )}
        </div>
      )}

      {partial && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          이 진입은 일부만 팔았습니다. 위 두 금액은 판 수량 기준입니다.
        </p>
      )}
    </article>
  )
}

/**
 * 진입별 대조 목록.
 *
 * **재진입한 사용자는 카드가 두 장이고 각각 손절·익절로 다르게 보인다** — 실행 전체 합(`tradeResult`)만
 * 그리던 시절에는 첫 매도 하나만 보여서 "2막에서 손절당하고 3막에서 익절한" 이야기가 사라졌다.
 *
 * `layout`은 자리 폭만 정한다. wide는 완료 결과 모달(가로 2열), narrow는 되돌아보기 탭(세로 스택)이다.
 */
export function EntryComparison({
  entries,
  layout,
}: {
  entries: PracticeEntryResponse[]
  layout: 'wide' | 'narrow'
}) {
  if (entries.length === 0) return null
  return (
    <div className={layout === 'wide' ? 'grid gap-3 md:grid-cols-2' : 'space-y-3'}>
      {entries.map((entry) => (
        <EntryCard key={entry.entrySequence} entry={entry} />
      ))}
    </div>
  )
}
