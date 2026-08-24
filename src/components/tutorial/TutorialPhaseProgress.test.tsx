// 학습 단계 목록이 늘 펼쳐져 있고 지금 국면만 강조되는지 검증한다
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TutorialPhaseProgress } from './TutorialPhaseProgress'

describe('TutorialPhaseProgress', () => {
  it('토글 없이 다섯 국면을 모두 늘 보여준다', () => {
    render(<TutorialPhaseProgress market="CRYPTO" phase="PLAN" />)

    const list = screen.getByRole('list', { name: '학습 단계' })
    expect(list).toBeInTheDocument()
    ;['연습할 종목 고르기', '주문 넣는 법 익히기', '흔들리기 전에 팔 기준 정하기', '규칙이 대신 파는 것 지켜보기', '되돌아보기'].forEach(
      (label) => expect(screen.getByText(label)).toBeInTheDocument(),
    )
  })

  it('지금 국면의 점만 aria-current와 강조 스타일을 받고, 이름은 점 목록 옆 문장으로 보인다', () => {
    render(<TutorialPhaseProgress market="CRYPTO" phase="PLAN" />)

    const list = screen.getByRole('list', { name: '학습 단계' })
    const currentDot = within(list).getByTitle('흔들리기 전에 팔 기준 정하기')
    expect(currentDot).toHaveAttribute('aria-current', 'step')
    expect(currentDot.className).toContain('bg-brand')

    const otherDot = within(list).getByTitle('되돌아보기')
    expect(otherDot).not.toHaveAttribute('aria-current')
    expect(otherDot.className).not.toContain('bg-brand')

    // 점 목록 밖의 문장이 지금 국면 이름을 말한다 — 점만으로는 알아볼 수 없기 때문이다.
    expect(screen.getByText('흔들리기 전에 팔 기준 정하기')).toBeInTheDocument()
  })

  it('주식 시장에서는 주식용 국면 이름을 쓴다', () => {
    render(<TutorialPhaseProgress market="STOCK" phase="PLAN" />)

    expect(screen.getByText('사보기')).toBeInTheDocument()
    expect(screen.queryByText('흔들리기 전에 팔 기준 정하기')).not.toBeInTheDocument()
  })
})
