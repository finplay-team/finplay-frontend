// 진입별 대조 카드가 재진입 이야기를 되살리고 서버 손익을 그대로 그리는지 DOM에서 검증한다.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EntryComparison } from './EntryComparison'
import type { PracticeEntryResponse } from '../../services/tutorialTypes'

function entry(overrides: Partial<PracticeEntryResponse> = {}): PracticeEntryResponse {
  return {
    entrySequence: 1,
    // 자유 비율이 옛 프리셋과 일치하지 않으면 서버가 null을 준다 — 화면은 이 값을 쓰지 않는다.
    exitPreset: null,
    stopLossRate: 3,
    takeProfitRate: 3,
    buyOrderType: 'MARKET',
    scenarioScriptId: 'CRYPTO_STORY_V1',
    buyAt: '2026-08-20T11:00:00',
    buyPrice: 12400,
    buyQuantity: 40,
    stopLossPrice: 12028,
    takeProfitPrice: 12772,
    sellPrice: 12030,
    sellQuantity: 40,
    sellAt: '2026-08-20T11:12:00',
    sellCause: 'STOP_LOSS',
    realizedPnl: -15_860,
    unrealizedPnlIfHeld: 38_200,
    ...overrides,
  }
}

describe('EntryComparison', () => {
  it('재진입한 실행은 카드가 두 장이고 각각 손절·익절로 다르게 보인다', () => {
    // 이 기능 이전에는 첫 매도 하나만 보여서 "2막 손절 → 3막 익절" 이야기가 사라졌다.
    render(
      <EntryComparison
        layout="wide"
        entries={[
          entry(),
          entry({
            entrySequence: 2,
            stopLossRate: 5,
            takeProfitRate: 8,
            sellCause: 'TAKE_PROFIT',
            realizedPnl: 27_180,
            unrealizedPnlIfHeld: 19_440,
          }),
        ]}
      />,
    )

    expect(screen.getByText('1번째 진입')).toBeInTheDocument()
    expect(screen.getByText('2번째 진입')).toBeInTheDocument()
    expect(screen.getByText('손절로 팔림')).toBeInTheDocument()
    expect(screen.getByText('익절로 팔림')).toBeInTheDocument()
    // 프리셋 이름이 아니라 그 진입에 실제로 적용된 비율을 진입별로 보여준다.
    expect(screen.getByText('손절 −3% · 익절 +3%')).toBeInTheDocument()
    expect(screen.getByText('손절 −5% · 익절 +8%')).toBeInTheDocument()
    expect(screen.queryByText('보통')).not.toBeInTheDocument()
    expect(screen.queryByText('조심스럽게')).not.toBeInTheDocument()
  })

  it('손익을 다시 계산하지 않고 서버 값을 그대로 그린다', () => {
    // 단가 × 수량은 (12,030 − 12,400) × 40 = −14,800원이지만, 서버 원장은 수수료가 반영된
    // −15,860원이다. 화면이 재계산하면 서버와 어긋난다(백엔드 이슈 #421).
    render(<EntryComparison layout="narrow" entries={[entry()]} />)

    expect(screen.getByText('-15,860원')).toBeInTheDocument()
    expect(screen.queryByText('-14,800원')).not.toBeInTheDocument()
    expect(screen.getByText('+38,200원')).toBeInTheDocument()
  })

  it('부분 매도한 진입은 두 금액이 판 수량 기준임을 밝힌다', () => {
    render(<EntryComparison layout="narrow" entries={[entry({ sellQuantity: 25 })]} />)

    expect(screen.getByText('실제 손익 (판 만큼)')).toBeInTheDocument()
    expect(screen.getByText(/이 진입은 일부만 팔았습니다/)).toBeInTheDocument()
  })

  it('전량 매도한 진입에는 판 수량 단서를 붙이지 않는다', () => {
    render(<EntryComparison layout="narrow" entries={[entry()]} />)

    expect(screen.getByText('실제 손익')).toBeInTheDocument()
    expect(screen.queryByText(/이 진입은 일부만 팔았습니다/)).not.toBeInTheDocument()
  })

  it('대본이 없어 안 팔았다면 값이 없으면 그 칸을 통째로 뺀다', () => {
    // 빈 칸을 남기면 "0원"이나 "계산 중"으로 읽힌다.
    render(<EntryComparison layout="narrow" entries={[entry({ unrealizedPnlIfHeld: null })]} />)

    expect(screen.queryByText('안 팔았다면')).not.toBeInTheDocument()
    expect(screen.getByText('-15,860원')).toBeInTheDocument()
  })

  it('2단계(ORDER_BASICS) 진입은 서버가 값을 줘도 "안 팔았다면" 칸을 뺀다', () => {
    // 2단계는 자동 청산 자체가 없어(049 ORDERBASICS-022) 손절·익절을 안 지켰다는 비교가 성립하지
    // 않는다 — 값이 와도 3단계 전용 교훈이라 보여주지 않는다(2026-08-21 피드백).
    render(
      <EntryComparison
        layout="narrow"
        entries={[entry({ scenarioScriptId: 'CRYPTO_ORDER_BASICS_V1', unrealizedPnlIfHeld: 38_200 })]}
      />,
    )

    expect(screen.queryByText('안 팔았다면')).not.toBeInTheDocument()
    expect(screen.getByText('실제 손익')).toBeInTheDocument()
  })

  it('아직 팔지 않은 진입은 손익 대신 보유 중임을 말한다', () => {
    render(
      <EntryComparison
        layout="narrow"
        entries={[
          entry({
            sellPrice: null,
            sellQuantity: null,
            sellAt: null,
            sellCause: null,
            realizedPnl: null,
            unrealizedPnlIfHeld: null,
          }),
        ]}
      />,
    )

    expect(screen.getByText(/아직 팔지 않았습니다/)).toBeInTheDocument()
    expect(screen.queryByText(/실제 손익/)).not.toBeInTheDocument()
  })

  it('2단계(ORDER_BASICS)에서 연 진입에만 "2단계 연습" 칩을 붙인다 (049 "5-A")', () => {
    render(
      <EntryComparison
        layout="wide"
        entries={[
          entry({ entrySequence: 1, scenarioScriptId: 'CRYPTO_ORDER_BASICS_V1' }),
          entry({ entrySequence: 2, scenarioScriptId: 'CRYPTO_STORY_V1' }),
        ]}
      />,
    )

    expect(screen.getByText('2단계 연습')).toBeInTheDocument()
    // 3단계(이야기) 진입은 매번 당연한 걸 말하지 않는다 — 칩이 하나뿐이어야 한다.
    expect(screen.getAllByText('2단계 연습')).toHaveLength(1)
  })

  it('대본이 없는 실행(scenarioScriptId=null)은 대본 칩을 안 붙인다', () => {
    render(<EntryComparison layout="narrow" entries={[entry({ scenarioScriptId: null })]} />)

    expect(screen.queryByText('2단계 연습')).not.toBeInTheDocument()
  })

  it('진입이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<EntryComparison layout="narrow" entries={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('진입별 비율이 서로 달라도 각 카드가 자기 비율을 그린다 (attempt의 현재 값이 아니다)', () => {
    // 재진입 사이에 기준을 다시 정할 수 있으므로 진입마다 값이 다르다.
    render(
      <EntryComparison
        layout="wide"
        entries={[entry({ stopLossRate: 2, takeProfitRate: 7 }), entry({ entrySequence: 2, stopLossRate: 4.5, takeProfitRate: 3 })]}
      />,
    )

    expect(screen.getByText('손절 −2% · 익절 +7%')).toBeInTheDocument()
    expect(screen.getByText('손절 −4.5% · 익절 +3%')).toBeInTheDocument()
  })

  it('진입별 비율이 아직 응답에 없으면 기준선 가격에서 되돌려 계산한다 (폴백)', () => {
    // 12,400 → 손절 12,028 은 -3%, 익절 12,772 는 +3%다.
    render(
      <EntryComparison
        layout="narrow"
        entries={[entry({ stopLossRate: undefined, takeProfitRate: undefined })]}
      />,
    )

    expect(screen.getByText('손절 −3% · 익절 +3%')).toBeInTheDocument()
  })
})
