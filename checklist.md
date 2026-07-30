# Investory 구현 체크리스트

---

# 4차 스코프 — 실백엔드 연동 (2026-07-30, 진행 중)

배경·결정 근거는 `context-notes.md`의 "4차 스코프" 섹션에 있다. 먼저 읽는다.

## A. 기반 (완료)
- [x] 베이스라인 커밋 `84cdfc5` (mock 상태 롤백 지점)
- [x] `vite.config.ts` dev 프록시 (`/api` → `localhost:8080`)
- [x] `tailwind.config.js` 다크 토큰 + 민트 brand + glow 섀도우
- [x] `src/index.css` 다크 bezel/eyebrow + `.orb` 글로우 유틸
- [x] `context-notes.md` 결정 기록 (D1~D7 + 디자인 톤 표)

## B. 백엔드 로컬 시드 (별도 레포)
- [ ] `POST /api/dev/stock-replay-seeds` (`local` 프로필 전용)
- [ ] `LocalForcedOpenStockPriceProvider` + `force-market-open` 플래그
- [ ] 통합 테스트 + `./gradlew build` 통과
- [ ] `docs/api-routes.md` · `docs/api-contracts.md` 동기화

## C. 해체 (백엔드 미구현 기능 제거)
- [ ] 지정가 주문 / `PendingOrder` / 주문유형 토글
- [ ] 랭킹 (`rankingService`, `pages/Rankings.tsx`, `landing/RankingPhilosophy.tsx`)
- [ ] 튜토리얼 보상 (`tutorialService`, `landing/Missions.tsx`)
- [ ] 관리자 (`adminService`, `pages/Admin.tsx`, `requireAdmin`)
- [ ] 투자일기 (`DecisionLog`, `landing/RecordReview.tsx`, `lib/labels.ts`)
- [ ] 경제 이벤트 (`EconomicEvent`)
- [ ] AI 챗봇 위젯 (`AssistantWidget.tsx`)
- [ ] 소셜 로그인 버튼 (`SocialLogin.tsx`)
- [ ] 고객센터 1:1 문의 폼 (FAQ는 유지)
- [ ] `mockDb.ts` 전체 삭제 + 코인 시장 UI 제거

## D. 데이터 레이어
- [ ] `lib/tokenStore.ts` (모듈 스코프 + `useSyncExternalStore`, 순환 의존 차단)
- [ ] `lib/apiClient.ts` (`ApiError` + 401 단일 비행 갱신)
- [ ] `lib/errorMessages.ts` (`code` → 한국어 문구)
- [ ] `lib/datetime.ts` (오프셋 없는 `LocalDateTime` 파싱 + `ratioToPercent`)
- [ ] `services/types.ts` 실응답 기준 전면 교체
- [ ] `services/` — auth / instrument / order / trade / holding / account / community
- [ ] `auth/AuthContext.tsx` 비동기 부팅 + `ProtectedRoute` (`requireAdmin` 제거)

## E. 시세
- [ ] `hooks/useStockStream.ts` (fetch + ReadableStream SSE, 백오프, 401 재연결)
- [ ] `hooks/useCandles.ts` (`sourceTime` upsert 병합)
- [ ] `components/CandleChart.tsx` (인라인 SVG, 빈 배열 = 정상 상태)
- [ ] `hooks/useLivePrices.ts` 삭제

## F. 화면
- [ ] `Signup` 3단계 (이메일 → 6자리 코드 → 비밀번호·닉네임) + DEV 콘솔 안내
- [ ] `Login` (실 로그인, 데모 자동입력 제거)
- [ ] `Trade` 시장가 전용 + `Idempotency-Key` + 주문불가 사유 표시
- [ ] `Portfolio` 보유·거래내역(커서 페이징)·계좌 요약
- [ ] `MyPage` 계좌 요약 + 닉네임 변경 + 이메일 변경 2단계 + 로그아웃
- [ ] 커뮤니티 목록·작성·상세·수정·삭제 + 댓글 작성·삭제
- [ ] `Nav` · `Footer` · `App` 라우트 정리
- [ ] `Landing` 실제 기능만 남긴 섹션 구성으로 재작성
- [ ] `Support` FAQ만 남기고 실제 기능 기준으로 문구 갱신

## G. 검증
- [ ] `npm run build` 통과 (타입 에러 0)
- [ ] 백엔드 기동 + 시드 후 브라우저 E2E: 가입 → 로그인 → 매수 → 보유 확인 → 매도 → 거래내역
- [ ] 커뮤니티 글 작성 → 댓글 → 삭제 왕복
- [ ] 시세 없는 상태(시드 전)에서 주문 버튼 비활성 + 사유 문구 확인
- [ ] 401 만료 토큰 자동 갱신 동작 확인
- [ ] 다크 톤 대비 확인 (읽히지 않는 텍스트 0)

