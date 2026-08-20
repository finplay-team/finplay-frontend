// 사건 상태 줄·피드가 스포일러 규칙(원인 두 경우를 구분하지 않음·시각을 만들지 않음)을 지키는지 검증한다.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScenarioEventFeed, ScenarioEventSummary, ScenarioStatusLine } from './ScenarioEventPanel'
import type { PracticeScenarioEventResponse } from '../../services/tutorialTypes'

const events: PracticeScenarioEventResponse[] = [
  { stage: 'ACT1', headline: '[연습] 알파코인, 주요 거래소 추가 상장' },
  { stage: 'ACT2', headline: '[연습] 알파코인 상장 일정 연기 보도' },
]

function statusLine(props: Partial<Parameters<typeof ScenarioStatusLine>[0]> = {}) {
  return render(<ScenarioStatusLine market="CRYPTO" stage="ACT2" progressing causeStatus="REVEALED" {...props} />)
}

function feed(props: Partial<Parameters<typeof ScenarioEventFeed>[0]> = {}) {
  return render(<ScenarioEventFeed market="CRYPTO" instrumentName="알파코인" events={events} {...props} />)
}

describe('ScenarioStatusLine', () => {
  it('NONE_KNOWN은 "알려진 원인 없음" 한 문구로만 그리고 미공개를 암시하지 않는다', () => {
    statusLine({ causeStatus: 'NONE_KNOWN' })

    expect(screen.getByText(/알려진 원인 없음/)).toBeInTheDocument()
    // "아직"·"곧" 같은 말이 붙으면 뉴스가 온다는 신호가 되어, 이 기능이 막으려던 스포일러가 된다.
    expect(screen.queryByText(/아직 밝혀지지|곧 밝혀|확인 중/)).not.toBeInTheDocument()
  })

  it('진행 중이 아니면 기다리는 중으로 말한다', () => {
    statusLine({ progressing: false })

    expect(screen.getByText(/다음 움직임을 기다리는 중입니다/)).toBeInTheDocument()
  })

  it('FINISHED면 이야기가 끝났다고 알리고 원인 상태를 덧붙이지 않는다', () => {
    statusLine({ stage: 'FINISHED', progressing: false, causeStatus: 'NONE_KNOWN' })

    expect(screen.getByText(/이야기가 끝났습니다/)).toBeInTheDocument()
    expect(screen.queryByText(/알려진 원인 없음/)).not.toBeInTheDocument()
  })

  it('막 번호를 화면에 쓰지 않는다', () => {
    statusLine()

    // "4막 중 2막"처럼 그리면 이야기가 얼마나 남았는지를 알려 주게 된다.
    expect(screen.queryByText(/\d막/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ACT\d/)).not.toBeInTheDocument()
  })

  it('왼쪽 컬럼을 보라는 힌트를 남긴다', () => {
    statusLine()

    expect(screen.getByText(/왼쪽에서 소식 확인/)).toBeInTheDocument()
  })
})

describe('ScenarioEventFeed', () => {
  it('공개 순서를 뒤집어 가장 최근 사건을 맨 위에 그린다', () => {
    feed()

    const headlines = screen.getAllByText(/^\[연습\]/).map((element) => element.textContent)

    // 서버는 오래된 것 → 최근 순으로 준다. 화면은 최신이 위다.
    expect(headlines).toEqual([
      '[연습] 알파코인 상장 일정 연기 보도',
      '[연습] 알파코인, 주요 거래소 추가 상장',
    ])
  })

  it('headline의 [연습] 접두를 떼지 않는다', () => {
    feed()

    // 캡처해서 밖으로 옮겨도 가상 사건임이 문구 자체에 남아야 한다(SCENARIO-017).
    expect(screen.getByText('[연습] 알파코인 상장 일정 연기 보도')).toBeInTheDocument()
  })

  it('시각을 숫자로 만들지 않고 상대 표현만 쓴다', () => {
    feed()

    // 서버의 이야기 시계와 화면 시계가 다른 시계라 "12분 전" 같은 숫자는 틀린 값이 된다.
    expect(screen.queryByText(/\d+\s*(분|시간|초)\s*전/)).not.toBeInTheDocument()
    expect(screen.getByText('가장 최근')).toBeInTheDocument()
    expect(screen.getByText('그 전에')).toBeInTheDocument()
  })

  it('공개된 사건이 없으면 앞으로 온다고 약속하지 않고 사실만 말한다', () => {
    feed({ events: [] })

    expect(screen.getByText(/아직 공개된 사건이 없습니다/)).toBeInTheDocument()
  })

  it('종목 이름 첫 글자로 아바타를 그린다 — 실제 사진이 아니다', () => {
    feed({ instrumentName: '알파코인' })

    // aria-hidden 장식 요소라 텍스트 노드로만 확인한다.
    expect(screen.getAllByText('알').length).toBeGreaterThan(0)
  })

  it('헤드라인에 없는 단어로는 상황 아이콘을 고르지 않는다 — 못 찾으면 중립으로 떨어진다', () => {
    // "감사 인사" 같은 카테고리 규칙 밖 문장이면 어떤 규칙도 걸리지 않아야 한다.
    feed({ events: [{ stage: 'ACT1', headline: '[연습] 알파코인 관련 특이 동향은 없습니다.' }] })

    // 아이콘 선택 자체는 svg라 텍스트로 검증할 수 없으므로, 최소한 렌더가 깨지지 않는지만 확인한다.
    expect(screen.getByText('[연습] 알파코인 관련 특이 동향은 없습니다.')).toBeInTheDocument()
  })
})

describe('ScenarioEventSummary', () => {
  it('완료 시점에도 헤드라인을 그대로 보여준다', () => {
    render(<ScenarioEventSummary events={events} />)

    expect(screen.getByText('[연습] 알파코인, 주요 거래소 추가 상장')).toBeInTheDocument()
    expect(screen.getByText('[연습] 알파코인 상장 일정 연기 보도')).toBeInTheDocument()
  })

  it('사건이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<ScenarioEventSummary events={[]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
