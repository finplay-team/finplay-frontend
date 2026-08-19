// 시장별 튜토리얼 진행 상태를 조회하는 훅 — 내비게이션의 "아직 안 끝냈어요" 표시가 쓴다.
// 튜토리얼은 건너뛸 수 있어 강제 라우팅 가드는 없다(언제든 다시 방문해 진행할 수 있다).
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getTutorialRevision, subscribeTutorial } from '../lib/tutorialPulse'
import { STOCK_TUTORIAL_ENTRY_OPEN, hasStartedPractice } from '../lib/tutorialMarkets'
import { getPracticeProgress } from '../services/tutorialService'
import type { InvestmentPracticeResponse } from '../services/tutorialTypes'

export interface TutorialProgressState {
  stock: InvestmentPracticeResponse | null
  crypto: InvestmentPracticeResponse | null
  /** 조회 자체가 실패했는지 — 조회 실패도 앱을 막지 않는다(가드 자체가 없다). */
  error: boolean
  loading: boolean
  /**
   * 주식·코인 두 시장을 모두 완료했는지. 보상도 완료도 시장별로 따로라서 한쪽만 끝난 사용자는
   * 아직 "완료"가 아니다. 조회하지 못한 시장(null)은 미완료로 본다.
   */
  allCompleted: boolean
  refresh: () => void
}

/** 두 시장을 병렬로 읽는다. 실패한 시장은 null 로 남아 "미완료"로 취급된다(안전 쪽으로 폴백). */
export function useTutorialProgress(): TutorialProgressState {
  const { status } = useAuth()
  const revision = useSyncExternalStore(subscribeTutorial, getTutorialRevision)
  const [stock, setStock] = useState<InvestmentPracticeResponse | null>(null)
  const [crypto, setCrypto] = useState<InvestmentPracticeResponse | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    // 'restoring'(토큰 검증 중)은 기다리되, /api/auth/me 자체가 응답 없이 멈추는 경우(실제로 겪음 —
    // 백엔드 쪽 문제)까지 무한정 기다리면 이 페이지가 영원히 스켈레톤으로 멈춘다. 일정 시간 후에는
    // 포기하고 error 로 폴백한다.
    if (status === 'restoring') {
      const timer = setTimeout(() => {
        setError(true)
        setLoading(false)
      }, 8000)
      return () => clearTimeout(timer)
    }
    if (status === 'anonymous') {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(false)
    Promise.allSettled([getPracticeProgress('STOCK'), getPracticeProgress('CRYPTO')])
      .then(([s, c]) => {
        if (cancelled) return
        setStock(s.status === 'fulfilled' ? s.value : null)
        setCrypto(c.status === 'fulfilled' ? c.value : null)
        setError(s.status === 'rejected' && c.status === 'rejected')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [status, revision, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  /**
   * 주식 튜토리얼 입구를 닫은 동안(lib/tutorialMarkets.ts), 시작한 적 없는 주식은 "끝내야 할 일"에서
   * 뺀다. 그렇게 하지 않으면 코인을 끝낸 사용자가 들어갈 수도 없는 주식 때문에 내비게이션에서
   * 영원히 "아직 안 끝냈어요"를 보게 된다. 이미 주식을 시작한 사용자는 탭이 그대로 보이므로
   * 예전처럼 완료를 요구한다.
   */
  const stockCounts = STOCK_TUTORIAL_ENTRY_OPEN || hasStartedPractice(stock)
  const allCompleted =
    (!stockCounts || stock?.status === 'COMPLETED') && crypto?.status === 'COMPLETED'

  return { stock, crypto, error, loading, allCompleted, refresh }
}
