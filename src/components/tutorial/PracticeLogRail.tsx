// 3단계 실습 진행 상태를 세로 로그 형태로 보여주는 레일 컴포넌트
import type { ReactNode } from 'react'

export interface PracticeLogStep {
  step: number
  title: string
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'
  locked: boolean
  /** 완료·진행 시각 등 한 줄 요약. 없으면 표시하지 않는다. */
  evidenceLabel?: string
  children: ReactNode
}

function NodeMark({ status, locked }: { status: PracticeLogStep['status']; locked: boolean }) {
  // 잠긴 단계는 실제 status 와 무관하게 NOT_STARTED 모양을 강제한다
  const effective = locked ? 'NOT_STARTED' : status

  if (effective === 'IN_PROGRESS') {
    return <div className="h-3.5 w-3.5 shrink-0 rounded-full bg-brand animate-pulse-soft" />
  }
  if (effective === 'COMPLETED') {
    return <div className="h-3.5 w-3.5 shrink-0 rounded-full bg-brand" />
  }
  return <div className="h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-line" />
}

export function PracticeLogRail({ steps }: { steps: PracticeLogStep[] }) {
  return (
    <div>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        return (
          <div
            key={step.step}
            id={`practice-step-${step.step}`}
            className={`flex gap-4 ${step.locked ? 'opacity-40' : ''}`}
          >
            <div className="flex flex-col items-center">
              <NodeMark status={step.status} locked={step.locked} />
              {!isLast && <div className="mt-1 w-[1.5px] flex-1 bg-line" />}
            </div>
            <div className={`flex-1 ${isLast ? 'pb-1' : 'pb-8'}`}>
              <p className="font-display text-[15px] text-ink">{step.title}</p>
              {step.evidenceLabel && (
                <p className="mt-1 text-xs text-muted">{step.evidenceLabel}</p>
              )}
              <div className="mt-3">
                {step.locked ? (
                  <p className="text-sm text-muted">
                    {step.step - 1}단계를 먼저 완료하면 열립니다.
                  </p>
                ) : (
                  step.children
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
