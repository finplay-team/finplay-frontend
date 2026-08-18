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
