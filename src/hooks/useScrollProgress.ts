// sticky 구간을 스크롤한 비율(0~1)을 돌려주는 훅 — 랜딩의 "스크롤 = 장중 시간축" 연출을 구동한다
import { useEffect, useRef, useState } from 'react'

/**
 * ref 를 붙인 컨테이너가 뷰포트를 통과하는 동안의 진행도를 0~1 로 준다.
 * 컨테이너 높이가 뷰포트보다 커야(= sticky 자식을 둘 만큼) 의미가 있다.
 *
 * prefers-reduced-motion 이면 1 을 고정 반환한다 — 스크롤 연동 연출을 끄는 대신
 * "완성된 상태"를 바로 보여줘야 정보가 사라지지 않는다.
 */
export function useScrollProgress<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  const [progress, setProgress] = useState(0)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (reduced) {
      setProgress(1)
      return
    }

    const el = ref.current
    if (!el) return

    let frame = 0

    const measure = () => {
      frame = 0
      const rect = el.getBoundingClientRect()
      // 스크롤 가능한 총 거리 = 컨테이너 높이 - 뷰포트 높이.
      // 0 이하면 (컨테이너가 뷰포트보다 작으면) 나눗셈이 무한이 되므로 1 로 고정한다.
      const travel = rect.height - window.innerHeight
      if (travel <= 0) {
        setProgress(1)
        return
      }
      const scrolled = -rect.top
      const next = scrolled / travel
      setProgress(next < 0 ? 0 : next > 1 ? 1 : next)
    }

    // 스크롤·리사이즈마다 레이아웃을 읽으면 강제 리플로가 반복된다 → rAF 로 프레임당 1회로 묶는다.
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [reduced])

  return { ref, progress, reduced }
}
