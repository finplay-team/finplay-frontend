// 학습 단계 토글이 접힌 채로 시작해 펼치면 지금 국면만 강조해 보여주는지 검증한다
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TutorialPhaseProgress } from './TutorialPhaseProgress'

describe('TutorialPhaseProgress', () => {
  it('처음에는 접혀 있어 단계 목록을 보여주지 않는다', () => {
    render(<TutorialPhaseProgress market="CRYPTO" phase="PLAN" />)

    expect(screen.getByRole('button', { name: '학습 단계 보기' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '학습 단계' })).not.toBeInTheDocument()
  })

  it('토글을 누르면 펼쳐지고, 지금 국면만 강조 스타일을 받는다', () => {
    render(<TutorialPhaseProgress market="CRYPTO" phase="PLAN" />)

    fireEvent.click(screen.getByRole('button', { name: '학습 단계 보기' }))

    expect(screen.getByRole('button', { name: '학습 단계 숨기기' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: '학습 단계' })
    expect(list).toBeInTheDocument()
    const current = screen.getByText('흔들리기 전에 팔 기준 정하기')
    expect(current.className).toContain('text-brand')
    const other = screen.getByText('되돌아보기')
    expect(other.className).not.toContain('text-brand')
  })

  it('다시 누르면 접힌다', () => {
    render(<TutorialPhaseProgress market="CRYPTO" phase="SELECT" />)

    fireEvent.click(screen.getByRole('button', { name: '학습 단계 보기' }))
    fireEvent.click(screen.getByRole('button', { name: '학습 단계 숨기기' }))

    expect(screen.queryByRole('list', { name: '학습 단계' })).not.toBeInTheDocument()
  })

  it('주식 시장에서는 주식용 국면 이름을 쓴다', () => {
    render(<TutorialPhaseProgress market="STOCK" phase="PLAN" />)

    fireEvent.click(screen.getByRole('button', { name: '학습 단계 보기' }))

    expect(screen.getByText('사보기')).toBeInTheDocument()
    expect(screen.queryByText('흔들리기 전에 팔 기준 정하기')).not.toBeInTheDocument()
  })
})
