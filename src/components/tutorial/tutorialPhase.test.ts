// 학습 국면 판정(A~E)이 번호 없이도 정직하게 돌아가는지 — 특히 C↔D가 되풀이되는지를 고정한다
import { describe, expect, it } from 'vitest'
import { phaseText, tutorialPhase } from './tutorialPhase'
import type { TutorialPhaseInput } from './tutorialPhase'

function input(overrides: Partial<TutorialPhaseInput> = {}): TutorialPhaseInput {
  return {
    selectingInstrument: false,
    finished: false,
    orderBasics: false,
    supportsExitPlan: true,
    holding: false,
    hasPlan: false,
    goalsComplete: false,
    ...overrides,
  }
}

describe('tutorialPhase', () => {
  it('A — 종목을 아직 안 골랐으면 고르기다', () => {
    expect(tutorialPhase(input({ selectingInstrument: true }))).toBe('SELECT')
    expect(phaseText('SELECT', { market: 'CRYPTO', holding: false })).toEqual({
      title: '연습할 종목 고르기',
      todo: '왼쪽에서 하나 고르세요',
    })
  })

  it('B — 2단계 대본 구간이면 주문 넣는 법이다', () => {
    expect(tutorialPhase(input({ orderBasics: true }))).toBe('ORDER_BASICS')
    expect(phaseText('ORDER_BASICS', { market: 'CRYPTO', holding: false }).title).toBe(
      '주문 넣는 법 익히기',
    )
  })

  it('C — 이야기 구간에서 보유 중이고 예약이 없으면 팔 기준을 정하는 자리다', () => {
    expect(tutorialPhase(input({ holding: true }))).toBe('PLAN')
    expect(phaseText('PLAN', { market: 'CRYPTO', holding: true })).toEqual({
      title: '흔들리기 전에 팔 기준 정하기',
      todo: '얼마나 내려가면 팔지, 올라가면 팔지 지금 정하세요',
    })
  })

  it('D — 예약이 걸려 있으면 지켜보는 자리다', () => {
    expect(tutorialPhase(input({ holding: true, hasPlan: true }))).toBe('WATCH')
    expect(phaseText('WATCH', { market: 'CRYPTO', holding: true })).toEqual({
      title: '규칙이 대신 파는 것 지켜보기',
      todo: '선에 닿을 때까지 기다립니다',
    })
  })

  it('E — 목표 두 칸을 채우면 되돌아보기다', () => {
    expect(tutorialPhase(input({ goalsComplete: true }))).toBe('REVIEW')
    expect(phaseText('REVIEW', { market: 'CRYPTO', holding: false }).title).toBe('되돌아보기')
  })

  it('E — 사용자가 직접 끝냈거나 대본이 끝난 뒤의 전량 매도도 되돌아보기다', () => {
    // `finished`를 국면들보다 먼저 본다 — 끝난 실행에서 "지금 사세요"라고 말하면 안 된다.
    expect(tutorialPhase(input({ finished: true, holding: true, hasPlan: true }))).toBe('REVIEW')
    expect(tutorialPhase(input({ finished: true, orderBasics: true }))).toBe('REVIEW')
  })

  it('C↔D는 되풀이된다 — 손절을 겪으면 이름이 다시 C로 돌아간다', () => {
    // 예약을 걸고 지켜보다가(D) 손절로 정리되면 보유가 사라진다. 그때 사용자가 들어야 하는 말은
    // "겪었습니다"가 아니라 "다시 사서 기준을 정하라"다 — 이름이 되돌아가는 것 자체가 반복의 신호다.
    const watching = input({ holding: true, hasPlan: true })
    expect(tutorialPhase(watching)).toBe('WATCH')

    const afterStopLoss = input({ holding: false, hasPlan: false, goalsComplete: false })
    expect(tutorialPhase(afterStopLoss)).toBe('PLAN')
    expect(phaseText('PLAN', { market: 'CRYPTO', holding: false }).todo).toBe(
      '다시 사고, 얼마나 내려가면 팔지·올라가면 팔지 지금 정하세요',
    )
  })

  it('주식은 예약이 없어 같은 국면이 사보기·팔아보기가 된다', () => {
    // 예약 경로가 코인 전용이라 주식에서는 "흔들리기 전에 팔 기준 정하기"가 영영 오지 않는다.
    expect(tutorialPhase(input({ supportsExitPlan: false, holding: false }))).toBe('PLAN')
    expect(tutorialPhase(input({ supportsExitPlan: false, holding: true }))).toBe('WATCH')
    expect(phaseText('PLAN', { market: 'STOCK', holding: false }).title).toBe('사보기')
    expect(phaseText('WATCH', { market: 'STOCK', holding: true }).title).toBe('팔아보기')
  })

  it('주식은 목표를 다 채워도 보유 중이면 팔아보기에 머문다 — 팔아야 끝이다', () => {
    expect(tutorialPhase(input({ supportsExitPlan: false, holding: true, goalsComplete: true }))).toBe(
      'WATCH',
    )
  })
})
