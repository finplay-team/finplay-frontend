// 시장별 튜토리얼 진행 상태를 조회하는 훅 — RequireTutorial 가드와 /tutorial 페이지가 함께 쓴다
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getTutorialRevision, subscribeTutorial } from '../lib/tutorialPulse'
import { getPracticeProgress } from '../services/tutorialService'
import type { InvestmentPracticeResponse } from '../services/tutorialTypes'

export interface TutorialProgressState {
  stock: InvestmentPracticeResponse | null
  crypto: InvestmentPracticeResponse | null
  /** 조회 자체가 실패했는지 — 실패해도 강제 라우팅으로 앱을 막지 않는다(아래 useTutorialGate 참고). */
  error: boolean
  loading: boolean
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
    // 'restoring'(토큰 검증 중)에서 loading 을 내리면, 데이터가 아직 하나도 없는 채로
    // useTutorialGate 가 "미완료"로 오판해 RequireTutorial 이 잘못 리다이렉트한다(실제로 겪은 버그).
    // 'restoring' 은 기다리되, /api/auth/me 자체가 응답 없이 멈추는 경우(실제로 겪음 — 백엔드 쪽
    // 문제)까지 무한정 기다리면 이 페이지가 영원히 스켈레톤으로 멈춘다. 일정 시간 후에는 포기하고
    // error 로 폴백한다 — useTutorialGate 는 error 를 막지 않는 쪽(fail open)으로 이미 처리한다.
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

  return { stock, crypto, error, loading, refresh }
}

/** RequireTutorial 전용 — 두 시장 다 COMPLETED 가 아니면 강제 이동 대상이다. */
export function useTutorialGate(): { loading: boolean; mustComplete: boolean } {
  const { stock, crypto, loading, error } = useTutorialProgress()
  // 조회 실패는 막지 않는다(fail open) — 네트워크 문제로 앱 전체가 잠기면 안 된다.
  const mustComplete =
    !error && stock?.status !== 'COMPLETED' && crypto?.status !== 'COMPLETED'
  return { loading, mustComplete: !loading && mustComplete }
}
