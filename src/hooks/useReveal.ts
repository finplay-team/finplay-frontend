// IntersectionObserver로 뷰포트 진입 시 fade-up 애니메이션을 트리거하는 훅
import { useEffect, useRef, useState } from 'react'

export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: {
  threshold?: number
  rootMargin?: string
  once?: boolean
}) {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          if (options?.once !== false) observer.unobserve(entry.target)
        } else if (options?.once === false) {
          setVisible(false)
        }
      },
      {
        threshold: options?.threshold ?? 0.15,
        rootMargin: options?.rootMargin ?? '0px 0px -10% 0px',
      },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [options?.threshold, options?.rootMargin, options?.once])

  return { ref, visible }
}
