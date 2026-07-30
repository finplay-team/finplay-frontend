// 종목 캐시를 로드해 id·symbol 인덱스를 공급하는 훅 (주문·거래 행의 종목명 조인에 필수)
import { useEffect, useState } from 'react'
import { ApiError } from '../lib/apiClient'
import { ensureInstrumentCache, type InstrumentIndex } from '../services/instrumentService'

export function useInstruments(): {
  index: InstrumentIndex | null
  loading: boolean
  error: ApiError | null
} {
  const [index, setIndex] = useState<InstrumentIndex | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    let cancelled = false
    ensureInstrumentCache()
      .then((i) => {
        if (!cancelled) setIndex(i)
      })
      .catch((e) => {
        if (!cancelled && e instanceof ApiError) setError(e)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { index, loading, error }
}
