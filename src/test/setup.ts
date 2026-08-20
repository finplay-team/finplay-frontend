// Vitest의 모든 React DOM 테스트에 접근성 matcher를 등록하는 공통 설정
import '@testing-library/jest-dom/vitest'

// jsdom에는 ResizeObserver가 없다 — 차트 컴포넌트(CandleChart)가 마운트 시 이걸 바로 호출해서
// 관련 없는 테스트도 함께 깨진다. 아무 동작도 안 하는 최소 스텁으로 채운다.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

/**
 * jsdom은 Web Animations API(`Element.prototype.animate`)를 구현하지 않는다 — 실제 브라우저는
 * 전부 지원하므로(BreakingNewsCrawl.tsx) 컴포넌트 코드에 방어 분기를 넣지 않고, 테스트 환경에만
 * 최소 스텁을 채운다. 실제 재생 시간과 무관하게 짧고 고정된 시간 뒤 `onfinish`를 불러 테스트가
 * 실제 애니메이션 길이(문장 폭에 따라 달라짐)를 기다리지 않고도 "끝난 뒤" 상태를 검증할 수 있다.
 */
if (typeof Element.prototype.animate !== 'function') {
  Element.prototype.animate = function stubAnimate() {
    let onfinish: (() => void) | null = null
    const timer = setTimeout(() => onfinish?.(), 20)
    return {
      cancel: () => clearTimeout(timer),
      finish: () => onfinish?.(),
      get onfinish() {
        return onfinish
      },
      set onfinish(handler) {
        onfinish = handler
      },
    } as unknown as Animation
  }
}
