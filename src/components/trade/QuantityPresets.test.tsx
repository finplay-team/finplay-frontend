// 비율 프리셋 버튼이 주식 정수 주·코인 소수 8자리 규칙과 비활성 조건을 지키는지 검증한다
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuantityPresets } from './QuantityPresets'

type Props = Parameters<typeof QuantityPresets>[0]

function renderPresets(overrides: Partial<Props> = {}) {
  const onPick = vi.fn()
  render(
    <QuantityPresets
      side="BUY"
      isCrypto={false}
      availableCash={1_000_000}
      held={0}
      unitPrice={10_000}
      disabledReason={null}
      onPick={onPick}
      {...overrides}
    />,
  )
  return onPick
}

describe('QuantityPresets — 매수 비율', () => {
  it('주식은 정수 주로 내려서 채운다', () => {
    const onPick = renderPresets()

    fireEvent.click(screen.getByRole('button', { name: '50%' }))
    // 500,000 / (10,000 × 1.00015) = 49.99… → 49주
    expect(onPick).toHaveBeenLastCalledWith(49)

    fireEvent.click(screen.getByRole('button', { name: '10%' }))
    expect(onPick).toHaveBeenLastCalledWith(9)
  })

  it('"최대"는 수수료까지 더해도 주문가능 현금을 넘지 않는다', () => {
    const onPick = renderPresets()

    fireEvent.click(screen.getByRole('button', { name: '최대' }))

    // 100주면 1,000,000원 + 수수료 150원이라 잔고를 넘는다 → 99주여야 한다.
    expect(onPick).toHaveBeenLastCalledWith(99)
    const quantity = onPick.mock.calls[0][0] as number
    expect(quantity * 10_000 + Math.floor(quantity * 10_000 * 0.00015)).toBeLessThanOrEqual(1_000_000)
  })

  it('코인은 소수 8자리까지 내려서 채운다', () => {
    const onPick = renderPresets({ isCrypto: true, availableCash: 1_000, unitPrice: 2_000 })

    fireEvent.click(screen.getByRole('button', { name: '최대' }))

    // 1,000 / (2,000 × 1.0005) = 0.4997501249… → 소수 8자리에서 버린다
    expect(onPick).toHaveBeenLastCalledWith(0.49975012)
  })

  it('같은 금액이라도 주식은 한 주도 못 사면 버튼을 잠그고 이유를 알린다', () => {
    renderPresets({ availableCash: 1_000, unitPrice: 2_000 })

    expect(screen.getByRole('button', { name: '최대' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '10%' })).toBeDisabled()
    expect(
      screen.getByText('가진 돈이 적어서 지금 가격으로는 살 수 있는 수량이 없어요.'),
    ).toBeInTheDocument()
  })

  it('기준 가격이 없으면 아무 버튼도 누를 수 없다', () => {
    renderPresets({ unitPrice: null })

    for (const label of ['10%', '25%', '50%', '최대']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled()
    }
  })

  it('부모가 넘긴 이유가 있으면 그대로 보여주고 전부 잠근다', () => {
    renderPresets({ disabledReason: '가진 돈을 불러오는 중이에요.' })

    expect(screen.getByText('가진 돈을 불러오는 중이에요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '최대' })).toBeDisabled()
  })
})

describe('QuantityPresets — 매도 비율', () => {
  it('"최대"는 내림 없이 보유 수량 그대로다', () => {
    const onPick = renderPresets({ side: 'SELL', isCrypto: true, held: 0.12345678 })

    fireEvent.click(screen.getByRole('button', { name: '최대' }))

    expect(onPick).toHaveBeenLastCalledWith(0.12345678)
  })

  it('코인 매도는 소수 8자리까지 내린다', () => {
    const onPick = renderPresets({ side: 'SELL', isCrypto: true, held: 0.12345678 })

    fireEvent.click(screen.getByRole('button', { name: '50%' }))

    expect(onPick).toHaveBeenLastCalledWith(0.06172839)
  })

  it('주식 매도는 정수 주로 내린다', () => {
    const onPick = renderPresets({ side: 'SELL', held: 7 })

    fireEvent.click(screen.getByRole('button', { name: '50%' }))

    expect(onPick).toHaveBeenLastCalledWith(3)
  })

  it('매도는 시세가 없어도 보유 수량만으로 계산한다', () => {
    const onPick = renderPresets({ side: 'SELL', held: 10, unitPrice: null })

    fireEvent.click(screen.getByRole('button', { name: '최대' }))

    expect(onPick).toHaveBeenLastCalledWith(10)
  })

  it('보유 수량이 0 이면 버튼만 잠그고 별도 안내 문구는 보여주지 않는다', () => {
    renderPresets({ side: 'SELL', held: 0 })

    expect(screen.getByRole('button', { name: '최대' })).toBeDisabled()
    expect(screen.queryByText('팔 수 있는 수량이 없어요.')).not.toBeInTheDocument()
  })
})

describe('QuantityPresets — 설명 팝오버', () => {
  it('물음표를 누르면 설명이 뜨고, 다시 누르면 닫힌다', () => {
    renderPresets()

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '이 버튼들 설명 보기' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('10%·25%·50%·75%·최대를 누르면 수량이 알아서 채워져요')

    fireEvent.click(screen.getByRole('button', { name: '이 버튼들 설명 보기' }))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('바깥을 누르면 설명이 닫힌다', () => {
    renderPresets()

    fireEvent.click(screen.getByRole('button', { name: '이 버튼들 설명 보기' }))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
