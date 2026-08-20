// 사건 패널이 스포일러 규칙(원인 두 경우를 구분하지 않음·시각을 만들지 않음)을 지키는지 DOM에서 검증한다.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScenarioEventPanel } from './ScenarioEventPanel'
import type { PracticeScenarioEventResponse } from '../../services/tutorialTypes'

const events: PracticeScenarioEventResponse[] = [
  { stage: 'ACT1', headline: '[연습] 알파코인, 주요 거래소 추가 상장' },
  { stage: 'ACT2', headline: '[연습] 알파코인 상장 일정 연기 보도' },
]

function panel(props: Partial<Parameters<typeof ScenarioEventPanel>[0]> = {}) {
  return render(
    <ScenarioEventPanel
      market="CRYPTO"
      stage="ACT2"
      progressing
      causeStatus="REVEALED"
      events={events}
      {...props}
    />,
  )
}

describe('ScenarioEventPanel', () => {
  it('공개 순서를 뒤집어 가장 최근 사건을 맨 위에 그린다', () => {
    panel()

    const headlines = screen
      .getAllByText(/^\[연습\]/)
      .map((element) => element.textContent)

    // 서버는 오래된 것 → 최근 순으로 준다. 화면은 최신이 위다.
    expect(headlines).toEqual([
      '[연습] 알파코인 상장 일정 연기 보도',
      '[연습] 알파코인, 주요 거래소 추가 상장',
    ])
  })

  it('headline의 [연습] 접두를 떼지 않는다', () => {
    panel()

    // 캡처해서 밖으로 옮겨도 가상 사건임이 문구 자체에 남아야 한다(SCENARIO-017).
    expect(screen.getByText('[연습] 알파코인 상장 일정 연기 보도')).toBeInTheDocument()
  })

  it('시각을 숫자로 만들지 않고 상대 표현만 쓴다', () => {
    panel()

    // 서버의 이야기 시계와 화면 시계가 다른 시계라 "12분 전" 같은 숫자는 틀린 값이 된다.
    expect(screen.queryByText(/\d+\s*(분|시간|초)\s*전/)).not.toBeInTheDocument()
    expect(screen.getByText('가장 최근')).toBeInTheDocument()
    expect(screen.getByText('그 전에')).toBeInTheDocument()
  })

  it('NONE_KNOWN은 "알려진 원인 없음" 한 문구로만 그리고 미공개를 암시하지 않는다', () => {
    panel({ causeStatus: 'NONE_KNOWN' })

    expect(screen.getByText(/알려진 원인 없음/)).toBeInTheDocument()
    // "아직"·"곧" 같은 말이 붙으면 뉴스가 온다는 신호가 되어, 이 기능이 막으려던 스포일러가 된다.
    expect(screen.queryByText(/아직 밝혀지지|곧 밝혀|확인 중/)).not.toBeInTheDocument()
  })

  it('진행 중이 아니면 기다리는 중으로 말한다', () => {
    panel({ progressing: false })

    expect(screen.getByText(/다음 움직임을 기다리는 중입니다/)).toBeInTheDocument()
  })

  it('FINISHED면 이야기가 끝났다고 알리고 원인 상태를 덧붙이지 않는다', () => {
    panel({ stage: 'FINISHED', progressing: false, causeStatus: 'NONE_KNOWN' })

    expect(screen.getByText(/이야기가 끝났습니다/)).toBeInTheDocument()
    expect(screen.queryByText(/알려진 원인 없음/)).not.toBeInTheDocument()
  })

  it('막 번호를 화면에 쓰지 않는다', () => {
    panel()

    // "4막 중 2막"처럼 그리면 이야기가 얼마나 남았는지를 알려 주게 된다.
    expect(screen.queryByText(/\d막/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ACT\d/)).not.toBeInTheDocument()
  })

  it('공개된 사건이 없으면 앞으로 온다고 약속하지 않고 사실만 말한다', () => {
    panel({ events: [] })

    expect(screen.getByText(/아직 공개된 사건이 없습니다/)).toBeInTheDocument()
  })
})
