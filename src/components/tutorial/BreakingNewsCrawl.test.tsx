// 속보 자막이 tick마다가 아니라 새 사건이 실제로 늘어난 순간에만 뜨는지, 끝나면 사라지는지 검증한다.
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BreakingNewsCrawl } from './BreakingNewsCrawl'
import type { PracticeScenarioEventResponse } from '../../services/tutorialTypes'

const event1: PracticeScenarioEventResponse = {
  stage: 'ACT1',
  headline: '[연습] 알파코인, 주요 거래소 추가 상장 논의가 진행 중입니다.',
}
const event2: PracticeScenarioEventResponse = {
  stage: 'ACT2',
  headline: '[연습] 알파코인 상장 일정이 연기됐다는 보도가 나왔습니다.',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BreakingNewsCrawl', () => {
  it('처음 그릴 때(이미 있던 사건)는 흘려보내지 않는다', () => {
    render(<BreakingNewsCrawl market="CRYPTO" events={[event1]} />)

    expect(screen.queryByText('속보')).not.toBeInTheDocument()
  })

  it('사건이 새로 늘어나면 그 헤드라인을 그대로 흘려보낸다', async () => {
    const { rerender } = render(<BreakingNewsCrawl market="CRYPTO" events={[event1]} />)

    rerender(<BreakingNewsCrawl market="CRYPTO" events={[event1, event2]} />)

    expect(await screen.findByText('속보')).toBeInTheDocument()
    // [연습] 접두를 포함해 헤드라인 그대로다 — 요약·재가공하지 않는다.
    expect(screen.getByText(event2.headline)).toBeInTheDocument()
  })

  it('사건 개수가 그대로면(같은 배열 재전달) 다시 흘려보내지 않는다', () => {
    const { rerender } = render(<BreakingNewsCrawl market="CRYPTO" events={[event1, event2]} />)

    rerender(<BreakingNewsCrawl market="CRYPTO" events={[event1, event2]} />)

    expect(screen.queryByText('속보')).not.toBeInTheDocument()
  })

  it('애니메이션이 끝나면 자막이 사라진다', async () => {
    // jsdom은 matchMedia가 없어 기본값이 "줄임"으로 판정된다 — 실제 애니메이션 경로를 타도록
    // 명시적으로 "줄이지 않음"을 준다. 재생 시간은 test/setup.ts의 스텁이 20ms로 고정한다.
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)

    const { rerender } = render(<BreakingNewsCrawl market="CRYPTO" events={[event1]} />)
    rerender(<BreakingNewsCrawl market="CRYPTO" events={[event1, event2]} />)

    expect(await screen.findByText('속보')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('속보')).not.toBeInTheDocument())
  })

  it('애니메이션을 줄여야 하면 흘리지 않고 잠깐 고정해서 보여준다', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)

    const { rerender } = render(<BreakingNewsCrawl market="CRYPTO" events={[event1]} />)
    rerender(<BreakingNewsCrawl market="CRYPTO" events={[event1, event2]} />)

    expect(await screen.findByText('속보')).toBeInTheDocument()
    expect(screen.getByText(event2.headline)).toBeInTheDocument()
  })

  it('여러 건이 한꺼번에 늘어도 가장 최근 하나만 보여준다', async () => {
    const { rerender } = render(<BreakingNewsCrawl market="CRYPTO" events={[]} />)

    rerender(<BreakingNewsCrawl market="CRYPTO" events={[event1, event2]} />)

    expect(await screen.findByText('속보')).toBeInTheDocument()
    expect(screen.getByText(event2.headline)).toBeInTheDocument()
    expect(screen.queryByText(event1.headline)).not.toBeInTheDocument()
  })
})