---

# 이하 1~3차 스코프 (mock 시대, 완료)

## 0. 스캐폴딩
- [x] package.json / vite / tsconfig / tailwind / postcss 설정
- [x] index.html (폰트: Pretendard, Space Grotesk)
- [x] src/index.css (디자인 토큰 + Tailwind 지시어)
- [x] npm install → build 통과

## 1. 코어 (services / 타입)
- [x] services/types.ts (도메인 타입)
- [x] services/mockDb.ts (인메모리 시드 데이터)
- [x] services/authService.ts
- [x] services/rankingService.ts
- [x] services/adminService.ts

## 2. 인증 / 라우팅
- [x] auth/AuthContext.tsx
- [x] auth/ProtectedRoute.tsx
- [x] App.tsx (라우터) / main.tsx

## 3. 공통 UI / 훅
- [x] hooks/useReveal.ts
- [x] components/ui (Button, Card, Eyebrow, Field, Tabs, Reveal, icons)
- [x] components/Nav.tsx (글래스 pill + 햄버거 모프)
- [x] components/Footer.tsx

## 4. 랜딩 (8섹션)
- [x] Hero
- [x] RecordReview (기록→복기)
- [x] AiHabit (AI 습관 분석)
- [x] SplitAccounts (주식/코인 분리)
- [x] RankingPhilosophy (랭킹≠좋은 투자자)
- [x] Missions
- [x] TechHighlights
- [x] CTA

## 5. 페이지
- [x] Signup (회원가입)
- [x] Login (로그인)
- [x] Rankings (랭킹)
- [x] Admin (관리자)

## 6. 백엔드 설계 문서
- [x] docs/db-schema.md (ERD)
- [x] docs/api-spec.md
- [x] docs/decisions.md (미정 정책 결정표)

## 7. 검증
- [x] npm run build 에러 0
- [x] npm run dev + 브라우저로 각 라우트 확인 (랜딩/랭킹/로그인/관리자)
- [x] 관리자 보호 라우트 동작 (미로그인 → /login 리다이렉트, admin 로그인 → /admin)
- [x] 관리자 탭 패널 전환 동작 (회원/종목 등)
- [ ] 반응형 <768px 최종 확인
- [x] 스킬 §8 금지패턴 대조 (금지 폰트/아이콘/섀도우/모션 부재)

## 8. 거래(모의투자) 기능 — 2차 스코프
- [x] services/tradeService.ts (체결·시세 틱·지정가 매칭·포지션 평가)
- [x] services/tutorialService.ts (완료 자동판정 + 시드 % 보너스 지급)
- [x] hooks/useLivePrices.ts (2.2초 시세 시뮬레이션)
- [x] pages/Trade.tsx (종목 리스트 + 매수/매도 주문 + 투자일기)
- [x] pages/Portfolio.tsx (보유·거래내역·미체결·투자일기)
- [x] pages/MyPage.tsx (내정보 — 총자산·계좌별 요약·튜토리얼 보상·실시간 매매 내역)
- [x] pages/Support.tsx (고객센터 — 퀵헬프·FAQ·문의 폼)
- [x] components/AssistantWidget.tsx (AI 챗봇 — 종목 추천 거절 필수)
- [x] Nav에 거래/내정보/고객센터 추가, App 라우트 연결
- [x] 랭킹 수익률(%) 기준 전환 + 랜딩 미션 문구 갱신 + decisions.md 갱신
- [x] 리뷰 지적 수정: 세션 복원 검증(정지·소실 유저), 관리자 종목탭 race

## 10. 3차 스코프 — UX 보강 (2026-07-22)
- [x] 상단 내비 지갑 표시 (보유 총자산 · 주문가능 현금, 2.5초 갱신, 클릭 시 /me)
- [x] 종목 확충: 주식 16종(거래가능 15) + 코인 12종 = 28종목, 시가/현재가 시드
- [x] 내정보 계좌 카드 클릭 → /portfolio 해당 시장 탭 상세 (location.state)
- [x] 매매 내역 행 클릭 → 상세 모달 (단가·수량·수수료 + 투자일기 + AI 복기)
- [x] 브라우저 검증: 지갑 pill·종목 리스트·코인 탭 이동·모달 렌더 확인

## 9. 2차 검증 (브라우저 실동작)
- [x] 데모 유저 로그인 → /trade 리다이렉트 복귀
- [x] 삼성전자 5주 시장가 매수 체결 (현금 차감·수수료 정확)
- [x] /me 튜토리얼 1단계 보상 수령 (+2% = 계좌당 20만원, 합계 +40만 배지)
- [x] 챗봇: 종목 추천 질문 → 거절 응답 + 면책 문구
- [x] /portfolio 보유 종목 실시간 평가 렌더
- [x] /support 렌더 (FAQ 아코디언·문의 폼)
