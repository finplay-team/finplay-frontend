# Investory 구현 체크리스트

---

# 7차 스코프 — 카카오·네이버 OAuth 로그인 연동 (2026-08-12, 이슈 #11, 진행 중)

배경·결정 근거는 `context-notes.md`의 "7차 스코프" 섹션(D21·D22)에 있다. 먼저 읽는다.

## A. 준비 (완료)
- [x] 프론트·백엔드 GitHub 이슈 전수 확인 — 겹치는 진행 중 작업 없음 확인
- [x] 백엔드 실제 컨트롤러 코드 확인 — `OAuthAuthorizationController`·`OAuthCallbackController`·
      `KakaoOAuthCallbackProvider`·`NaverOAuthCallbackProvider` (`C:\Users\user\Desktop\tradeclass-api`)
- [x] 콜백 응답이 프론트로 리다이렉트하지 않는다는 것을 확인, 연동 방식 확정(D21) — 프론트 콜백 라우트
- [x] 이슈 [#11](https://github.com/finplay-team/finplay-frontend/issues/11) 등록
- [x] 브랜치 `namdongyeob/oauth-login` 생성 (`origin/main` 기준)

## B. 코드 구현 (완료)
- [x] `services/types.ts` — `OAuthProvider` 타입 추가
- [x] `services/authService.ts` — `exchangeOAuthCallback(provider, code, state)`
- [x] `auth/AuthContext.tsx` — `loginWithOAuth(provider, code, state)`
- [x] `components/SocialLoginButtons.tsx` 신규
- [x] `pages/OAuthCallback.tsx` 신규
- [x] `pages/Login.tsx` 버튼 배치
- [x] `pages/Signup.tsx` 1단계 버튼 배치
- [x] `lib/errorMessages.ts` — OAuth 오류 코드 4종 매핑
- [x] `App.tsx` — `/oauth/:provider/callback` 라우트 + `hideChrome` 조건

## C. 검증
- [x] `npm run build` 통과 — 타입 에러 0, 115 모듈, JS gzip 110.96KB
- [ ] (배포 설정 완료 후) 실제 카카오/네이버 계정으로 브라우저 로그인 end-to-end 확인

## D. 배포 설정 (코드 밖, 별도 진행 — 대화에서 안내함)

실제 도메인(Route 53, 사용자 확인) — `https://finplay.site/`.

- [x] 카카오 개발자센터 콘솔에 Redirect URI `https://finplay.site/oauth/kakao/callback` 추가 (사용자 확인 2026-08-12)
- [x] 네이버 개발자센터 콘솔에 Callback URL을 `https://finplay.site/oauth/naver/callback`으로 교체 (사용자 확인 2026-08-12)
- [ ] 배포 서버 `.env`의 `KAKAO_REDIRECT_URI`·`NAVER_REDIRECT_URI`를 위 값과 정확히 일치하도록 변경 — 확인 필요
- [ ] 컨테이너 재기동 후 실제 카카오/네이버 계정으로 `https://www.finplay.site/login`에서 로그인 end-to-end 확인
  (ADR-0022 §결정4 — `finplay.site`는 API 전용 도메인이고 프론트는 `www` 서브도메인에 있다. apex로 접속하면
  로그인 화면 없이 백엔드 JSON 오류만 보인다 — 2026-08-17 실측)

---

# 6차 스코프 — 2차 MVP 화면 보강 + 랜딩 비주얼 (2026-08-08, 진행 중)

배경·결정 근거는 `context-notes.md`의 "6차 스코프" 섹션에 있다. 먼저 읽는다.

**대전제 (사용자 확정 2026-08-08).** 백엔드에 없는 내용을 프론트에서 만들어 채우지 않는다.
프론트로 대체하는 선택지는 없다. 백엔드에 문제가 있으면 백엔드부터 고친다 — 우리는 백엔드 팀이다.
→ 백엔드 결함 목록은 `docs/backend-issues.md`, 계약 정본 추출은 `docs/backend-contracts/`.

## A. 백엔드 계약 추출 (병렬 에이전트)
- [x] 백엔드 레포 위치 정정 — 로컬 `workspaces/tradeclass-api/chore-sse`는 **빈 디렉터리**.
      정본은 GitHub `finplay-team/finplay` (gh api로 수신)
- [x] `docs/backend-contracts/journal-ranking.md` — JOUR-001~006, RANK-001~002
- [x] `docs/backend-contracts/community-candle.md` — COM-004~005, MKT-009
- [x] `docs/backend-contracts/ai-feedback.md` — FEED-006~011 (+ spec.md 정본으로 §C-4·C-5 보강)
- [ ] **`lmt-watch.md` — LMT-001~005 + WATCH-001~003 (에이전트 유실, 재실행 필요)**
      ↳ order 계약이 없으면 `docs/backend-issues.md`의 `X-1`(limit 정책 불일치) 범위가 확정되지 않고
        전체 백엔드 결함 파악이 반쪽이다. **이것이 다음 세션 1순위다.**
- [x] upstream spec 정본 수신 → `.backend-docs/upstream/` (gitignore, 필요 시 재수신)

## B. 화면 갭 분석 (완료 — 요청 목록 전부 미구현 확인)
- [x] AI 피드백 6종 / 투자일기 6종 / 랭킹 2종 / 지정가 5종 / 관심목록 3종 / 커뮤니티 고도화 2종 — **전부 없음**
- [x] 추가 발견 — MKT-009 일·주·월봉 미노출, PORT-003 `getOrders()` 필수 `market` 누락(호출부 0개)

## C. 랜딩 비주얼 (완료)
- [x] `impeccable` 설치 (global). `taste-skill`은 `skills-lock.json`대로 이미 있어 미설치
- [x] motionsites.ai 조사 — **디자인/코드 라이브러리가 아니라 AI 프롬프트 갤러리**(유료 Pricing 존재).
      기법 이름만 참고: Liquid Glass 계열, Orbis(애스트로넛), Nimbus Sticky Cards
- [x] 색 방침 — **바이올렛 보색 추가 취소.** 민트 하나를 광도·투명도로 쓰고 코인은 기존 앰버 유지.
      토큰 값 변경 0건 (`tailwind.config.js` 미수정)
- [x] `.glass` / `.glass-sheen` 프리미티브 (`index.css`) — 뒤에 움직이는 것이 있을 때만 사용
- [x] `hooks/useScrollProgress.ts` — sticky 구간 진행도, `prefers-reduced-motion`이면 1 고정
- [x] `components/landing/ReplayScrub.tsx` — 스크롤 = 장중 시간축. `ReplayStream.tsx` 대체·삭제
- [x] `components/landing/Mascot.tsx` — SVG 애스트로넛, 커서 추적. 의존성 0KB
- [x] `components/landing/MascotTutorial.tsx` — 시작 3단계 안내
- [x] `pages/Landing.tsx` 재배선

### C-1. 랜딩에서 지킨 것 (사용자 지적 반영)
- [x] **가짜 캔들 데이터 제거.** 초안이 시드 PRNG로 OHLC를 만들어 그렸다 — 없는 시세를 만든 것이라
      전면 폐기하고 **390분 눈금 사다리**로 교체. 이 섹션이 쓰는 데이터는 "09:00~15:30 = 390분" 하나뿐
- [x] 카드 문구 전부 백엔드 실동작 근거 (FEED-009 전장 구간 한정 / FEED-006 `reveal_time` 게이트 /
      MKT-002 기록된 가격 체결 / FEED-007·010·011 서비스 날짜 15:30 개방)

## D. 랜딩 검증 (완료 — 실측)
- [x] `npm run build` 통과, 타입 에러 0, 88 모듈, JS gzip **87.63KB** (Three.js 미도입으로 증가 없음)
- [x] Chrome 확장 여전히 안 붙음 → CDP(9333) + `puppeteer-core --no-save` 우회 (5차와 동일)
- [x] 데스크톱 1440×900 · 모바일 390×844 배치 촬영 (스크럽 진행도 8%·45%·95% + 이후 섹션 전부)
- [x] 콘솔 에러 0건, 페이지 가로 스크롤 0 (`.orb` 오버플로 경고는 부모 `overflow-hidden`에 갇힌 오탐)

### D-1. 검증에서 고친 것 (전부 재현 → 수정 → 재검증)
- [x] **모바일에서 눈금 사다리가 통째로 사라짐** — DOM 390개에 `flex-1`은 358px 폭에서 서브픽셀이 되어
      소멸한다. → 반복 배경(`background-size: calc(100%/N)`) + `clip-path`로 교체, DOM 390개 → 4개
- [x] **모바일에서 정시 눈금이 안 보임** — duty를 `%`로 두면 좁은 폭에서 같이 소멸.
      → 정시만 고정 `1.5px`로 바꿔 어느 폭에서도 시간 구조가 읽힌다
- [x] 모바일 제목이 내비 뒤로 잘림 + 카드가 화면 밖으로 넘침 → `pt-24` 확보 + 카드 2×2 그리드
- [x] 닫힌 카드 본문이 `opacity 0.18`로 남아 대비 기준 미달 → 껍데기만 남기고 내용은 완전히 감춤
- [x] 말풍선이 헬멧을 덮고 `3단계|면`이 어절 중간에서 끊김 → 일반 흐름으로 이동 + 단어를 span에 통째로
- [x] 시계 숫자 겹침은 **버그 아님** — Space Grotesk `1` 글리프의 가로 막대. 2배 확대·폰트 로드 상태로 확인

## F. 목표 1 구현 (완료 — 13개 항목 전부)

- [x] 지정가 주문·정정·취소·미체결 목록 (LMT-001~005, 코인 전용)
- [x] 관심목록 등록·조회·해제 (WATCH-001~003) — tradable 을 검사하지 않는 계약 준수
- [x] 캔들 주기 전환 일·주·월봉 (MKT-009) + 호버 십자선·OHLC 툴팁·거래량 서브차트
- [x] 투자일기 작성·수정·목록 (JOUR-001~006) — `/journal`
- [x] 전체 랭킹·내 랭킹 (RANK-001·002) — `/rankings`
- [x] 매도 직후 AI 복기 (FEED-007·010·011) — `/feedback`
- [x] 변동 원인 카드 (FEED-006) — 거래 화면 차트 아래
- [x] 종목 뉴스 요약 (FEED-008) · 개장 전 브리핑 (FEED-009) — `/news`
- [x] 커뮤니티 종목 태그·필터 (COM-004), 대댓글 1단계 (COM-005)
- [x] 포트폴리오 미체결 주문 섹션 + 보유 표 예약 수량 표시

### F-1. 화면 구조 (사용자 지적으로 재배치)
- [x] 뉴스·브리핑을 거래 화면에서 빼고 `/news` 전용 화면으로 — 종목 칩을 골라 요약·기사를 본다
- [x] AI 복기를 포트폴리오 표에서 꺼내 `/feedback` 전용 화면으로 — 매도 체결을 골라 본다
- [x] 거래 화면에는 변동 원인 카드만 남김 (지금 보는 차트가 왜 움직였나)
- [x] 내비 재배열 — 뉴스 · 거래 · 포트폴리오 · AI 복기 · 투자일기 · 랭킹 · 커뮤니티

### F-2. 이번에 고친 기존 버그
- [x] `CommunityPost` 의 `NOT_FOUND` 오폭 — 대댓글 404 가 `setGone(true)` 로 글 전체를 날렸다
- [x] 게시물 수정 시 종목 태그가 조용히 지워지던 문제 (PATCH 전체 교체 계약)
- [x] `Nav` 지갑이 STOCK 만 읽어 코인 매매가 반영되지 않던 문제 — 두 계좌 합산 + 예약분 차감
- [x] `주문가능 현금`·매도 가능 수량이 예약분을 안 뺀 문제
- [x] 집계봉 축 라벨이 전부 `00:00` 이던 문제 (`formatHhMm`)
- [x] 월봉 가격축에 **음수 가격**이 찍히던 문제 (여백이 0 아래로)
- [x] 주봉 라벨이 연도 없이 M/D 라 순서가 뒤죽박죽으로 읽히던 문제
- [x] `Rankings`·`Portfolio` 루트에 `overflow-hidden` 누락 → 모바일 가로 스크롤
- [x] 뉴스 목록의 **중복 React key** (`url+publishedAt` 이 여러 종목에 걸친 같은 기사에서 겹침)
- [x] `getOrders()` 필수 `market` 누락, `types.ts` 계약 정정 5건

### F-3. 백엔드 실측 검증 (local,oauth-real,crypto-real)
- [x] 지정가 — 예약 500,250(수수료 포함)·`cashBalance` 불변·정정 재계산·취소 반환·예약분 초과 매도 409
- [x] MUST-VERIFY 2건 해소 — `Idempotency-Key` 누락은 400, 존재하지 않는 orderId + 빈 본문은
      404 가 아니라 **400**(`spec.md:112` 가 맞고 `api-contracts.md:369` 가 빠뜨림)
- [x] 관심목록 — 201·409 `DUPLICATE_RESOURCE`·204·404 전부 계약대로
- [x] 재생세션 시드 `POST /api/dev/stock-replay-imports` — 98초, 6,096봉, 원본 2026-08-07
- [x] **매도 직후 AI 복기 실데이터** — 삼성전자 10주 매수 → 6주 매도 후 원장 수치·`postSellFlow=READY`·
      `counterfactuals` 부분 null·`peerComparison=NO_EVENT`·템플릿 서술이 화면에 정상 렌더
- [x] 코인 매도 체결에 복기 요청 → **400 실측 확인** (2차 주식 전용 계약)

### F-4. 미검증으로 남긴 것 — **다음 세션 장중(09:00~15:30)에 해야 한다**

내 첫 검증은 부실했다. **"응답이 오는가"만 보고 "내용이 의미 있는가"를 보지 않았다.**
실제로 화면에 나온 복기는 "231,000원에 매수해 231,000원에 매도했습니다. 수익률은 -0.03%입니다"가
전부였고, 원인 분석이 통째로 비어 있었다. 그게 정상인지 확인한 결과가 아래다.

**카드가 0건인 이유는 결함이 아니다 (2026-08-08 확인, 이슈 대상 아님).**

| 조건 | 상태 |
|---|---|
| 뉴스 적재 | 충족 — 주식 1,571 · 코인 275 |
| 코인 σ 표본 (`min-sample-count: 100`) | 충족 — 종목당 157개 |
| 감시 배치 (`crypto-watch-cron` 매분 30초) | 실행 중 |
| **임계치를 넘는 변동** | **없었음** → 카드 0건 |

σ 기반 탐지라 최근 24시간 변동성 대비 이례적인 움직임이 있어야 카드가 생긴다.
쿨다운 30분·일일 상한 6건이라는 설정 자체가 "아무 때나 만들지 않는다"를 전제한다.

**또 하나 — 내 테스트 매매가 보유 3초였다.** 매수 23:39:24 → 매도 23:39:27.
보유 구간이 없으니 카드가 있었어도 그 구간에 걸릴 것이 없고, 보유 중 최고가·최저가가 전부 `—`가 된다.

**따라서 아래는 장중에, 충분한 보유 시간을 두고 다시 해야 한다.**

- [ ] 09:00~15:30 재생 중에 주식 매수 → **수십 분 보유** → 매도
- [ ] `priceMoves` 에 보유 구간 카드가 담기는지
- [ ] `narrativeSource` 가 `TEMPLATE` 이 아니라 **`LLM`** 으로 오는지 (카드가 있어야 서술 근거가 생긴다)
- [ ] 보유 중 최고가·최저가와 `atHoldHigh` 반사실이 채워지는지
- [ ] `peerComparison` 의 `READY`·`INSUFFICIENT_SAMPLE` — 다른 회원 매도 이력이 필요하다
- [ ] 거래정지 종목의 관심목록 등록 — 시드 28종이 전부 `tradable=1` 이라 재현 데이터가 없다
- [ ] 지정가 실제 체결(LMT-002 트리거) — 시세가 지정가에 닿아야 한다

## G. 백엔드 이슈
- [x] 초안 15건 작성 → **적대적 재검증으로 4건 철회·6건 축소** (`docs/backend-issues.md`)
- [x] [#273](https://github.com/finplay-team/finplay/issues/273) 코인 뉴스 0건 — **오판이라 철회·종료**
- [x] [#275](https://github.com/finplay-team/finplay/issues/275) 코인 매도 회고 지원 — 결정 단계 분리해 등록
- [ ] 남은 확정 이슈(C-2·C-6·F-3·R-0 등) 등록 여부 결정

## E. 남은 것 (다음 세션)
- [ ] **A의 `lmt-watch.md` 재추출 (1순위)** — LMT/WATCH를 에이전트 2개로 분리 권장.
      하나로 묶었을 때 가장 무거웠고(`015-limit-order` spec 48KB + plan 82KB) 그게 유실 원인으로 보인다
- [ ] `docs/backend-issues.md`에 order·watchlist 도메인 절 추가 → 그 뒤 GitHub 이슈 등록 (승인 대기)
- [ ] 목표 1 구현 착수 — 순서는 지정가·관심목록 → 투자일기·랭킹 → AI 피드백 → 커뮤니티 고도화
- [ ] `services/types.ts` 신규 타입은 **메인이 한 번에 정의**한 뒤 화면을 병렬로 나눈다
      (도메인 6개가 같은 파일을 건드려 병렬 충돌이 나는 구조다)
- [ ] 프론트 자체 버그 8건 수정 (`docs/backend-issues.md` 말미 표)
- [ ] 랜딩 커밋 (승인 대기)
- [ ] 3D 마스코트 — `.glb` 도착 시 `Mascot.tsx`만 교체. 미도착 상태

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

#### 장중 재검증 (2026-07-31 금 09:00~09:20 KST 실측)

02:30~03:20 세션에서 장외라 미룬 항목을 같은 날 장중에 다시 확인했다.
사전 준비로 `POST /api/dev/stock-replay-imports` 를 08:49 에 한 번 돌렸다 (아래 "배치 시각" 참조).
수집 결과 `collectedKisCandleCount=6090` / 16종목 / 09:00~15:30 / `preparationStatus=READY`,
재생 원본은 직전 영업일 **2026-07-30**.

- [x] **SSE 분 단위 가격 갱신** — `/trade` 를 열어 둔 채 새로고침 없이 관찰. 매분 봉이 정확히 +1 늘고
      선택·비선택 종목 가격이 모두 갱신됐다.

      | 시각 | 상태 | 봉 | SK하이닉스 | 삼성전자 |
      |---|---|---|---|---|
      | 08:56~09:00:00 | 장 마감 | 0 | 시세 없음 | 시세 없음 |
      | 09:00:30 | **장 운영 중** | 0 | — | 214,000 |
      | 09:01:30 | 장 운영 중 | 1 | — | — |
      | 09:04 | 장 운영 중 | 4 | 1,330,000 | 207,500 |
      | 09:05 | 장 운영 중 | 5 | 1,339,000 | 209,000 |
      | 09:06 | 장 운영 중 | 6 | 1,338,000 | 208,500 |
      | 09:07 | 장 운영 중 | 7 | 1,351,000 | 210,500 |

      09:00~09:00:59 에 **"가격은 있는데 봉은 0"** 인 1분이 그대로 재현됐다. 버그가 아니라 계약이다 —
      캔들 API 는 마감되지 않은 분봉을 예외 없이 감추고, 가격 API 만 그 구간에서 첫 분봉의 시가를
      노출한다 (`StockReplayService.isWithinFirstCandleWindow`).
- [x] **장중 주식 주문** — 삼성전자 3주 시장가 매수 체결. 체결단가 211,500 / 거래금액 634,500 /
      **수수료 95원** (634,500 × 0.015% = 95.175 → 내림). 장외의 `MARKET_CLOSED` 차단과 대비해 확인.
- [x] **`MyPage` 체결 내역이 두 시장을 섞어 정렬** — 앞선 세션에서는 코인 2건으로만 검증했던 항목이다.
      주식 3건(09:18·09:07·09:06) + 코인 2건(03:46·02:52)이 시장 칩과 함께 최신순으로 정렬되는 것을 확인했다.

#### 확인 못 함 (미실행은 미실행으로 남긴다)
- [ ] **실기기(iOS/Android)** — 데스크톱 Chrome 뷰포트 에뮬레이션으로만 봤다.
- [ ] **이메일 변경 2단계** — 실제 메일 발송이 없는 로컬이라 코드 추출은 되지만 이번 세션에서는 돌리지 않았다.
- [ ] **장 마감(15:30) 전환** — 개장 전환만 봤고 마감 전환은 못 봤다.

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

- [x] `MyPage` 가 주식 계좌만 보여줘 코인 매매가 내정보에서 사라지던 문제 — 계좌 요약을 두 카드로
      나누고 체결 내역을 두 시장 합쳐 최신순 정렬 (BTC 매수 → 매도 2건으로 실측)

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
