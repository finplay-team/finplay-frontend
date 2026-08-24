// 학습 단계 목록이 늘 펼쳐져 있고 지금 국면만 강조되는지 검증한다
import { render, screen } from '@testing-library/react'
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

  it('지금 국면만 aria-current와 강조 스타일을 받는다', () => {
    render(<TutorialPhaseProgress market="CRYPTO" phase="PLAN" />)

    const current = screen.getByText('흔들리기 전에 팔 기준 정하기')
    expect(current).toHaveAttribute('aria-current', 'step')
    expect(current.className).toContain('bg-brand')

    const other = screen.getByText('되돌아보기')
    expect(other).not.toHaveAttribute('aria-current')
    expect(other.className).not.toContain('bg-brand')
  })

  it('주식 시장에서는 주식용 국면 이름을 쓴다', () => {
    render(<TutorialPhaseProgress market="STOCK" phase="PLAN" />)

    expect(screen.getByText('사보기')).toBeInTheDocument()
    expect(screen.queryByText('흔들리기 전에 팔 기준 정하기')).not.toBeInTheDocument()
  })
})
