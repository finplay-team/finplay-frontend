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
- [x] 지정가 주문 / `PendingOrder` / 주문유형 토글 (`OrderType` 을 `'MARKET'` 단일 유니온으로 고정)
- [x] 랭킹 (`rankingService`, `pages/Rankings.tsx`, `landing/RankingPhilosophy.tsx`)
- [x] 튜토리얼 보상 (`tutorialService`, `landing/Missions.tsx`)
- [x] 관리자 (`adminService`, `pages/Admin.tsx`, `requireAdmin`)
- [x] 투자일기 (`DecisionLog`, `landing/RecordReview.tsx`, `lib/labels.ts`)
- [x] 경제 이벤트 (`EconomicEvent`)
- [x] AI 챗봇 위젯 (`AssistantWidget.tsx`)
- [x] 소셜 로그인 버튼 (`SocialLogin.tsx`)
- [x] 고객센터 1:1 문의 폼 (FAQ는 유지)
- [x] `mockDb.ts` 전체 삭제 + 코인 시장 UI 제거 (`landing/SplitAccounts.tsx` 포함)
  - ↳ **코인 UI는 2026-07-31 복원됨** (이슈 #1 / PR #3). 백엔드 `crypto-real` 프로필로 실데이터가
    나오면서 D3 전제가 바뀌었다. 시장 탭·`coin` 토큰·`SplitAccounts`·Hero 듀얼 계좌 복원.
- [x] AI 습관 분석 (`landing/AiHabit.tsx` — 백엔드에 습관·리포트 엔드포인트 없음)
- [x] 죽은 아이콘 정리 (`Trophy`·`Target`·`Flag`·`Calendar`·`Users`·`Notebook`·`Coin`·`Menu`·`Sparkle`)
- [x] `lib/format.ts` 다크 토큰 전환(`pnlTone`) + 죽은 `formatDate` 제거
- [x] `index.html` title·description 실제 기능 기준 갱신 + `color-scheme: dark`

## D. 데이터 레이어
- [x] `lib/tokenStore.ts` (모듈 스코프 + `useSyncExternalStore`, 순환 의존 차단)
- [x] `lib/apiClient.ts` (`ApiError` + 401 단일 비행 갱신)
- [x] `lib/errorMessages.ts` (`code` → 한국어 문구)
- [x] `lib/datetime.ts` (오프셋 없는 `LocalDateTime` 파싱 + `ratioToPercent`)
- [x] `services/types.ts` 실응답 기준 전면 교체
- [x] `services/` — auth / instrument / order / trade / holding / account / community
- [x] `auth/AuthContext.tsx` 비동기 부팅 + `ProtectedRoute` (`requireAdmin` 제거)
- [x] 공통 UI 프리미티브 다크 대응 (`Button`·`Tabs`·`Field`·`Card`)

## E. 시세
- [x] `hooks/useStockStream.ts` (fetch + ReadableStream SSE, 백오프, 401 재연결)
- [x] `hooks/useCandles.ts` (`sourceTime` upsert 병합)
- [x] `hooks/useInstruments.ts` · `hooks/useIdempotencyKey.ts`
- [x] `components/CandleChart.tsx` (인라인 SVG, 빈 배열 = 정상 상태)
- [x] `hooks/useLivePrices.ts` 삭제

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

### 완료 (2026-07-30 19:50~19:55 KST 실측)
- [x] `npm run build` 통과 — 화면 재작성 후 재실행, 타입 에러 0 / 81 모듈 / JS 256KB(gzip 81KB)
- [x] 백엔드 `local` 프로필 기동 + dev 프록시 확인 (`localhost:5173/api/*` → 8080, 401 통과 확인)
- [x] 가입 3단계 실동작 — 발송 202 → 콘솔 로그에서 코드 추출 → confirm 200 → signup **201 + 토큰**
- [x] `GET /api/auth/me` 응답에 `role`이 없음을 실측 확인 (관리자 개념 불가 근거)
- [x] 시드 전 정직성 — 현재가 409 `PRICE_UNAVAILABLE` / 캔들 `200 []` / 주문 409 `MARKET_CLOSED`
- [x] **코인 주문 409 `PRICE_UNAVAILABLE` 실측** — 코인 제거 결정(D3)의 직접 근거
- [x] 시드 실행 — 16종목·6,256건, 장외(19:50)인데 `marketStatus: OPEN`, 캔들 391건(09:00~15:30)
- [x] 매수 10주 → `amount` 709,000 / `fee` 106 / 매도 4주 → `realizedPnl` -84
- [x] 최종 현금 9,574,452 = 10,000,000 − 709,000 − 106 + 283,600 − 42 (정산 일치)
- [x] 멱등성 — 같은 키·같은 본문 재전송은 원래 응답 재생, 같은 키·다른 본문은 409 `IDEMPOTENCY_CONFLICT`
- [x] 지정가 주문 **422** `UNSUPPORTED_ORDER_TYPE` / 주식 소수점 수량 400 (제거 결정 근거)
- [x] 보유수량 초과 매도 409 `INSUFFICIENT_QTY`
- [x] SSE — `retry:3000` → `event:snapshot`에 16종목 전부 `AVAILABLE`, `sourceTradingDate` 2026-07-29
- [x] 토큰 회전 — refresh 1회 성공 후 같은 refreshToken 재사용은 401 (단일 비행 갱신이 필수인 이유)
- [x] 커뮤니티 — 글 작성 201 / 댓글 201 / 목록·댓글 조회 정상
- [x] BigDecimal scale 불일치 실측 — `POST /orders`는 `10`, 멱등 재생은 `10.0000000`

### 브라우저 시각 검증 (2026-07-31 02:30~03:20 KST 실측, 이슈 #2)

Chrome 확장이 여전히 안 붙어서 **별도 Chrome 을 CDP(9333)로 띄워 puppeteer-core 로 조작**했다.
백엔드는 `SPRING_PROFILES_ACTIVE=local,crypto-real`. 검증 시각이 장외라 주식은 CLOSED 였다.

#### 확인함
- [x] **다크 톤 대비** — 데스크톱(1440)·태블릿(834)·모바일(390) 전 페이지 캡처. 본문 `ink`·보조 `muted`
      모두 읽힌다. 민트는 CTA·활성 상태·강조 숫자에만 쓰여 과하지 않다.
- [x] **반응형 <768px** — 390px 에서 전 페이지 가로 스크롤 없음 (`scrollWidth` 375 ≤ 390).
      거래내역·보유종목 표는 `overflow-x: auto` 안에서 가로 스크롤된다 (표 832px / 컨테이너 315px).
- [x] **반응형 태블릿(834px)** — 여기서 상단 내비가 깨져 있었다. 아래 "고친 것" 참조.
- [x] **Nav 햄버거** — 오버레이 열림·링크 이동·닫기 동작. **닫기가 안 되던 버그를 고쳤다.**
- [x] **차트** — 빗썸 실데이터 1분봉이 데스크톱·모바일 모두 렌더. 좁은 화면 축소 버그를 고쳤다.
- [x] **가입 3단계** — 이메일 → 백엔드 콘솔 `code=` → 6자리 확인 → 닉네임·비밀번호 → 201 + 자동 로그인 → `/trade`.
- [x] **한글 닉네임** — 가입 시 `테스트투자자`, 이후 `/me` 에서 `한글닉네임변경` 으로 변경 성공.
      내비·커뮤니티 작성자 이름까지 함께 갱신되는 것 확인.
- [x] **로그인** — 로그아웃 → 오답 비밀번호로 `이메일 또는 비밀번호가 올바르지 않습니다.` 노출 → 정답으로 재로그인.
- [x] **주문** — 코인 탭에서 BTC 0.01 시장가 매수 체결. 체결단가 91,814,000 / 거래금액 918,140 /
      수수료 459(=0.05%) / 상단 지갑·계좌 요약 즉시 갱신.
- [x] **커뮤니티** — 글 작성(한글 제목·본문) → 목록 반영 → 상세 → 댓글 작성 → 수정 폼 → 삭제(2단계 확인) →
      빈 상태까지 전부 브라우저에서 통과.
- [x] **SSE 연결·스냅샷·하트비트** — `/trade` 를 60초 열어 둔 채 "실시간 수신" 유지, 정체 경고
      (40초 무수신) 미발생 → 20초 하트비트가 실제로 도착하고 있다.
- [x] **`prefers-reduced-motion: reduce`** — `.reveal` 29개 전부 즉시 불투명, orb 부유·pulse 정지.

#### 확인 못 함 (미실행은 미실행으로 남긴다)
- [ ] **SSE 분 단위 가격 갱신** — 검증 시각이 02:30~03:20 KST(장외)라 `price` 이벤트가 흐르지 않는다.
      장중(09:00~15:30)에 `/trade` 를 1~2분 열어 두고 다시 봐야 한다. 연결 자체는 위에서 확인했다.
- [ ] **장중 주식 주문** — 같은 이유. 장외에서 `MARKET_CLOSED` 로 버튼이 막히고 사유가 표시되는 것까지만 확인.
- [ ] **실기기(iOS/Android)** — 데스크톱 Chrome 뷰포트 에뮬레이션으로만 봤다.
- [ ] **이메일 변경 2단계** — 실제 메일 발송이 없는 로컬이라 코드 추출은 되지만 이번 세션에서는 돌리지 않았다.

### 이 검증에서 고친 것 (전부 재현 → 수정 → 재검증)
- [x] `CandleChart` 가 좁은 화면에서 축 라벨 4.4px 로 축소되던 문제 (고정 viewBox 배율 → 실측 폭)
- [x] 모바일 메뉴 X 버튼이 오버레이에 덮여 **메뉴를 닫을 수 없던** 문제 (`nav` 에 `relative z-40` + Esc)
- [x] 768~1000px 에서 내비 항목이 2~3줄로 접히던 문제 (`md:` → `lg:` + `whitespace-nowrap`)
- [x] 한국어 어절 중간 줄바꿈 ("하 / 루를,") — `word-break: keep-all` 전역 적용
- [x] `TechHighlights` "Redis 시세 저장소" — 주식은 Redis 가 아니라 MySQL `stock_candles` 다
- [x] `Support` FAQ "코인도 거래할 수 있나요? → 아니요" — 코인 복원 이후 사실과 다름
- [x] 코인 복원 뒤에도 "주식 계좌만"으로 남아 있던 문구 일괄 갱신
      (`index.html`·`Footer`·`CTA`·`MarketOrders`·`Signup`·`Support`)
- [x] `/me` 의 "새 닉네임"·"새 이메일" 칸에 Chrome 이 저장된 로그인 이메일을 자동으로 채우던 문제
      (재인증 비밀번호 칸을 `new-password` 로 바꿔 로그인 폼 분류를 피한다)

### 남음
- [ ] `MyPage` 가 아직 주식 계좌만 보여준다 (코인 매매가 내정보에 안 보임) — 별도 이슈 대상

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
