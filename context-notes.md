# Investory 컨텍스트 노트

작업 중 내린 결정과 근거를 계속 append 한다.

## 확정 사항 (사용자)
- 시드머니: 계좌별 1,000만원.
- 데이터 소스(한국투자증권 등)는 미정 → 특정 증권사명 노출 금지. "실제 시세 기반" + "시세 공급자 추상화"로만 표현.
- 결과물: Vite + React + TS SPA(Mock 데이터) + docs 설계 문서. 실제 Spring 백엔드는 이번 범위 밖.
- 비주얼: Soft Structuralism (라이트/실버). high-end-visual-design 스킬 준수.
- 콘텐츠: 풀 스토리 8섹션 랜딩 + 회원가입/로그인 + 랭킹 + 관리자.

## 기술 결정
- Tailwind v3 (PostCSS) — v4 config 리스크 회피.
- 폰트: Pretendard(한글 본문) + Space Grotesk(숫자/영문 디스플레이). Inter/Roboto 등 금지 폰트 미사용.
- 아이콘: 인라인 SVG(얇은 스트로크). 아이콘 라이브러리 의존성 없음.
- 스크롤 애니메이션: 커스텀 useReveal(IntersectionObserver). Framer Motion 미사용(의존성 최소화).
- 인증: mock. localStorage + AuthContext. 서버 없음, services가 Promise로 mock 데이터 반환.

## 미정 정책 결정 (내 추천, docs/decisions.md에 상세)
- 랭킹 집계: 일 단위 스냅샷(00:00 KST). 실현손익 누적 기준.
- 미션 보상: 시드머니 추가 지급 안 함(비금전 보상) → 원금 동일 유지 → 랭킹 산식 단순.
- 주식 시세: 코인 실시간(업비트), 주식 장중 지연+마감후 재생(2안). PriceProvider 추상화. 지연시세 재배포는 법무 확인 항목.
- 종목 범위: 주식 코스피200, 코인 원화마켓 상위 30.
- 주문 단위: 주식 1주, 코인 소수점 8자리·최소 5,000원.
- 수수료: 간이 반영(설정 토글).
- 상하한 ±30%, 장 마감후 예약주문 큐잉, 지정가 체결 배치 주식 10초·코인 5초.

## 디자인 토큰
- bg #F4F5F7 / card #FFFFFF / ink #0A0A0C / muted #6B6C74
- accent 인디고 #4F46E5, 듀얼: 주식 인디고 / 코인 앰버 #F59E0B
- 그림자 shadow-[0_24px_70px_-24px_rgba(15,15,25,0.18)]
- Double-Bezel 카드, rounded-[2rem], 섹션 py-24~py-40

## 데모 계정 (mock)
- 일반: user@investory.app / demo1234
- 관리자: admin@investory.app / admin1234

## 검증 결과 (2026-07-22)
- npm run build 성공, 타입 에러 0. 콘솔 에러 없음(Router v7 future-flag 경고만).
- 브라우저 확인: 랜딩 8섹션 렌더 정상(히어로/기록·복기/AI습관/계좌분리 듀얼액센트 확인), 랭킹(주식 탭·상위3·표), 로그인, 관리자.
- 보호 라우트: 미로그인 /admin → /login 리다이렉트 확인. admin 데모 로그인 → /admin 진입 확인.
- 관리자 탭: 프로그래매틱 클릭으로 회원↔종목 패널 전환 정상 동작 확인.
- 자동화 한계: Claude-in-Chrome 스크린샷이 고정 폭(1456)으로 캡처돼 좌표 클릭이 탭에서 빗나갔고(ref 클릭도 동일), 모바일 폭 리사이즈가 렌더 뷰포트에 반영되지 않음. 반응형은 코드(mobile-first Tailwind)로만 확인, 실제 <768px 스크린샷 확인은 미완.
- 커밋은 사용자 요청 대기(하네스 규칙: 요청 시에만 커밋). master가 기본 브랜치라 커밋 시 브랜치 분리 필요.

## 2차 스코프 — 거래 기능 (2026-07-22, 사용자 추가 요청)
- 요청: "모의투자를 실제로 할 수 있어야" → /trade(매수·매도), /portfolio, /me(내정보), /support(고객센터), AI 챗봇 위젯 추가.
- 튜토리얼 보상 정책 변경(사용자 확정): 비금전 뱃지 → **단계 완료 시 초기지급액의 % 지급** (2/3/3/5/5%, 총 18%).
  - 보너스는 account.bonusTotal에 누적, 수익률 분모(투자원금 = 시드+보너스)에 포함 → 보너스가 수익률 부풀리지 않음.
  - 기획서 4-5 의존관계 규칙에 따라 **랭킹을 수익률(%) 기준으로 전환** (랜딩 문구·Rankings 페이지·decisions.md 일괄 갱신).
- 시세: useLivePrices 훅이 2.2초마다 tradeService.tick() (랜덤워크 ±0.3%, 호가단위 반올림) + 지정가 미체결 자동 매칭.
- 세션 복원 수정: mockDb 리셋(새로고침)으로 사라진 유저·정지 유저는 getSession에서 세션 무효화.
- 병렬 서브에이전트 활용: Portfolio/Support/AssistantWidget 3개 파일을 서브에이전트가 제작, 코어(tradeService·tutorialService·Trade·MyPage·라우팅)는 메인이 직접.
- 챗봇 안전장치: 종목 추천 질문은 항상 거절(브라우저 실검증 완료), 기술적 관점은 일반론+면책 문구만.
- 알려진 한계: 인메모리 mockDb라 새로고침 시 거래·가입 데이터 리셋(데모 계정은 시드로 복원). 실백엔드 연동 시 해소.

## 노션 테이블 명세서 (2026-07-22)
- (팀 내부 Notion 문서) — 백엔드 기준 **21개 테이블** (논리명/물리명/타입/Null/Key/Default/설명).
- 팀 요청으로 갱신: ① 성능 인덱스(IDX) 전부 제거, PK/FK/UNI만 유지. ② user_id를 trades·holdings·decision_logs·ai_habit_reports에 FK 추가(안전한 비정규화). ③ decision_logs에 target_price·stop_loss_price·expected_holding_period(DAY/SWING/LONG) 추가 — AI '계획 vs 실제' 피드백 근거. ④ 그래프 DB(투자성향, 튜터 제안) 설계노트. ⑤ 커뮤니티 실시간 채팅 테이블 신설(community_channels/community_messages, 수익률 인증 PNL_SHARE). ⑥ KRX 원천 stock_master/stock_daily_prices, AI 챗봇 chat_rooms/chat_messages.
- **docs/db-schema.md 노션과 동기화 완료(2026-07-22)** — 21 테이블 전체 + mermaid ERD(UNI는 ERD에서 UK로 표기) + 공통 설계 노트 11개. 노션이 source of truth, db-schema.md는 동기화 사본.
- api-spec.md는 아직 구버전 — 사용자가 정책 정리본을 주면 그걸 토대로 업데이트 예정.

## v2 기획서 기준 API 명세서 + 미확정 확정 (2026-07-22~23)
- 노션 **api 명세서**(3a5b…19749) 신규 작성: v2 기획서 정책 → 엔드포인트(인증/계좌/시세/주문/투자일기/AI복기/랭킹/튜토리얼/알림/커뮤니티/관리자/부록).
- 미확정 4건 사용자 확정: 투자일기=**목표가·손절가만 필수**, 랭킹=**실시간**(Redis ZSET), 거래=**현실 버전**(세금·수수료·호가·±30%), 종목=**대표 종목만**(코스피200/코인 상위30).
- 추천 기본값 확정: 주식 매도 거래세 0.18%+위탁 0.015%·장마감후 예약주문·이벤트드리븐 / 코인 소수8·최소5,000원·수수료0.05% / 튜토리얼 **6단계×50만=총 300만/계좌** / 알림 90일·200개 / 주식시세 v2 전영업일 재생 / KRX 분봉은 회신 확인 액션.
- 커뮤니티 **채팅방형 → 게시판형 교체**(community_posts/post_comments/post_reactions/post_reports). db-schema.md + 노션 테이블 명세서 동기 반영. 수익인증 글은 trade 첨부 필수, 신고 포함.
- **KRX 원천 테이블(stock_master·stock_daily_prices) 의도적 제거 확정**(사용자) — 노션 테이블 명세서·레포 db-schema.md 양쪽에서 완전 삭제, 이후 번호 재정렬(현재 **21개 테이블**, 1~15 + 16·17 챗봇 + 18~21 커뮤니티). 관련 참조(instruments 비고·시세 저장 노트) 정리. 주식 재생용 시세 데이터 저장 형태는 구현 단계 결정으로 남김. API 명세서 부록의 KRX 분봉 확인 액션은 정책(재생)상 유효하게 유지.
- 세 문서(노션 테이블 명세서 / 노션 API 명세서 / 레포 db-schema.md) 정합 완료.
- 프론트 코드에도 카카오/네이버 소셜 로그인 버튼(mock, SocialLogin.tsx) 추가됨.
- 추가 결정(2026-07-22): ① 랭킹을 **실현손익 기준 + 실시간(Redis ZSET, 체결 시 ZADD)** 으로 전환, rankings 테이블은 스냅샷 아카이브로 병행. ② 투자일기 decision_logs를 **ENTRY(매수 계획)/EXIT(매도 회고)** 로 분리, log_type·emotion 컬럼 추가(매수 마찰↓·사후편향 회피). ③ 주문 지정가 체결을 **배치 스케줄러 → 이벤트 드리븐(WebSocket 틱 큐, 2계층, 재연결 리컨실)** 로 변경. 그래프DB·커뮤니티 노트 유지.
- ⚠️ 프론트 앱은 아직 랭킹을 '수익률(%)'로 표시 중 → 스펙(실현손익)과 불일치. 앱 동기화는 요청 시.

---

# 4차 스코프 — 실백엔드 연동 리팩터 (2026-07-30)

여기서부터가 현재 진행 중인 작업이다. 위쪽 mock 시대 기록과 충돌하면 **이 섹션이 우선**이다.

## 목적

mock 시연이 아니라 **회원가입 → 매매 한 사이클**을 사용자가 실제로 끝까지 체험하는 것.
백엔드(`C:\Users\user\Desktop\tradeclass-api`, 로컬 `http://localhost:8080`)에 없는 기능은
mock으로 남기지 않고 화면·메뉴에서 **제거**한다. 화면이 빈약해 보여도 실제로 되는 것만 남긴다.

베이스라인 커밋 `84cdfc5` = mock 상태 그대로. 문제 생기면 여기로 되돌린다.
(초기 커밋에 `src/`가 누락돼 추적 파일이 0개였어서 새로 만든 커밋이다.)

## 제거 확정 (백엔드 미구현)

지정가 주문(`PendingOrder`·`LIMIT`) / 랭킹(`rankingService`·`/rankings`·`RankingPhilosophy`) /
튜토리얼 보상(`tutorialService`·`Missions`) / 관리자(`adminService`·`/admin`·`requireAdmin`) /
투자일기(`DecisionLog`·`RecordReview`) / 경제 이벤트(`EconomicEvent`) /
AI 챗봇 위젯(`AssistantWidget`) / 고객센터 1:1 문의 폼 / 소셜 로그인 버튼(`SocialLogin`).

라우트·메뉴·랜딩 섹션·`mockDb` 시드까지 같이 지운다. 고객센터 페이지는 FAQ만 남기고 유지.

## 백엔드 계약의 핵심 (실제 소스 확인 완료 — 문서보다 이게 정본)

- **성공 응답은 봉투 없는 bare JSON.** 오류만 `{"error":{"code","message","requestId"}}`.
  `message`는 불안정 계약이라 화면에 쓰지 않고 **`code`로만 분기**한다.
- 인증은 쿠키가 아니라 `Authorization: Bearer <accessToken>`.
- `POST /api/auth/refresh`는 **단일 사용 회전** — 응답의 두 토큰을 모두 교체 저장해야 하고,
  동시에 두 번 호출하면 두 번째가 401이 되어 사용자가 로그아웃된다. → 단일 비행 필수.
  이 리팩터에서 가장 위험한 항목이다.
- `GET /api/auth/me`에 **`role` 필드가 없다** → 클라이언트 관리자 개념은 구현 불가.
- `POST /api/orders`는 `Idempotency-Key` 헤더 필수. 서버 요청 해시가
  `market:instrumentId:side:orderType:quantity` 이므로 **같은 키 + 다른 본문 → 409 IDEMPOTENCY_CONFLICT**.
  키를 요청 본문의 `useMemo`로 만들면 이 사고가 구조적으로 안 난다.
- `GET /api/orders`·`/api/trades`에 **symbol·name이 없다** → `GET /api/instruments` 캐시 조인 필수.
- `returnRate`는 퍼센트가 아니라 **scale-4 비율** (`0.0020` == 0.20%). 표시할 때 ×100.
- 회원가입은 3단계. `email-verifications` → `confirm`(6자리) → `signup`.
  `signup` 응답이 **201 + TokenResponse라 그대로 로그인된다.**
- 가입 시 STOCK·CRYPTO 계좌가 각각 시드머니 1,000만원으로 동시 생성된다(별도 개설 단계 없음).
- 수수료는 백엔드가 계산한다(주식 0.015%). **프론트에서 수수료·세금을 계산하지 않는다** —
  mock 시대의 매도 거래세 0.18%는 백엔드에 없다.

## 결정 기록

### D1. dev 프록시로 CORS를 우회한다
백엔드에 CORS 설정이 **아예 없다**(`grep -r cors src/main` 0건). 백엔드에 CORS를 추가하는 대신
`vite.config.ts`의 `server.proxy['/api']`로 같은 origin에서 호출한다. 같은 origin이면 preflight
자체가 없어서 `Idempotency-Key` 같은 커스텀 헤더의 `Access-Control-Allow-Headers` 허용도
불필요하다. 모든 호출은 상대경로 `/api/...`이며 절대 URL을 쓰지 않는다.

### D2. 주식 SSE는 EventSource로 못 붙는다
`GET /api/stocks/stream`이 Bearer를 요구하는데 브라우저 기본 `EventSource`는 커스텀 헤더를 실을
수 없다. `fetch()` + `res.body.getReader()`로 직접 파싱한다(`src/hooks/useStockStream.ts`).
프레임 구분은 `\n\n`, `:`로 시작하는 줄은 주석이라 건너뛴다. 서버는 20초마다 `:heartbeat`
**코멘트만** 보낸다 — 이름 있는 heartbeat 이벤트가 아니다. 서버에 리플레이 버퍼가 없으므로
`Last-Event-ID`는 보내지 않는다. 재연결 시 `snapshot`이 16종목 전체를 다시 줘서 자체 치유된다.
참고 구현: `C:\Users\user\Desktop\finplay-sse-test\src\StockStreamTest.tsx` (동작 확인됨).

### D3. 코인은 UI에서 완전히 제거한다 (주식 단일 시장)
백엔드 소스 확인 결과 로컬에서 코인은 **가격도 캔들도 나오지 않는다**.
- 가격: `FakeBithumbFeedClient`(`@Profile("!prod")`)의 `start()`/`emitTick()`을 호출하는
  프로덕션 코드가 0개다(테스트만 호출). Redis `PriceStore`가 비어 있어
  `/api/instruments/{id}/price` → 409 `PRICE_UNAVAILABLE`, **코인 시장가 주문은 100% 실패**.
- 캔들: 실제 provider `BithumbRestCandleProvider`가 `@Profile("prod")`라 로컬에서 뜨지 않고,
  로컬에 뜨는 `FakeCryptoCandleProvider`의 맵은 비어 있어 **영구히 `200 []`**.

처음 방침은 "코인 차트만 보기용으로 남긴다"였으나 영원히 빈 차트는 mock보다 나쁘다.
→ 주식 단일 시장으로 간다. 시장 선택 탭(주식/코인)도 제거하고 `coin` 색 토큰도 없앤다.

부수 효과: `GET /api/portfolio`는 두 시장 합산이라(분모 20,000,000) 주식만 보여주는 화면에서
쓰면 총자산이 2,000만으로 보여 혼란스럽다. → **`/api/portfolio`는 쓰지 않고
`/api/accounts/summary?market=STOCK`만 사용한다.**

**D3 해제됨 (2026-07-31).** 백엔드 `finplay#104`·`#107`이 머지되어 `SPRING_PROFILES_ACTIVE=local,crypto-real`
로 띄우면 코인 현재가·캔들이 실제 빗썸 데이터로 나온다. 당시 판단(빈 차트는 mock보다 나쁘다)은 옳았고
전제만 바뀌었다. → 시장 탭·`coin` 토큰·`SplitAccounts`·Hero 듀얼 계좌를 복원한다.
단, `GET /api/portfolio`를 쓰지 않는 결정은 그대로 유지한다(시장 탭 화면과 분모가 어긋난다).
코인 시세는 전용 스트림이 없어 `useCryptoPrices`가 5초 폴링하고, 캔들은 `useCandles(market:'CRYPTO')`의
기존 폴링 경로를 그대로 쓴다(새 캔들 훅 없음).

### D4. 주식 시세는 로컬 dev 시드로 살린다
주식은 "과거 거래일 재생"이라 `stock_replay_sessions`에 오늘 날짜 READY 행 +
그 원본 거래일의 `stock_candles` 행이 둘 다 있어야 시세가 나온다. 이걸 만드는 배치는
KIS API 키(08:10 수집)와 08:40 세션 확정에 의존한다.
→ 백엔드에 **`local` 프로필 전용** 시드 엔드포인트 `POST /api/dev/stock-replay-seeds`를 추가한다.

주문 가능 여부(`assertOrderable`)는 추가로 **벽시계 09:00~15:30 평일**을 하드 게이트로 본다.
장외에도 시험할 수 있도록 `local` 프로필에서만 등록되는 `StockPriceProvider` 데코레이터와
`finplay.dev.stock.force-market-open` 플래그로 OPEN을 강제한다(시드 안 했으면 정직하게 CLOSED).

Flyway 마이그레이션 시드는 **기각**: `service_date`가 "요청 시점의 오늘"이어야 하는데
마이그레이션은 고정 날짜만 담을 수 있고, prod와 Testcontainers에서도 실행된다 (ADR-0004).

### D5. 시세가 없을 때는 정직하게 표시한다
시드 안 된 상태, 장 마감, `priceStatus: 'UNAVAILABLE'`을 숨기지 않는다. 주문 버튼을 비활성화하고
**사유를 문구로** 보여준다. `GET .../candles`의 `200 []`은 오류가 아니라 정상 응답이므로
(장 준비 전, 09:01 이전) 차트의 빈 상태로 처리한다.

### D6. 회원가입 인증번호는 백엔드 콘솔에서 확인한다
로컬은 `FakeEmailSender`라 실제 발송이 없고 코드가 서버 로그에만 찍힌다.
`[FakeEmailSender] 인증번호 발송 (실제 발송 안 함) to=... code=123456`
백엔드를 고치지 않고, 가입 2단계 화면에 `import.meta.env.DEV`일 때만 이 사실을 알리는 안내를 띄운다.

### D7. 상태 관리 라이브러리를 도입하지 않는다
의존성은 react / react-dom / react-router-dom 3개를 그대로 유지한다.
- 토큰 공유: `src/lib/tokenStore.ts`(모듈 스코프) + `useSyncExternalStore`.
  `apiClient → AuthContext → apiClient` 순환 의존을 끊으려고 **아무것도 import하지 않는**
  제3의 모듈로 만든다.
- 종목 캐시: `instrumentService`의 모듈 스코프 `Map`. 종목은 Flyway 시드라 런타임 불변 →
  TTL도 재검증도 필요 없다.
- 401 갱신은 선제적 만료 타이머가 아니라 **반응형**으로 한다.
  `accessTokenExpiresInSeconds`를 저장하지 않는다 — 두 번째 진실 공급원이 되어 어긋난다.
- 차트도 라이브러리 없이 인라인 SVG로 직접 그린다.

## 디자인 톤 (v0 "Pointer AI landing page" 참고)

픽셀 복제가 아니라 **"다크 배경 + 민트 글로우 + pill 버튼 + 넉넉한 여백"** 톤만 차용한다.
토큰은 `tailwind.config.js`에 있고 **이름을 유지한 채 값만 다크로 반전**했다. 따라서 기존
`bg-canvas` / `text-ink` / `text-brand` 유틸리티가 자동으로 다크 톤을 따른다.

| 토큰 | 값 | 용도 |
|---|---|---|
| `canvas` | `#0A0A0B` | 페이지 배경 (거의-검정) |
| `surface` | `#131317` | 카드 이너 코어 |
| `elevated` | `#1B1B21` | 입력·표 헤더·중첩 표면 |
| `ink` | `#F4F4F6` | 본문 텍스트 (**값이 반전됐다**) |
| `muted` | `#9A9AA6` | 보조 텍스트 |
| `line` | `#26262E` | 경계선 |
| `brand` | `#5EEAD4` | 포인트 민트. 강조 버튼·활성 상태·링크 hover |
| `brand-soft` | `#123B38` | 민트 칩/아이콘의 어두운 배경 |
| `brand-ink` | `#04201D` | **민트 배경 위 텍스트** (민트에 흰 글씨는 대비 부족) |
| `gain` | `#FB7185` | 상승·수익(+) — 한국 관습 적색 |
| `loss` | `#60A5FA` | 하락·손실(−) — 한국 관습 청색 |

규칙:
- **버튼은 전부 `rounded-full` pill.** 주 버튼은 `bg-brand text-brand-ink shadow-glow`.
- 폰트는 그대로 (`Pretendard` / `Space Grotesk`). 템플릿이 영문 전용이라 한글 폰트는 유지가 맞다.
- 배경 장식은 `.orb` + `animate-float-orb` (민트 글로우). 로그인·대시보드 배경에 쓴다.
- `shadow-glow` / `shadow-glow-lg`가 민트 글로우 그림자다.
- 하드코딩된 `bg-white` / `text-white` / `border-black/...`을 **새로 쓰지 않는다** — 토큰을 쓴다.
  기존 페이지에 남아 있는 것들은 다크에서 깨지므로 반드시 고친다.
- **`bg-ink text-white` 조합 금지**: `ink`가 이제 밝은 색이라 흰 글씨가 안 보인다.
  (기존 `Button` primary·`Tabs` 활성 상태가 이 조합이었다 — 민트로 교체했다.)

## 해체·데이터 레이어 작업 중 추가 결정 (2026-07-30)

- **`Signup`·`Trade`·`Portfolio`·`MyPage` 는 "준비 중" 자리표시자로 축소했다.** mock 엔진(`tradeService.tick`,
  `tutorialService`, `useLivePrices`, `DecisionLog`)에 너무 깊게 묶여 있어 부분 수정보다 통째 교체가 싸다.
  각 파일 첫 줄에 `TODO(4차)` 주석을 남겼다. `Login` 은 실 API 로그인만 최소 연결해 살려 뒀다.
- **`Landing` 은 3섹션(Hero·TechHighlights·CTA)으로 줄었다.** 삭제된 5섹션 중 `SplitAccounts` 는
  "주식·코인 계좌 분리"가 섹션 존재 이유라 코인 제거(D3)와 함께 사라졌고, `AiHabit` 은 백엔드에
  습관 분석·AI 리포트 엔드포인트가 없어 투자일기와 같은 규칙으로 제거했다. `Hero` 의 듀얼 계좌
  미리보기도 주식 단일 카드로 바꿨고, 깨진 `랭킹 둘러보기`(`/rankings`) CTA 는 `/support` 로 돌렸다.
- ~~⚠️ **`TechHighlights` 문구는 아직 낡았다**~~ → **2026-07-31 해결** (이슈 #2). Kafka·투자일기 언급은
  랜딩 재작성 때 사라졌고, 마지막으로 남아 있던 "Redis 시세 저장소"를 이번에 고쳤다.
  아래 "5차 — 브라우저 시각 검증" 절 참조.
- **`lib/format.ts` 에서 `formatDate(iso)` 를 지웠다.** 소비자가 0개였고 `new Date(iso)` 로 오프셋 없는
  백엔드 문자열을 파싱하는 함정이었다. 날짜·시각 표시는 `lib/datetime.ts` 가 단독으로 책임진다.
  `formatPercent` 는 계속 **퍼센트**를 받는다 — 비율 ×100 은 `ratioToPercent` 한 곳에서만 한다.
  mock 수수료·세금 계산은 `tradeService` 안에 있었어서 `format.ts` 에는 지울 것이 없었다.
- **`Card` 의 `accent` 를 `'brand' | 'none'` 으로 줄였다.** `'stock'`·`'coin'` 은 tailwind 에서 토큰이 이미
  삭제돼 실제로는 CSS 가 생성되지 않는 죽은 값이었다.
- **부팅 `/me` 가 401 이면 세션을 비운다.** 갱신 성공 후에도 `/me` 가 401 이면(회원 삭제 등) 액세스 토큰이
  회전될 때마다 부팅 이펙트가 다시 돌아 **무한 갱신 루프**가 된다. 네트워크 오류는 세션을 비우지 않고
  캐시된 member 로 계속 그린다.
- **`Nav` 의 지갑 pill 은 제거했다.** mock `getSummarySync` 2.5초 폴링이 근거였고, 실 API 로 살리려면
  `/api/accounts/summary` 주기 폴링이 필요해 화면 재작성 단계에서 판단할 일이다.
- **아이콘은 스코프와 함께 죽은 것만 지웠다** (`Trophy`·`Target`·`Flag`·`Calendar`·`Users`·`Notebook`·`Coin`·`Menu`).
  `Check`·`Close`·`User`·`ArrowRight` 는 현재 소비자가 없어도 남겼다 — 재작성될 가입 체크박스·모달 닫기 등에
  다시 필요할 범용 아이콘이라 지웠다 다시 만드는 편이 더 손해다.
- **다크 톤 하드코딩 정리**: `pnlTone()` 이 `text-rose-600`/`text-blue-600` 대신 `gain`/`loss` 토큰을 쓴다.
  `AuthLayout`·`CTA` 의 `bg-ink` + `text-white` 패널은 `bg-surface`/`bg-canvas` + `text-ink` + `.orb` 로 교체했다.

## 남은 한계 (알고 있는 것)

- 커뮤니티 게시글에 `authorId`가 없어 소유 판정을 `authorNickname === me.nickname`으로 한다.
  닉네임을 바꾸면 과거 글의 소유 판정이 깨진다. → **403 FORBIDDEN을 최종 권위로** 다룬다.
- 댓글은 페이지네이션·수정·대댓글·좋아요가 없다. 전부 렌더한다.
- 같은 값이 엔드포인트마다 다른 scale로 온다 (`POST /api/orders` → `10`,
  `GET /api/orders` → `10.00000000`). 문자열 비교 금지, 항상 숫자로 비교한다.
- `LocalDateTime`에 오프셋이 없다 (`"2026-07-29T09:00:00"`). `'Z'`를 붙이면 9시간 어긋난다.
  파싱은 `src/lib/datetime.ts`의 `parseLocalDateTime`만 쓴다.
- 주식 캔들의 `sourceTime` 날짜는 **오늘이 아니라 원본 거래일**이다. 화면에 원본 거래일을
  같이 보여줘 사용자가 혼란하지 않게 한다.

---

## 미로 와이어프레임 (2026-07-22)
- 보드: (팀 내부 Miro 보드) — 화면 10프레임 + OAuth(카카오/네이버) 포함 유저 플로우 다이어그램 + 설계 노트 문서. 튜터 발표용.
- OAuth는 와이어프레임에만 반영(코드 미구현). 구현 시 인가코드 플로우 + 최초 로그인 자동가입/계좌생성 + 이메일 병합 정책 적용.

## 3차 스코프 — UX 보강 (2026-07-22, 사용자 추가 요청)
- 상단 내비에 지갑 pill 추가: 보유(총자산)·가능(현금 합산), 2.5초 read-only 갱신(틱은 페이지가 담당), 클릭 시 /me. 내비 폭 max-w-4xl → 5xl.
- 종목 28개로 확충 (주식 16 — LG화학은 거래정지 예시 / 코인 12). openPrices·livePrices 동기 시드.
- 내정보 계좌 카드 = 버튼 → navigate('/portfolio', {state:{market}}). Portfolio가 location.state.market으로 초기 탭 선택.
- 매매 내역 행 = 버튼 → TradeDetailModal (z-50, 배경 클릭 닫기): 단가·수량·금액·수수료 + 연결된 투자일기·AI 복기 표시.

---

# 5차 — 브라우저 시각 검증 (2026-07-31, 이슈 #2)

`checklist.md` G섹션의 "남음"은 전부 **Chrome 확장이 안 붙어서** 미실행 상태였다. 이번에는
확장 대신 별도 Chrome 을 CDP(포트 9333)로 띄우고 puppeteer-core 로 몰아서 실제 화면을 봤다.
백엔드는 `SPRING_PROFILES_ACTIVE=local,crypto-real` 로 기동했다 (코인 실데이터).

## 하네스에서 배운 것 (다음 사람이 같은 데서 막히지 않도록)

- **창이 가려지면 랜딩이 통째로 빈 화면으로 찍힌다.** 백그라운드/가려진 창은
  `document.visibilityState === 'hidden'` 이 되고, 그러면 IntersectionObserver 가 초기 엔트리를
  전달하지 않아 `.reveal` 이 29개 전부 `opacity: 0` 으로 남는다. **코드 버그가 아니다.**
  Chrome 을 `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding
  --disable-features=CalculateNativeWinOcclusion` 로 띄우면 해결된다.
- 백엔드 `bootRun` 은 `.env` 를 자동으로 읽지 않는다. `set -a; . ./.env; set +a` 를 먼저 해야
  `JWT_SECRET` 미해결로 죽지 않는다. Docker Desktop 이 떠 있어야 compose 가 뜬다.

## 이번에 고친 것 (전부 브라우저에서 재현·재검증)

- **`CandleChart` 가 좁은 화면에서 통째로 축소됐다.** `viewBox="0 0 640 260"` + `w-full h-auto` 는
  SVG 좌표계를 컨테이너 폭에 맞춰 균일 축소한다 → 390px 에서 배율 0.44, 차트 높이 115px,
  축 라벨 4.4px 로 읽을 수 없었다. `preserveAspectRatio="none"` 은 `h-auto` 때문에 실제로는
  가로 왜곡을 만들지 않았고, 진짜 원인은 **배율 자체**였다.
  → `ResizeObserver` 로 컨테이너 실제 CSS 폭을 재서 `viewBox` 를 그 픽셀 크기로 잡는다
  (1 유저단위 = 1 CSS 픽셀). 라벨은 항상 10px 로 렌더된다. 좁은 폭에서는 높이 0.72배, 봉 60개로 줄인다.
- **모바일 메뉴가 닫히지 않았다.** `<nav>` 에 스태킹 컨텍스트가 없어서 풀스크린 오버레이(`z-30`)가
  pill 위에 깔렸다 → `elementFromPoint` 가 X 버튼 자리에서 오버레이를 반환하고, 클릭해도 안 닫혔다.
  링크를 눌러 이동하는 것 말고는 빠져나갈 방법이 없었다(배경 스크롤도 잠긴 상태). → `nav` 에
  `relative z-40`. Esc 로도 닫히게 했다.
- **768~1000px 구간에서 상단 내비가 완전히 깨졌다.** `md:flex` 로 펼치는데 그 폭에서는 메뉴·지갑·
  닉네임이 전부 2~3줄로 접혔다("포트 / 폴리 / 오"). 태블릿 세로(834px)가 정확히 이 구간이다.
  → 펼침 기준을 `lg` 로 올리고 각 항목에 `whitespace-nowrap`. 1024px 이상은 기존과 동일하다.
- **한국어 줄바꿈이 어절 중간에서 끊겼다.** 390px 히어로에서 "실제로 있었던 하 / 루를,",
  "1,000 / 만원". → `index.css` 전역에 `word-break: keep-all; overflow-wrap: break-word;`.
  히어로는 `13vw` → `11vw` 로 낮췄다.
- **문구 오류** (코드는 정상, 내용이 사실과 다름):
  - `TechHighlights` "Redis 시세 저장소 / 최신 가격은 Redis에 두고 읽습니다" → **주식은 Redis 를
    쓰지 않는다.** 백엔드 `PriceQueryService` 는 주식을 `StockPriceProvider`(→ MySQL `stock_candles`),
    코인을 `PriceStore`(Redis)로 나눠 위임한다. "시장별로 나눈 시세 경로"로 다시 썼다.
  - `Support` FAQ "코인도 거래할 수 있나요? → **아니요.**" 코인 복원(PR #3) 이후 명백히 틀린 답이다.
    실제로 브라우저에서 BTC 0.01 시장가 매수가 체결됐다. 전면 교체.
  - 코인 복원 뒤에도 "주식 계좌만 생긴다"로 남아 있던 곳을 모두 갱신: `index.html` title·description,
    `Footer`, `CTA`, `MarketOrders`, `Signup`(약관 문구·좌측 패널), `Support` 퀵헬프.
  - 수수료 문구에 코인 0.05% 를 추가했다 (`OrderExecutionService.CRYPTO_FEE_RATE` 확인).

## 미적 다듬기 (이슈 밖 추가 범위 — 표현만 손대고 정보는 그대로)

- 랜딩 섹션 리듬을 `py-24 md:py-36` → `py-20 md:py-28` 로 통일. 스크롤 중 빈 구간이 줄었다.
- `.reveal` 이동을 4rem → 1.75rem, blur 12px → 8px, 0.8s → 0.65s. "화면이 한참 비어 보이는" 느낌을 줄였다.
- `prefers-reduced-motion: reduce` 에서 `.reveal` 뿐 아니라 **모든 애니메이션**(orb 부유, pulse)을 멈춘다.
- 카드 `.lift` 호버(-3px), `:focus-visible` 민트 링, 내비 현재 메뉴 강조.
- `.skeleton` 자리표시 도입 → 거래 종목 목록·커뮤니티 목록 로딩.
- 커뮤니티 빈 상태에 아이콘·설명·"첫 글 쓰기" CTA. **없는 숫자·랭킹·후기는 만들지 않았다.**
- 폼 오류 색을 `text-gain`(=상승 적색, 시세용 토큰) → `text-rose-300`(Signup·Field 와 동일)으로 통일.

## 남은 것 / 다음 사람에게

- ~~**`MyPage` 는 아직 주식 계좌만 보여준다.**~~ → **같은 날 이어서 수정함.** 계좌 요약을 주식·코인 두
  카드로 나누고, 최근 체결 내역은 시장별로 각각 부른 뒤 `executedAt` 내림차순으로 합쳐 "시장" 열을
  붙였다. 결정 두 가지를 남긴다.
  - **`/api/portfolio`(두 시장 합산)는 쓰지 않는다.** 계좌가 구조적으로 분리돼 있고 수익률 분모도
    계좌마다 1,000만원이라, 합산 수익률은 화면의 다른 숫자 어느 것과도 이어지지 않는다.
    합산 대신 "두 계좌는 완전히 분리돼 있습니다" 캡션을 둔다.
  - **`tradeId` 는 시장별로 매겨져 두 시장에서 겹칠 수 있다.** 합친 목록의 React key 는
    `` `${market}-${tradeId}` `` 로 잡는다. 응답 `Trade` 에 `market` 필드가 없어서
    어느 호출에서 왔는지로 태깅한다 — 백엔드가 `market` 을 주면 이 태깅은 지워도 된다.
- 주식 SSE 의 **가격 갱신**은 이번에도 미확인이다 (검증 시각 02:30~03:10 KST, 장외).
  연결·스냅샷·하트비트는 확인했다. 자세한 범위는 `checklist.md` G섹션에 적었다.

## 장중 재검증에서 얻은 운영 지식 (2026-07-31 오전)

**주식 배치는 순수 cron 이고 따라잡기(catch-up)가 없다.** 백엔드 스케줄러 두 개가 이렇게 걸려 있다.

```java
// KisHistoricalCandleCollector      평일 08:10 KST — 직전 영업일 분봉 수집
@Scheduled(cron = "0 10 8 * * MON-FRI", zone = "Asia/Seoul")
// StockReplaySessionScheduler       평일 08:40 KST — 재생세션 READY/FAILED 확정
@Scheduled(cron = "0 40 8 * * MON-FRI", zone = "Asia/Seoul")
```

`@PostConstruct` 도 `ApplicationReadyEvent` 핸들러도 없다. **그 두 시각에 서버가 떠 있지 않았으면 그날은
아무 일도 일어나지 않는다.** 실제로 이 날 08:44 에 기동했더니 `stock_replay_sessions`·`stock_candles`·
`market_data_imports` 세 테이블이 전부 0행이었고, 09:00 이 지나도 계속 CLOSED 였다 —
`getMarketStatus()` 가 `findReadySession(오늘).isPresent()` 로 판정하기 때문이다.

되살리는 방법은 `POST /api/dev/stock-replay-imports` (`local` 프로필 전용, 본문 없음). 대상 거래일은
배치와 똑같이 직전 영업일로 고정돼 있고, 수집과 세션 확정을 한 번에 한다. 16종 순차 KIS 호출이라
**실측 108초** 걸렸다. `.env` 에 `KIS_APP_KEY`·`KIS_APP_SECRET` 이 있어야 한다.

판정은 `preparationStatus` 가 아니라 **`collectedKisCandleCount`** 로 한다. READY 인데 0건이면 재생할
원본이 없는 깨진 상태다.

**다중 기기 로그인은 버그가 아니라 설계다.** 같은 계정으로 동시 로그인이 되는 것을 확인했는데,
`AuthService.login()` 에 `// 기존 Refresh Token은 폐기하지 않고 행을 추가만 한다 (다중 기기 로그인 유지,
폐기는 재발급·로그아웃 소관)` 이라고 명시돼 있다. `refresh_tokens` 가 세션당 한 행이고, 전체 폐기
(`revokeAllActiveByUserId`)는 이메일 변경 때만 부른다 — "변경하면 모든 기기에서 로그아웃" 문구 자체가
다중 세션을 전제한다. 다만 **"내 로그인 기기 목록 / 특정 세션만 끊기" 가 없다** — 필요하면 백엔드 이슈감이다.

---

# 6차 스코프 — 2차 MVP 화면 보강 + 랜딩 비주얼 (2026-08-08)

여기서부터가 현재 작업이다. 위쪽과 충돌하면 **이 섹션이 우선**이다.

## 대전제 (사용자 확정)

**백엔드에 없는 내용을 프론트에서 만들어 채우지 않는다. 프론트로 대체한다는 선택지는 없다.
백엔드에 문제가 있으면 백엔드 자체부터 고친다 — 우리는 백엔드 부트캠프 팀이다.**

이 원칙은 4차의 "백엔드에 없는 기능은 화면에서 제거한다"를 한 단계 강화한 것이다. 4차는 "없으면 지운다"였고,
6차는 **"결함이면 백엔드를 고친다"** 다. 프론트에서 우회 코드로 덮으면 결함이 계약에 남아 다음 소비자가
같은 함정을 다시 밟는다. → 결함 목록은 `docs/backend-issues.md`에 도메인별로 분리해 적는다.

이 원칙에 걸려 실제로 폐기한 것이 있다. 랜딩 `ReplayScrub` 초안이 시드 고정 PRNG로 캔들 OHLC를
만들어 그렸다. "예시 도형"이라 주석을 달았지만 없는 시세를 만든 것이므로 전면 폐기했다.
랜딩은 비인증 공개 페이지라 시세 API(Bearer 필수)를 붙일 수도 없다. → **390분 눈금 사다리**로 교체했고
이 섹션이 쓰는 데이터는 "09:00~15:30 = 390분" 하나뿐이다.

## D8. 백엔드 레포는 로컬에 없다 — GitHub이 정본이다

`C:\Users\user\orca\workspaces\tradeclass-api\chore-sse`는 **빈 디렉터리**다. 4차 노트가 적어 둔
`C:\Users\user\Desktop\tradeclass-api`도 지금은 없다. 실제 정본은 **`finplay-team/finplay`** 이고
`gh api repos/finplay-team/finplay/contents/docs/...`로 읽는다 (레포 이름이 `tradeclass-api`가 아니다).

PowerShell에서 `gh --jq`에 `+`나 문자열 연결을 쓰면 인자가 쪼개져 `accepts 1 arg(s), received 2`가 난다.
`gh api ... | ConvertFrom-Json`으로 받아 PowerShell에서 다루는 편이 안전하다.

## D9. 계약 문서는 `api-contracts.md`만으로 부족하다 — spec.md까지 받아야 한다

`api-contracts.md`(164KB)가 `docs/specs/012-ai-feedback/spec.md`의 §C-4·C-5를 수십 번 참조하는데
그 파일을 안 받으면 상태 판정 순서와 게이트 판정식을 알 수 없다. 실제로 첫 추출이 그 부분을
"문서에 명시 없음"으로 남겼고, upstream spec을 받아서야 채웠다.
→ `.backend-docs/upstream/`에 spec 정본을 받아 두는 절차를 먼저 밟는다 (gitignore 대상, 필요 시 재수신).

**내 지시가 틀렸던 사례를 남긴다.** 에이전트에게 `peerComparison`이 3상태라고 알려줬는데(PRD 산문에서
3개만 언급된다) spec.md:332 기준 열거형 `PostSellFeedbackStatus`는 **4상태**(`READY`·`NOT_YET`·
`INSUFFICIENT_SAMPLE`·`NO_EVENT`)다. 에이전트가 정본을 근거로 내 지시를 반박한 것이 맞았다.
→ PRD 산문을 계약 근거로 쓰지 않는다. 열거형은 spec.md가 정본이다.

## D10. AI 피드백에는 하나의 boolean 게이트로 묶으면 안 되는 구간이 있다

`postSellFlow`·`counterfactuals`는 **시각** 게이트(그 체결의 서비스 날짜 15:30)이고
`peerComparison`은 **행 존재** 게이트다. 축이 다르므로 장 마감 배치가 15:30보다 늦게 돌면
`postSellFlow=READY` + `peerComparison=NOT_YET` 구간이 실존한다(spec.md:1366이 15:31 조회로 명시).
→ 섹션별 `status`를 각각 읽어 따로 렌더한다.

또 `EMPTY`·`UNAVAILABLE`에서도 `items`가 채워진다. `status !== 'READY'`로 빈 상태를 그리는
자연스러운 구현이 **목록을 통째로 잃는다.** 그리고 서술은 재생성이 성공할 때만 게이트가 닫히므로
같은 `tradeId`를 다시 조회하면 `narrative` 문장이 바뀔 수 있다 → 로컬 영구 캐시 금지.

## D11. 랜딩 색·폰트는 유지한다 (바이올렛 추가 취소)

사용자가 "안 어울리면 바꿔도 된다"고 했고 내가 처음엔 보색(딥 바이올렛) 추가를 추천했지만 **취소했다.**
단조로움의 원인이 색이 아니라 **모션이 1종류**였기 때문이다 — 섹션 7개가 전부 같은 `py-20` + 가운데
정렬 헤더 + 카드 그리드 + `.reveal` 페이드업이었다. 색을 늘리면 "차별점"이라는 목표와 반대로 브랜드가 흐려진다.
→ `tailwind.config.js` **변경 0건.** 민트 하나를 광도·투명도 단계로 쓰고 코인은 기존 앰버를 유지했다.

해법은 **결정적 순간 하나를 만들고 나머지를 조용하게** 두는 것이다. 그 하나가 `ReplayScrub`이고,
유리(glass)를 장식이 아니라 기능으로 쓴다 — 카드 뒤로 눈금이 실제로 비쳐 보이는 자리에만 둔다.

`.bezel`이 이미 유리 표면(`bg-white/[0.04]` + `backdrop-blur-sm` + `ring-white/[0.06]`)이라
liquid-glass는 새로 만드는 것이 아니라 확장이었다.

## D12. motionsites.ai는 디자인 라이브러리가 아니다

**AI 프롬프트 갤러리**다(Lovable·Bolt·Cursor용, Pricing 페이지 별도). 카드마다 `Copy full prompt`가
있고 프롬프트 본문은 DOM에 없어 스크레이핑으로 못 얻는다. 색·폰트를 안 베끼기로 했으므로 어차피
**기법 이름만 참고**하면 목적은 달성된다 — Liquid Glass 계열, Orbis(애스트로넛), Nimbus Sticky Cards.

## D13. 스크롤 연동 눈금은 DOM이 아니라 반복 배경으로 그린다

390개 `<span>`에 `flex-1`을 주면 **358px 폭에서 서브픽셀이 되어 눈금이 통째로 사라진다**(모바일에서
실제로 사라졌다). 반복 배경(`background-size: calc(100% / N) 100%`)은 폭에 비례해 스케일되므로
좁은 화면에서는 촘촘한 띠로 열화되며 사라지지 않는다. DOM 390개 → 4개로도 줄었다.

공개 구간은 **요소 폭을 줄이지 않고 `clip-path: inset()`으로 잘라낸다.** 폭을 줄이면 배경 타일 기준이
같이 줄어 미공개 레이어와 눈금이 어긋난다.

duty(눈금 두께)를 `%`로 두면 좁은 폭에서 같이 소멸한다. **정시 눈금만 고정 `1.5px`**로 두면
어느 폭에서도 선이 살아 시간 구조가 읽힌다.

## D14. 3D 마스코트는 SVG 기본선으로 먼저 만들었다

`.glb`(Tripo/Meshy 산출물)가 도착하지 않았다. `three` + `@react-three/fiber` + `drei`는 번들
**~600KB gzip**이라 의존성 3개짜리 앱에서 큰 결정이고, 당시 메모리 부족으로 `npm install`도 위험했다.
→ `Mascot.tsx`를 SVG로 만들어 의존성 0KB로 같은 역할(시선 유도)을 하게 했다. 커서 추적은
`pointermove` + rAF, `(hover: hover)`와 `prefers-reduced-motion`을 먼저 검사한다.
**바깥에 노출하는 props는 `className` 하나뿐**이라 3D 도착 시 이 파일만 교체하면 된다.

## 이 환경의 운영 지식 (다음 사람이 같은 데서 막히지 않도록)

### 병렬 에이전트는 이 머신에서 4개가 상한이다

16GB RAM에서 에이전트 4개 + node를 동시에 돌리자 여유가 0.8GB로 떨어지고
`node`가 **"The paging file is too small for this operation to complete"**로 죽었다.
계약 추출 에이전트 4개 중 **1개(order/LMT·WATCH)가 산출물 없이 유실**됐다.

병렬의 진짜 병목은 토큰이 아니라 **파일 충돌**이다. 도메인 6개가 `services/types.ts`·`App.tsx`·`Nav.tsx`
셋을 공유하므로, 계약 추출(읽기 전용, 각자 자기 파일만 씀)은 병렬이 이득이지만
화면 구현은 **메인이 `types.ts`를 먼저 한 번에 정의한 뒤** 나눠야 한다.
랜딩처럼 토큰·리듬·모션이 서로 물린 작업은 병렬이 명확히 손해다.

### 메모리 도둑은 Serena였다 (제거함)

java 프로세스 5개(최대 1.7GB, 합 2.6GB)가 전부 **Serena가 띄운 Eclipse JDT 언어서버**였고
**같은 워크스페이스 해시**(`c6f07a3d7be7606230e85b03ac8a3a17`)를 가리키고 있었다. 세션마다 새로 띄우고
회수하지 않는 누수다. IntelliJ·Docker·백엔드가 아니었다 — 확인해 보니 Docker 데몬은 꺼져 있었고
MySQL은 네이티브(`mysqld`)였고 **8080은 리스닝조차 아니었다**(백엔드 서버가 안 떠 있었다).

사용자 요청으로 제거했다. `claude mcp remove serena` → `.claude.json`에서 삭제
(백업 `.claude.json.bak-20260808-serena`), 언어서버 5개 종료, `~/.serena/language_servers` 2GB 삭제.
`memories` 폴더가 비어 있어 잃은 사용자 데이터는 없다.
**여유 메모리 0.8GB → 6.1GB.**

### claude-mem 훅이 프롬프트를 차단하는 교착이 있다

`UserPromptSubmit operation blocked by hook` + `claude-mem worker unreachable for N consecutive hooks`가
뜨면 **사용자 메시지가 에이전트에 도달하지 않는다**(이번에 최소 2개 유실됐고 카운터가 141까지 갔다).

크래시가 아니라 **자기 자신을 막는 교착**이다. 로그가 이 4단계를 무한 반복한다.

```
Port in use, waiting for worker to become healthy
Port in use but worker not responding to health checks
Port already in use, refusing to start duplicate {port=37777}
Worker port did not open after lazy-spawn within the cold-boot wait (~15s)
```

원인은 워커(bun)가 죽었는데 **죽은 PID가 37777을 `Listen` 상태로 계속 점유**하는 것이다.
워커가 남긴 chroma 고아 트리가 리스닝 소켓 핸들을 상속해 물고 있어서 포트가 해제되지 않고,
claude-mem은 "포트가 이미 쓰인다"며 새 워커를 거부한다.

복구 절차.
1. `Get-NetTCPConnection -LocalPort 37777`로 점유 PID 확인 (존재하지 않는 PID면 상속 핸들이다)
2. `--data-dir .../.claude-mem/chroma`로 뜬 chroma 고아 프로세스 종료 → 포트 해제 확인
3. `~/.claude-mem/supervisor.json`(죽은 PID가 적혀 있다)과 `state/hook-failures.json` 초기화
4. `~/.bun/bin/bun.exe <plugin>/scripts/worker-service.cjs` 로 재기동 → `http://localhost:37777` 200 확인

`claude-mem.db`는 절대 건드리지 않는다.

### 브라우저 검증은 여전히 CDP 우회다

Chrome 확장은 이번에도 안 붙었다(`Browser extension is not connected`). 5차와 같은 방법을 쓴다 —
별도 Chrome을 `--remote-debugging-port=9333`로 띄우고 `puppeteer-core`(`npm i --no-save`로
package.json을 더럽히지 않는다)로 조작한다. 5차의 창 가림 플래그 3개는 계속 필요하다.
검증 스크립트는 `.backend-docs/shoot.mjs`(gitignore)에 있고 데스크톱·모바일을 한 번에 돈다.

`.orb`가 가로 오버플로로 검출되는 것은 **오탐**이다 — 부모 섹션에 `overflow-hidden`이 있어
`documentElement.scrollWidth`는 초과하지 않는다. 판정은 요소 `right`가 아니라 문서 `scrollWidth`로 한다.

---

# 6차 후반 — 목표 1 구현과 실측 검증 (2026-08-08)

## D15. 계약 문서만으로 백엔드 결함을 판정하지 않는다

`docs/backend-issues.md` 초안 15건을 spec 정본으로 재검증했더니 **4건이 틀렸고 6건이 과장**이었다.
철회한 4건(C-5·M-1·X-1·J-1)은 전부 같은 실패다 — **백엔드가 이미 의도적으로 결정하고 그 이유를
spec 에 `(확정)`으로 적어 둔 것을, `api-contracts.md`만 보고 "결함"이라 판단했다.**

- `spec013:51` "**`sourceTime`(확정)**", `:55` "그 날에 거래가 있었다는 뜻이 아니다"
- `spec014:69` "**의도적으로 다름 — 이 차이를 테스트로 명시한다**"
- `spec007:196` "통합 식별자·접두사 문자열 ID도 만들지 않는다"

→ **`(확정)`·"의도된 차이"·"범위 제외" 문구를 먼저 찾는다.** 계약 문서는 "무엇을"이고
spec 이 "왜"다. 왜를 모르고 결함을 신고하면 팀 신뢰를 잃는다.

실제로 이슈 하나(#273)를 잘못 올렸다가 닫았다. "코인 뉴스 0건"이라 신고했는데 23:21 사이클에
275건이 정상 적재됐다. **건수만 비교하고 `created_at` 분포를 안 봤다** — 주식이 8/4부터 누적
1,571건인 것과 코인이 첫 수집 전 0건인 것을 "같은 사이클에서 코인만 실패"로 잘못 읽었다.
적재 관련 신고는 반드시 `created_at` 분포까지 본다.

## D16. 병렬 에이전트는 공유 파일을 먼저 확정하면 통한다

투자일기·랭킹·AI 피드백을 에이전트 3개로 동시에 만들었고 **첫 통합 빌드가 타입 에러 0으로 통과**했다.
성립 조건은 이랬다.

- **메인이 `types.ts`를 먼저 전부 정의한다.** 도메인 6개가 같은 파일을 건드리므로 이걸 안 하면 충돌한다
- **에이전트는 새 파일만 소유한다.** `App.tsx`·`Nav.tsx`·기존 페이지 배선은 전부 메인이 한다
- **에이전트에게 빌드를 시키지 않는다.** `tsc -b`의 `tsbuildinfo`와 vite 의 `dist`를 공유해 서로 깨진다
- 계약 추출 문서(`docs/backend-contracts/`)를 스펙으로 준다. 그래야 같은 함정을 다시 밟지 않는다

AI 피드백 타입은 `services/types.ts`가 아니라 **`services/feedbackTypes.ts`로 분리**했다.
post-sell 응답의 중첩이 깊어 공용 파일이 비대해지고, 병렬 작업 충돌도 피할 수 있다.

## D17. 화면 배치는 "목적이 다른 것을 겹치지 않는다"

처음에 브리핑·뉴스 요약·변동 원인 카드를 전부 거래 화면에 넣었다가 전면 재배치했다.
매매하러 온 사람의 흐름을 끊고, 뉴스를 보려는 사람은 거래 화면에 들어가 종목을 골라야만 볼 수 있었다.

- `/news` — 시장 브리핑 + 종목 칩 선택 → 그 종목의 요약·기사
- `/feedback` — 매도 체결 선택 → 복기
- 거래 화면 — **변동 원인 카드만.** "지금 보는 이 차트가 왜 움직였나"라 차트 바로 아래가 제자리다

포트폴리오 체결 행의 복기 확장은 남겼다. 체결을 보다 바로 여는 경로도 유효하고,
`/feedback`은 "복기만 몰아 보는" 다른 진입점이다.

## D18. 예약분은 서버가 빼 주지 않는다 (지정가 도입의 최대 함정)

`availableCash`·`availableQuantity`를 **서버가 주지 않는 것이 확정 정책**이다.
클라이언트가 `cashBalance - reservedCash`, `quantity - reservedQuantity`로 직접 계산해야 한다.
안 빼면 화면이 실제보다 많은 주문가능액을 표시하고 사용자가 409를 맞는다(실측 확인).

`GET /api/accounts/summary`의 `totalValue`도 `reservedCash`를 빼지 않는다.

## D19. 지정가는 "접수 = 미체결"이 아니다

서버는 생성 시점에 즉시체결을 판정하지 않고 무조건 `PENDING`으로 만든 뒤 다음 가격 틱에서 체결한다.
코인은 시세가 초 단위라 **매수 지정가를 현재가보다 높게 걸면 사실상 즉시 체결**된다.
화면이 "접수됨 · 아직 체결되지 않았습니다"라고 단정하면 몇 초 뒤 목록에서 사라진 것이 버그로 읽힌다.
→ 입력 단계에서 미리 경고하고, 접수 결과에서는 **체결 여부를 단정하지 않는다.**

`Idempotency-Key` 해시 필드 목록이 문서에 없어(MUST-VERIFY) 키를 `limitPrice`까지 종속시키고,
응답의 `limitPrice`·`quantity`를 요청과 대조해 조용한 replay 를 막는다.

## D20. 검증은 "응답이 오는가"가 아니라 "내용이 의미 있는가"다

매도 직후 AI 복기를 처음 검증할 때 응답 200과 필드 존재만 확인하고 통과시켰다.
실제 화면은 "231,000원에 매수해 231,000원에 매도했습니다. 수익률은 -0.03%입니다"가 전부였고
원인 분석이 통째로 비어 있었다. 사용자가 지적해서야 알았다.

원인은 두 가지였다 — **변동 원인 카드 0건**(임계치를 넘는 변동이 없어서. 결함 아님)과
**보유 3초**(매수·매도를 연달아 넣어 보유 구간 자체가 없었다).

→ 데이터 의존 기능은 **의미 있는 값이 나올 조건을 먼저 만들고** 검증한다.
AI 복기는 장중(09:00~15:30)에 수십 분 보유해야 제대로 나온다.

## 이 환경의 운영 지식 (추가분)

### 백엔드 프로파일은 `crypto-real`이다

`bithumb-real`은 존재하지 않는 이름이다(레포 전체에서 0건). 실행 설정은
`local,oauth-real,crypto-real`이어야 코인 실시세가 붙는다. 아니면 `!crypto-real` 분기의 빈 공급자가
활성화돼 코인 현재가가 409이고 **지정가 체결 트리거가 아예 안 돈다.**

장외에 주식을 주문하려면 환경변수 `FINPLAY_DEV_STOCK_FORCE_MARKET_OPEN=true`를 준다.

### 컨테이너는 Spring 이 띄운다

`compose.yaml`에 `spring-boot-docker-compose`가 걸려 있어 **앱을 실행하면 MySQL·Redis 가 자동으로
뜨고 앱을 내리면 같이 정리된다.** `docker compose up` 을 직접 칠 필요가 없다.
포트도 충돌을 피해 매핑돼 있다(MySQL `13307`, Redis `16379`) — 로컬 네이티브 MySQL(3306)과 안 부딪힌다.

WSL 터미널에서 `docker compose`가 소켓을 못 찾는 것은 Docker Desktop 의 WSL 통합이 꺼져 있어서다.
Windows PowerShell 에서는 정상 동작한다.

### 가입 인증번호는 DB 에서 못 읽는다 (해시 저장)

`email_verifications.code_hash`는 `EMAIL_VERIFICATION_SECRET` 기반 **HMAC-SHA-256 hex**다.
평문을 얻을 수 없으므로, 자동화가 필요하면 같은 방식으로 해시를 계산해 행을 덮어쓰거나
사람이 IntelliJ 콘솔에서 읽어 준다. 후자가 낫다.

### React 제어 입력은 `page.type()` 으로 값을 교체할 수 없다

트리플클릭 후 타이핑해도 **기존 값 뒤에 이어붙는다.** 이것 때문에 멀쩡한 즉시체결 경고 로직을
버그로 오판했다. native value setter + `input` 이벤트를 써야 한다.

```js
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }))
```

행 전체가 `<button>`이고 라벨이 그 안의 `<span>`이면 텍스트 일치로 못 찾는다 —
`button[aria-expanded]` 같은 속성으로 잡는다.

---

# 7차 스코프 — 카카오·네이버 OAuth 로그인 연동 (2026-08-12, 이슈 #11)

## 배경

백엔드는 카카오·네이버 OAuth를 이미 구현하고 실계정으로 검증까지 마쳤다(finplay-backend#9·#10·#53,
전부 CLOSED). 배포 환경도 HTTPS 작업이 끝나 OAuth state의 Secure 쿠키가 정상 동작할 조건이 갖춰졌다.
반면 프론트는 이메일/비밀번호 전용이었다 — 4차 해체(`8be748c`)에서 mock `SocialLogin.tsx`가 지워진 뒤
재구현되지 않았다. 상세 조사와 근거는 GitHub 이슈 [#11](https://github.com/finplay-team/finplay-frontend/issues/11) 본문 참조.

## D21. 콜백 응답은 프론트로 리다이렉트하지 않는다 — 프론트 콜백 라우트로 다리를 놓는다

`GET /api/auth/oauth/{provider}/callback`(`OAuthCallbackController.java`)은 브라우저를 프론트로
리다이렉트하지 않고 JSON 을 그대로 200 으로 준다. 백엔드 스펙(`issue-10-plan.md:78`)도 "프론트엔드
성공 페이지나 토큰 전달 방식 변경"을 명시적으로 범위 제외해 뒀다 — 콜백 이후 토큰을 SPA(localStorage)로
넘기는 방식은 프론트 몫으로 남겨진 것이었다.

**결정(사용자 확정).** `KAKAO_REDIRECT_URI`·`NAVER_REDIRECT_URI`를 프론트 라우트(`/oauth/:provider/callback`)로
바꾼다. 카카오/네이버가 그 라우트로 브라우저를 보내면, `pages/OAuthCallback.tsx`가 URL 의 `code`·`state`를
그대로 `GET /api/auth/oauth/{provider}/callback`에 실어 보내고(`authService.exchangeOAuthCallback`),
받은 `TokenResponse`를 기존 `tokenStore.setSession()` 경로로 저장한다. 표준 SPA OAuth 패턴이고
**백엔드 코드 변경이 필요 없다** — 배포 환경변수 값과 카카오/네이버 콘솔의 Redirect URI 등록만 바꾸면 된다.

**cookie Path 스코프를 확인했다.** `oauth_state` 쿠키는 `Path=/api/auth/oauth/{provider}/callback`로
좁게 스코프돼 있다(`issue-9-plan.md:16`). 프론트 콜백 페이지(`/oauth/...`)로의 최초 진입 자체에는
이 쿠키가 실리지 않지만, 그건 필요 없다 — 이후 `OAuthCallback.tsx`가 호출하는
`fetch('/api/auth/oauth/{provider}/callback?...')` 요청은 그 경로와 **정확히 일치**하므로 쿠키가
정상적으로 실린다. 쿠키 Path 매칭은 페이지 주소가 아니라 각 개별 요청의 대상 URL 기준이다.

**provider 값은 소문자.** 백엔드가 대소문자 무관하게 받는다(`issue-9-plan.md:13`). 프론트 라우트·버튼·
서비스 함수는 전부 `'kakao' | 'naver'` 소문자로 통일한다.

## D22. 재발급 배포 설정은 코드와 분리한다

`KAKAO_REDIRECT_URI`·`NAVER_REDIRECT_URI` 환경변수 값 변경과 카카오·네이버 개발자센터 콘솔의
Redirect URI 등록은 **배포/외부 서비스 설정 작업**이라 이 스코프의 코드 작업과 분리했다.
코드는 새 프론트 경로를 전제로 작성해 두고, 설정 변경은 별도로 진행한다(방법은 사용자에게 직접 안내).

**실제 배포 도메인(사용자 확인, Route 53) — `https://finplay.site/`.**
새 Redirect URI는 다음 두 값이다.
- 카카오: `https://finplay.site/oauth/kakao/callback`
- 네이버: `https://finplay.site/oauth/naver/callback`

콘솔 등록값과 `.env`의 `KAKAO_REDIRECT_URI`·`NAVER_REDIRECT_URI`는 글자 하나까지 일치해야 한다
(끝 슬래시 유무·http/https 포함). 기존에 등록돼 있던 백엔드 자체 콜백 URL
(`https://finplay.site/api/auth/oauth/{provider}/callback`, 실계정 스모크 검증 때 쓴 값)은
카카오는 목록에 추가로 남겨 둬도 무방하고, 네이버는 필드가 하나뿐이라 이 값으로 교체해야 한다.

## 작업 내용 (완료 — 2026-08-12, `npm run build` 타입 에러 0·115 모듈 확인)

- `services/types.ts`: `OAuthProvider = 'kakao' | 'naver'` 추가
- `services/authService.ts`: `exchangeOAuthCallback(provider, code, state)` 추가
- `auth/AuthContext.tsx`: `loginWithOAuth(provider, code, state)` 추가 — 기존 `login()`의
  "토큰 저장 → `getMe()` → `setCachedMember`" 흐름을 그대로 재사용
- `pages/OAuthCallback.tsx` 신규 — `code`/`state`/`error` 파싱, 교환 호출, 성공 시 `/trade`,
  실패 시 오류 안내 + `/login` 복귀. StrictMode 이펙트 2회 실행 방어로 `useRef` 가드(코드는 1회용이라
  두 번째 호출이 실패한다)
- `components/SocialLoginButtons.tsx` 신규 — 카카오·네이버 버튼, 클릭 시 `window.location.href`
  전체 페이지 이동(302 흐름이라 `fetch` 불가)
- `pages/Login.tsx`·`pages/Signup.tsx`(1단계)에 버튼 배치
- `lib/errorMessages.ts`: `OAUTH_AUTHORIZATION_FAILED`·`OAUTH_EMAIL_REQUIRED`·`OAUTH_PROVIDER_ERROR`·
  `ACCOUNT_LINK_REQUIRED` 매핑 추가
- `App.tsx`: `/oauth/:provider/callback` 라우트(비보호) + `hideChrome` 조건에 `startsWith('/oauth/')` 추가

# 8차 스코프 — 튜토리얼 대본 사건·진입별 대조 (2026-08-20, 백엔드 #494·#478)

## 배경

백엔드 041(이슈 #488, PR #494)이 코인 튜토리얼의 4막 대본에 **사건 공개**와 **진입별 완료 대조**를
붙였다. 차트·tick 응답에 `scenarioStage`·`scenarioProgressing`·`causeStatus`·`revealedEvents` 4필드가,
진행 조회 최상위에 `entries`·`priceAfterSell`·`revealedEvents` 3필드가 더해졌다. 이 스코프는 그것을
화면에 붙이고, 같이 열려 있던 #478(고정 시나리오 문구 제거)과 모의투자 화면과의 정합을 함께 처리한다.

계약 원문은 finplay 레포 `docs/api-contracts.md`의 "036 튜토리얼 attempt" 절과 "실습 진행 조회
(holding 기준)" 절이다. **필드 규칙과 그 근거가 거기 다 있으므로 추측하지 말고 그것을 읽는다.**

## D23. 사건 패널은 차트 바로 아래에 둔다

오른쪽 패널 탭 추가·전용 컬럼 신설과 비교해 정했다(와이어프레임으로 사용자 확인).

사건은 차트의 움직임을 **설명하는 것**이라 시선이 차트에서 아래로 이어져야 한다. 오른쪽 22fr 컬럼은
주문·되돌아보기 자리라 목적이 다르고(D17), 전용 컬럼을 신설하면 차트가 좁아져 캔들이 눌린다.
마침 #478로 비는 자리가 정확히 차트 카드 아래라 레이아웃 변경 없이 대체된다.

**부각은 위치가 아니라 움직임으로 얻는다** — 새 사건이 위에서 미끄러져 들어오며 잠깐 민트로 물들었다
가라앉는다. 놓치지 않을 만큼만 움직이고 판단을 재촉하지 않는 세기다.

## D24. 완료 결과는 새 모달을 만들지 않고 기존 축하 모달을 키운다

사용자 요청은 "완료 시 전체 폭 요약을 띄우고 X로 닫고 다시 보기로 재열람"이었다. 그대로 새 모달을
만들면 **완료 직후 모달이 두 개 연달아 뜬다** — `CompletionCelebration`이 이미 그 순간에 열린다.
그래서 그 모달을 전체 폭 결과 화면으로 확장한다. 닫기·ESC·바깥 클릭·포커스 되돌리기가 이미 구현돼
있어 그대로 쓴다.

**모달만 두면 안 된다.** 닫은 뒤 다시 찾을 곳이 없으면 결과가 사라진 것처럼 느껴진다. 되돌아보기
탭에 같은 진입 카드를 세로로 남기고 "결과 다시 보기"로 모달을 연다. 카드 컴포넌트 하나를 넓게/좁게
두 모양으로 쓴다.

재방문(REPLAY)에는 **자동으로 열지 않는다** — 매번 축하하면 어색하다는 기존 판단이 이미 코드에 있다.
자동 열림은 최초 완료 순간뿐이고, 다시 열 때는 "축하합니다"를 빼고 결과만 보여준다.

## D25. `FINISHED`는 대본 종료 안내에만 쓰고 보상 판정과 묶지 않는다

인수인계 문서는 "FINISHED에 완료 축하·500만원 화면을 연결하라"고 했지만, 계약 원문의 `FINISHED`는
**대본 종료 알림**이다. 실제 완료와 보상은 여전히 복기 저장(`saveHoldingReflection`)이 확정하고
`rewardAmount`로 내려온다. 둘을 묶으면 보상이 지급되지 않은 재완료에서도 500만원 문구가 뜬다.

**tick 폴링은 FINISHED에서도 멈추지 않는다.** 대화 중에는 멈추자고 했다가 코드를 읽고 바꿨다 — 그
루프는 가격 갱신만 하는 게 아니라 evidence 없이 팔린 사용자의 **유일한 복구 경로**(주기적 관찰 기록)를
겸한다. 멈추면 그 사용자가 빠져나올 길이 사라진다. 화면 문구만 바꾼다.

## D26. 예약 매도 탭은 세우되 비활성으로 둔다

모의투자 화면은 매도 주문유형이 시장가·지정가·예약 매도 세 탭인데 튜토리얼은 두 개다. 실전에 있는
탭이 튜토리얼에 없으면 나중에 처음 마주치게 되므로 자리는 만든다. 다만 **튜토리얼의 손절·익절선은
사용자가 거는 게 아니라 매수 순간 서버가 체결가에서 자동으로 만든다**(TUTORIAL-FLOW-008). 그래서
지금은 누를 수 없고, 비활성 상태에 **이유 한 줄을 반드시 붙인다** — 어둡게만 두면 "왜 안 눌리지"에서
막힌다.

**반짝이는 테두리로 유도하지 않는다.** 2단계는 시장가·지정가가 둘 다 정답이라 반짝일 대상이
정해지지 않고, 그 토글에는 이미 코치마크(`data-tour="order-type"`)가 붙어 있다. 여기에 사건 패널
애니메이션까지 더하면 화면이 동시에 세 곳에서 손짓하게 된다.

## D27. 손익은 서버 값을 그대로 그린다 (재계산 금지)

`realizedPnl`·`unrealizedPnlIfHeld`는 매수·매도 수수료가 모두 반영된 서버 원장 값이다. 단가 × 수량으로
다시 계산하면 어긋난다(백엔드 이슈 #421에서 이미 겪었다). 두 금액은 **`sellQuantity` 기준**이라 부분
매도한 진입에서는 `buyQuantity`와 다르므로 "판 만큼"이라고 적어 오해를 막는다.

`priceAfterSell`은 실습 중에는 현재 대본가, 완료 후에는 이야기 끝 가격이 내려온다. **화면은 어느
쪽인지 판단하지 않고 받은 값을 그대로 쓴다** — 클라이언트가 끝 가격을 추측해 만들면 결말 스포일러가
된다. 대본을 쓰지 않는 실행은 `priceAfterSell`·`unrealizedPnlIfHeld`가 `null`이라 그 칸을 통째로 뺀다.

## D28. 튜토리얼 "주문가능 현금" 박스는 지금 붙이지 않는다

모의투자 화면에는 주문 폼 안에 주문가능 현금 박스가 있고 튜토리얼에는 없다. 백엔드가
`tutorialAvailableCash`를 주기는 하는데, 계약상 **진입(`PUT .../attempts/{market}`)과 재시작
응답에서만 실제 값을 채우고 나머지 호출부는 전부 `0`을 반환한다.** 그래서 지금 붙이면 매수 뒤에도
갱신되지 않는 잔액을 보여주게 된다 — 틀린 잔액을 보여주느니 안 보여주는 게 낫다. 백엔드에 이슈로
넘긴다.

## 사건 문구에 대한 제약 (어기면 기능이 무의미해진다)

- `causeStatus`는 `REVEALED`·`NONE_KNOWN` 둘뿐이고 **구분해 보여주면 안 된다.** "아직 안 밝혀졌다"와
  "원래 없다"를 다르게 그리면 "곧 뉴스가 뜬다"는 신호가 되어 이 기능이 막으려던 스포일러가 된다.
  2막의 속임수 반등이 여기 해당하고, **원인 없이 잠깐 오르는 것을 그대로 보여주는 게 그 구간의
  교육 목적**이다. "저가 매수세 유입" 같은 문구를 임의로 붙이지 않는다.
- `scenarioStage`가 ACT2로 고정된 채 `causeStatus`가 REVEALED → NONE_KNOWN → REVEALED로 두 번 바뀌는
  구간이 실제로 있다. 버그가 아니다.
- 사건에는 **시각이 없다.** 서버의 이야기 시계와 화면 시계가 다른 시계라 숫자를 주면 틀린다. 배열
  순서가 공개 순서이고 마지막 항목이 가장 최근이다. "방금"·"조금 전"으로만 쓴다.
- `headline`의 `[연습]` 접두를 떼지 않는다. 캡처해 밖으로 나가도 가상 사건임이 문구에 남아야 한다.
- **서버는 잘잘못을 판정하지 않으므로 화면도 하지 않는다.** "조금만 더 기다리셨다면" 같은 유도 문구를
  붙이지 않는다. 익절 직후 잠깐 "안 팔았으면 더 벌었다"가 뜨는 구간이 실제로 있는데 그대로 둔다.
- **매수하면 다음 tick 응답에서 곧바로 진행 구간으로 바뀐다**(백엔드 커밋 `0af28fb`에서 고침).
  화면에서 낙관적으로 덮어쓰거나 한 틱을 무시하는 보정을 넣지 않는다. 배포 후에도 한 틱 지연이
  보이면 프론트에서 덮을 문제가 아니라 백엔드 회귀다.

## 모의투자 화면과 벌어진 곳 (2026-08-20 실측)

모의투자 화면은 2026-08-19 피드백 반영이 몰려 들어갔고 튜토리얼은 그 전 모양에 멈춰 있다.
확인 당시 열린 PR은 없었고 로컬 브랜치도 전부 main에 들어가 있어, main이 모의투자 화면의 최종본이다.

- 매도 주문유형 — 실전 3탭(시장가·지정가·예약 매도) / 튜토리얼 2탭 → D26으로 처리
- 코인 시장가 매수 — 실전은 **금액**으로 사고 튜토리얼은 **수량**으로 산다. 실제 빗썸이 금액이라
  실전을 맞춘 것인데, 튜토리얼에서 수량으로 배우면 실전에서 다시 헤맨다 → 이번에 맞춘다
- 주문가능 현금 박스 — 실전에만 있다 → D28로 보류
- 차트 박스 안 "차트 / 변동 원인" 탭 — 실전에만 있다. **튜토리얼에는 만들지 않는다** — 그 자리를
  사건 패널이 대신하고, 실전의 변동 원인은 실제 뉴스라 성격이 다르다
- 오른쪽 컬럼 탭 — 실전 "주문 / 커뮤니티" / 튜토리얼 "주문 / 되돌아보기". 성격이 달라 그대로 둔다
- 미체결 지정가 — 실전은 팝업, 튜토리얼은 카드. 모양이 다르지만 기능은 같아 이번 범위 밖

# 9차 스코프 — 브라우저 실사용 피드백 4건 (2026-08-20, 사용자 확인)

8차로 붙인 화면을 사용자가 5173 포트에서 직접 확인하고 넘긴 피드백 4건. 1·3·4번은 이 세션에서
바로 처리했고, 2번(시장가/지정가를 별도 단계로 나누기)은 spec이 없어 백엔드부터 정리해야 한다.

## D29. 손절·익절 프리셋(042, 이슈 #477)을 프론트에 연결했다

8차에서 "다음에 하자"고 미뤘던 항목이다. 사용자가 3번으로 지적한 "3단계(익절/손절 배워보기)가
빠졌다"의 실체가 이것이었다 — 매수 순간 서버가 자동으로 만드는 기준선을 설명만 하고 고르는 자리가
없었는데, 백엔드는 이미 3개 프리셋(조심스럽게 −2%/+3% · 보통 −3%/+5% · 느긋하게 −5%/+8%)과 선택
API(`PUT .../exit-preset`)를 갖고 있었다.

- `tutorialTypes.ts` — `PracticeExitPreset`을 `PracticeRiskSnapshotResponse`보다 앞으로 옮기고,
  `PracticeExitPresetOption` 신설. `PracticeRiskSnapshotResponse`에 `exitPreset`·`stopLossRate`·
  `takeProfitRate`·`entrySequence`, `PracticeAttemptResponse`에 `tutorialCashBalance`·
  `tutorialAvailableCash`·`tutorialRealizedPnl`·`selectedExitPreset`·`exitPresetLocked`·
  `availableExitPresets` 추가 — 계약에는 있었는데 프론트 타입이 낡아 있었다.
- `tutorialService.ts` — `selectExitPreset(market, preset)` 추가.
- `AttemptTutorialFlow.tsx` — 2단계(매수 전)에 `ExitPresetPicker` 신설. 고정 `STOP_LOSS_RATE=-0.03`·
  `TAKE_PROFIT_RATE=0.05` 상수를 걷어내고 `presetRateLabels()`로 선택된 프리셋의 실제 비율을 쓴다 —
  매수 전 어림(`BuyRiskPreviewLine`), 매수 후 확정 기준선 카드(`RiskEducationCard`), 차트
  `referenceLines` 라벨 셋 다 동적으로 바뀐다. "왜 −3%와 +5%인가요" 문단도 실제 비율·손익분기 승률로
  계산해 다시 쓴다.
- **`exitPresetLocked`는 이 UI에서 지금 관측 불가능하다.** 잠금은 "보유 중"을 기준으로 하는데, 이
  화면은 재진입 UI가 없어 프리셋 픽커가 보이는 동안(`riskSnapshot === null`)은 항상 미보유 상태다 —
  `locked` 처리는 서버 계약을 존중하는 방어 코드로 남기되, 통합 테스트로 검증할 수 없어 뺐다.
- **실제 백엔드로 검증함**(로컬 `finplay_verify` DB, 5173 dev 서버) — 조심스럽게를 눌러
  `PUT .../exit-preset` 실호출 → 응답으로 픽커 활성 상태와 매수 전 어림 문구가 즉시 바뀌는 것을
  DOM에서 직접 확인했다.

## D30. 사건 패널 위치 + "안내 다시 보기" 축소

- **사건 패널**을 별도 카드로 차트 카드 아래에 두던 것을 걷고, 차트 카드 **안, 차트 요약 바로
  아래·캔들 설명 아코디언 위**로 옮겼다(`ScenarioEventPanel`에서 `<Card>` 래퍼를 빼고 위쪽 구분선
  하나로 절만 가른다). 캔들 설명 아코디언이 기본값 열림(`useState(true)`)이라 그 아래에 있으면
  스크롤해야 보였다 — 순서를 바꾼 것만으로 스크롤 없이 보인다(실측).
- **상단 안내 문단**(`pages/Tutorial.tsx`)에서 "손절선·익절선이 자동으로 그려진다"는 문장을 뺐다 —
  2단계 안내 문구·매수 후 "내가 팔 기준선" 카드가 같은 말을 이미 하고 있어 셋이 겹쳤다. "실제 돈이
  아니다"·보상 금액처럼 그 자리에서만 하는 말은 남겼다. 헤더가 `shrink-0`(스크롤 영역 밖)이라
  줄어든 만큼 아래 3컬럼이 볼 수 있는 높이가 늘었다.
- **"안내 다시 보기"**를 글자 버튼에서 물음표 아이콘 버튼(28×28, `aria-label="안내 다시 보기"`)으로
  줄였다. "처음부터 다시 시작"과 나란히 같은 무게로 있으면 진행을 되돌리는 동작이 가벼워 보인다는
  것이 이유였다 — 접근성 이름은 그대로라 기존 테스트는 셀렉터를 바꾸지 않고도 통과한다.

## 2번 — 시장가/지정가를 별도 단계로 나누는 것은 spec부터

인수인계 문서·`docs/prd.md`·`docs/specs/039-tutorial-flow-redesign` 어디에도 "2단계=시장가,
2-2단계=지정가"로 나누는 시나리오가 없다. 지금 둘 다 처음부터 열려 있는 것은 구현이 어긴 게 아니라
애초에 정해진 적이 없어서다. 이 화면은 서버(`steps[].locked`)가 단계 판정의 정본이므로, 프론트에서만
지정가를 잠그면 새로고침 한 번에 뚫리고 서버·화면의 단계 인식이 어긋난다. **spec을 먼저 쓰고 백엔드에
단계 개념을 추가하는 순서가 필요하다** — 이번 세션 범위 밖으로 남긴다.

## D31. 프리셋 픽커는 최종 배치가 아니다 — 게이트형 3단계가 확정되면 다시 옮긴다

D29에서 2단계 매수 폼 안에 프리셋 픽커를 끼워 넣은 것은 임시 배치다. 사용자가 이후 화면을 직접
보고 "2단계=시장가/지정가 체험, 3단계=손절익절 체험"으로 **진짜 단계를 잠그는 구조**를 원한다고
확정했다(2026-08-20). 이건 프론트만으로 끝낼 수 없다 — `docs/prd.md`·모든 spec에 이런 3단계 분리가
정의된 적이 없고, 서버가 단계를 판정해야 새로고침에도 어긋나지 않는데 지금 `steps[]`는 이 구분을
모른다. 열린 질문·필요한 계약은 `checklist.md` 9차 D에 적어 뒀다.

**지금 만든 `ExitPresetPicker`·`selectExitPreset`는 버리는 작업이 아니다** — spec이 나오면 그대로
새 3단계 자리로 옮겨 재사용한다. 매수 폼 안에 있는 지금 위치만 임시다.

## D32. 코인 매수 폼을 모의투자 화면과 맞추되, 잔액 없이 맞출 수 있는 것만 맞췄다

실전 화면(`pages/Trade.tsx`)과 나란히 비교한 사용자 피드백으로 라벨("주문 금액")·placeholder("최소
금액 ~원")·"예상 매수"(수량+심볼) 문구를 그대로 맞췄다. **"주문 가능" 잔액과 10/25/50/75/최대
퍼센트 버튼은 만들지 않았다** — 튜토리얼 계좌 잔액이 종목 선택(`PUT .../instrument`) 이후 0으로
죽어 있어(TUTORIAL-CASH-ISOL-011) 정확한 "최대"를 계산할 방법이 없다. 잘못된 잔액으로 버튼을
만드느니 안 만드는 게 낫다는 원칙(D28과 같음)을 그대로 따랐다. `docs/backend-issues.md` E-1로
정식 등록했다.

## D33. 백엔드 이슈 두 건을 `docs/backend-issues.md`에 등록했다 (E-1·E-2)

이 문서는 원래 계약 결함을 spec과 대조해 adversarial 재검증까지 거친 뒤에만 올리는 문서다
(2026-08-08 검증 결과 참고). E-1·E-2는 **그 재검증 절차를 거치지 않았다** — 그렇게 문서에도
명시했다. 이번 세션에서 실제로 관찰한 사실(계약 문서 원문, 실제 에러 로그)만 적었고, 백엔드에서
한 번 더 확인해야 한다.

- **E-1** — 튜토리얼 계좌 잔액이 `PUT .../instrument` 이후 0으로 온다(D28·D32와 같은 근거).
- **E-2** — 로컬 검증 중 `practice_attempts` 잠금이 재시작·tick 동시 진행에서 데드락 8~32회 관측.
  실제 로그(`LockAcquisitionException`)는 있지만 **잠금 순서가 왜 역전되는지는 코드를 봐야
  안다** — 추측이라고 문서에 명시했다. 사용자가 "백엔드가 알아서 할 문제"라고 이미 확인했다.

## D34. "재진입은 이미 백엔드가 지원한다"는 절반만 맞았다 — evidence 체인은 별개 시스템이다

D31에서 게이트형 3단계로 가기로 한 뒤, 사용자에게 "재진입 자체는 이미 백엔드가 지원한다"고
답했다. `entrySequence`·`exitPresetLocked`(실제 순보유수량 재계산)를 근거로 든 것은 맞지만,
그건 **042(손절익절 프리셋) 쪽 절반만 본 것이었다.**

`docs/api-contracts.md`의 "3단계 가격 관찰·복기(holding 기준, 026)" 절이 쓰는
`MarketPracticeChainResolutionService`는 **042보다 오래된 026 스펙**의 시스템이고, 즐겨찾기→
매수의도→매수→보유로 이어지는 **하나의 chain**을 골라 쓴다. `entrySequence`를 전혀 참조하지
않는다. 재진입으로 holding이 두 번째로 생기면:
- 관찰(`POST /education/practice/holding-observations`)이 그 두 번째 holding을 향하는지,
- 복기(`POST /education/practice/holding-reflections`)가 첫 holding에 묶인 채로 남는지,

**확인된 바가 없다.** 이걸 안 보고 재진입 UI(다시 사기 버튼·`orderSide` 판정)를 프론트에서
만들면, 짐작이 틀렸을 때 실제 사용자의 완료 처리가 조용히 깨진다 — 관찰 없이 완료되거나, 두
번째 진입의 복기가 저장 안 되거나 하는 식으로. 그래서 이 세션은 **재진입 UI를 만들지 않았다.**
이건 앞서 D33에서 낸 결론(재진입 인프라는 이미 있고 작은 것만 남았다)을 좁힌 정정이다.

**다음 프론트 세션이 할 일**은 checklist.md 9차 D에 있다 — 백엔드가 evidence 체인의 재진입
동작을 확인·필요하면 손보고, 진입별 주문유형 필드·순서 강제 규칙을 추가한 뒤에 시작한다.
백엔드 세션에 넘길 프롬프트는 `docs/backend-handoff-2026-08-20.md`에 있다.

## D35. 사건 피드를 왼쪽 컬럼으로 옮기고 속보 자막을 달았다 — 이미지는 두 가지로만 좁혀서

사용자가 실제 스크린샷에 손그림으로 두 가지를 지적했다 — "지금 무슨 일이"가 여전히 스크롤해야
보인다는 것과, 뉴스에 이미지가 있으면 좋겠다는 것. 두 차례 목업(claude.ai 아티팩트)으로 방향을
맞춘 뒤 구현했다.

**배치.** 이 화면은 종목을 늘 하나만 보여주므로 왼쪽 목록 카드 아래는 원래 항상 비어 있었다.
차트 컬럼은 캔들 자체가 세로 공간을 많이 먹어 그 안에 사건 목록을 두면(9차 D30) 낮은 화면에서
다시 스크롤 밖으로 밀렸다. 그래서 전체 목록(`ScenarioEventFeed`)을 왼쪽 컬럼으로 옮기고, 차트
컬럼에는 압축 상태 줄(`ScenarioStatusLine`, "진행 중 · 원인 밝혀짐 ← 왼쪽에서 소식 확인")만
남겼다.

**이미지 — 새 사실을 지어내지 않는 두 가지로 좁혔다.** 사용자는 "알파코인 이미지"·"협상 중인
이미지"를 요청했는데, 서버가 `headline` 한 줄과 `stage`만 주고 이미지·본문 필드가 없다는 제약은
그대로다(9차 D 경고). 그래서:
- **종목 아바타** — 이름 첫 글자 + 시장 액센트색 원형(실제 사진 아님). 이 화면은 종목이 늘
  하나라 "구분" 용도가 아니라 "이 종목 소식"이라는 시각적 닻이다.
- **상황 아이콘** — 헤드라인 문장 안에 **실제로 있는 단어**로 고른다(`categoryIcon`,
  `ScenarioEventPanel.tsx`). "협상·논의"면 Handshake, "가동 중단"이면 Warning, 등등. 못 찾으면
  중립 아이콘(Newspaper)으로 떨어져 없는 사실을 암시하지 않는다.
- 실제 백엔드로 검증함 — 서버가 준 진짜 헤드라인("...논의가 진행 중...")이 Handshake 아이콘으로
  정확히 매칭되는 것을 DOM에서 직접 확인했다.

**속보 자막.** 사용자는 처음에 "제자리에서 스르륵 나타났다 사라지는" 안을 보여줬을 때 "아니다,
자막처럼 왼쪽에서 나와 오른쪽으로 흘러가야 한다"고 정정했다. `BreakingNewsCrawl.tsx`는 Web
Animations API로 실제 트랙·글자 폭을 재 이동 거리를 계산하므로 문장 길이와 무관하게 화면을
완전히 가로지르고 속도(픽셀/초)가 고정이다. **3초 tick마다가 아니라 `revealedEvents`가 실제로
늘어난 순간에만** 흐른다 — 그렇지 않으면 금방 성가셔진다는 사용자 지적을 그대로 반영했다.

**jsdom이 `Element.animate`를 구현하지 않는다.** 프로덕션 코드(모든 실제 브라우저가 지원)에는
방어 분기를 넣지 않고, `test/setup.ts`에 테스트 전용 스텁만 추가했다 — 실제로 없는 문제에
방어 코드를 넣지 않는다는 원칙을 지켰다. `window.matchMedia`도 jsdom에 없어(기존
`prefersReducedMotion()` 관례상 "줄이는 쪽"으로 떨어진다) 자막의 정상 재생 경로를 테스트하려면
`matchMedia`를 `matches:false`로 명시적으로 mock해야 한다 — 안 하면 항상 reduced-motion 경로를
타서 테스트가 3.2초 hold를 기다리게 된다(실제로 한 번 이 실수로 테스트가 타임아웃났다).

**한계.** 이 세션의 브라우저 패널이 `document.hidden=true`로 고정돼 있어(원인 불명, 세션
환경 제약으로 보임) 앱 자체의 tick 폴링이 안 돈다. 그래서 속보 자막이 실제로 화면에서 흐르는
걸 육안으로는 확인하지 못했다 — 대신 단위 테스트 6개로 트리거 조건(events 개수가 늘 때만·같은
배열 재전달은 무시·여러 건이 한꺼번에 늘어도 마지막 하나만)과 표시·소멸을 직접 검증했다.
사용자가 실제 브라우저에서 한 번 확인해 주는 게 좋다.

# 백엔드 9차 후속 — 이슈 #502·#503·#491 처리 결과 (2026-08-20, 백엔드 세션이 기록)

## D35. "evidence 체인이 재진입을 모른다"는 전제가 틀렸다 — 재진입 UI를 막을 이유가 없다

D34가 "확인된 바가 없다"고 유보한 항목을 백엔드에서 코드로 확인했다. **결론은 유보를 풀어도
된다는 것이고, 그 이유는 D34가 걱정한 상황이 애초에 일어나지 않기 때문이다.**

**1. 재진입해도 두 번째 holding은 생기지 않는다.** `V10__create_order_ledger_tables.sql`의
`uk_holdings_account_instrument UNIQUE (account_id, instrument_id)` 때문에 계좌·종목당 보유 행은
하나뿐이다. 손절당했다가 다시 사면 같은 행의 수량이 다시 채워질 뿐이다. D34가 "두 번째 holding이
생기면"으로 시작한 시나리오 자체가 성립하지 않는다.

**2. 샌드박스 attempt는 `MarketPracticeChainResolutionService`를 아예 타지 않는다.**
`PracticeHoldingObservationService`가 `holding.getInstrument().isTutorialSample()`로 먼저 갈라
`createAttemptObservation` → `PracticeAttemptEvidenceService.requireCurrentRun`으로 간다. D34가
지목한 026 chain 해석은 **attempt가 없는 legacy 사용자용 폴백**이다. 튜토리얼 사용자는 그 코드에
닿지 않는다.

**3. 그 경로는 `entrySequence`를 이미 안다.** `requireCurrentRun`이 기준선을 두 개 잡는다 —
화면 표시·매수 evidence 검증에는 **최신 진입** snapshot을, **관찰 필터 기준선에는 첫 진입**
snapshot(`PracticeRiskSnapshot.FIRST_ENTRY_SEQUENCE`)을 쓴다. 소스 주석이 이유까지 적어 뒀다.
"이 자리에 최신 진입을 쓰면 재매수 순간 이전 관찰이 사라진다." 즉 **재진입에 관찰이 날아가지
않는 것은 우연이 아니라 그렇게 만든 것이다**(041 SCENARIO-019a).

**4. 통합 테스트가 그 흐름을 실제로 완주한다.** `PracticeScenarioFullJourneyIntegrationTest`
(PR #494)가 매수 → 관찰 3건 → 손절 → 재매수 → 익절 → 복기 → 완료를 실제 MySQL로 한 번에 돌리고,
완료 응답의 3단계가 `COMPLETED`인지까지 확인한다 — 관찰 evidence가 재매수를 건너 살아남지 않았다면
복기가 409로 막혔을 것이다.

**따라서 프론트는 재진입 UI를 지어도 된다.** D34의 유보는 여기서 해제한다. 다만 이건 "재진입이
안전하다"까지이고, **게이트 강제(잘못된 순서 거부)는 아직 없다** — 아래 D36을 보라.

## D36. 게이트는 "판정"과 "강제"로 나뉘었고, 지금 온 것은 판정뿐이다

checklist 9차 D의 백엔드 항목 2번("순서를 강제하는 실제 검증 규칙")은 **의도적으로 나눴다.**

- **판정(서버가 알려준다)** — 이번에 들어왔다. `GET /api/education/practice` 응답의
  `tutorialStageProgress`가 그 실행에서 각 단계를 실제로 마쳤는지 알려준다. 프론트는 이 값으로
  잠금 UI를 그리면 되고, **새로고침해도 서버가 다시 판정하므로 날아가지 않는다.**
- **강제(서버가 거부한다)** — 아직 없다. 주문 생성 경로에 새 검증을 넣는 일이라 spec이 필요하다.
  사용자가 API를 직접 불러 순서를 건너뛸 수는 있지만 **이건 보안이 아니라 학습 순서**라 지금은
  문제가 되지 않는다는 판단이다.

D34가 "프론트가 로컬로 판단하면 새로고침 한 번에 뚫린다"고 쓴 걱정은 **판정만으로 해소된다** —
프론트는 로컬로 판단하지 않고 서버 값을 그리기만 하면 된다.

## D37. 잔액 3필드는 이제 쓰기 경로 네 곳에서 실값으로 온다 (E-1 해소)

E-1은 "종목 선택 응답에서 잔액이 0"이었고, 원인은 잔고가 0이어서가 아니라 **그 응답이 튜토리얼
계좌를 조회하지 않았기** 때문이었다. 계좌 자체는 진입 시점에 이미 1000만원으로 만들어져 있었다.

이제 `PracticeAttemptResponse`를 돌려주는 **쓰기 경로 네 곳이 모두 실값**을 싣는다.

| 호출 | `tutorialCashBalance`·`tutorialAvailableCash`·`tutorialRealizedPnl` |
|---|---|
| `PUT /api/education/practice/attempts/{market}` (진입) | 실값 (전부터) |
| `POST .../attempts/{market}/restart` (재시작) | 실값 (전부터) |
| `PUT .../attempts/{market}/instrument` (종목 선택) | **실값 (이번에)** |
| `PUT .../attempts/{market}/exit-preset` (프리셋 선택) | **실값 (이번에)** |
| `GET /api/education/practice`의 `attempt` 필드 | **여전히 `0`** |

**마지막 줄이 중요하다.** 진행 조회는 tick과 함께 폴링되는 경로라 호출마다 계좌를 다시 읽지
않기로 했다. 그 `0`은 "잔고가 0"이 아니라 "이 응답은 계좌를 조회하지 않았다"는 뜻이다 —
**잔액이 필요한 화면은 위 네 응답의 값을 들고 있어야 하고, 진행 조회 응답의 그 세 필드로
잔액 박스를 그리면 안 된다.** 9차 E의 "주문 가능 잔액·퍼센트 버튼"은 이제 막힌 곳이 없다.

## D38. E-2(데드락)는 원인 미확정이라 고치지 않았다 — 조사 결과만 이슈에 남겼다

백엔드 이슈 #491의 범위를 "진입 동시 호출"에서 "`practice_attempts` 잠금 경로 전반"으로 넓히고,
재시작·tick 조합을 재현 경로로 등록했다. 로컬 MySQL 8.4로 잠금을 실측한 결과 **이슈가 추정한
메커니즘(S 잠금을 잡은 채 X로 승격)만으로는 교착이 만들어지지 않았다** — InnoDB가 이미 잠금을
가진 트랜잭션의 승격 요청을 대기열 앞에 넣어 준다. 잠금 순서도 전수로 훑었고 모든 경로가
attempt를 가장 먼저 잠근다(ABBA 없음).

**교착 쌍을 특정하지 못했으므로 추측으로 고치지 않았다.** 다음 수순(MySQL의
`innodb_print_all_deadlocks`를 켜고 재현 대기)은 #491 코멘트에 적었다.

**프론트가 지금 할 수 있는 완화**는 그대로다 — 재시작 요청 중에는 tick 폴링을 멈추고, 500이
오면 사용자에게 재시도 버튼을 준다. 서버가 고쳐지기 전까지 이게 화면을 지키는 유일한 방법이다.

## D38 정정 — #521이 교착 쌍을 특정했다. S→X 승격이 맞았고, 진입 경로는 고쳐졌다

D38 원문은 지우지 않는다. 그때 실측으로 내린 판단이고, **왜 반대 결론이 나왔는지가 이 정정의
핵심**이라 원문이 남아 있어야 대조가 된다.

**D38이 틀린 부분.** "S 잠금을 잡은 채 X로 승격하는 메커니즘만으로는 교착이 만들어지지 않는다"는
결론은 틀렸다. 백엔드가 실제 서비스 경로로 재현한 뒤 `SHOW ENGINE INNODB STATUS`를 떠서 교착 쌍을
특정했다 — **두 트랜잭션이 `uk_practice_attempts_user_market`의 같은 레코드에 `lock mode S`를 쥔 채
서로 `lock_mode X locks rec but not gap`을 기다린다.** 이슈 본문의 추정이 정확히 맞았다.

**왜 D38의 실측에서는 안 나왔나.** 실험 설계가 달랐다. D38은 TX1만 `INSERT IGNORE`를 하고 TX2는
`SELECT ... FOR UPDATE`만 했다 — **S를 쥔 트랜잭션이 하나뿐이라 애초에 순환이 성립할 수 없는
구성**이다. 교착에는 양쪽이 다 S를 쥐어야 하는데, 실제 진입 요청은 둘 다 `INSERT IGNORE`를 거치므로
그 조건이 만들어진다. "InnoDB가 이미 잠금을 가진 트랜잭션의 승격을 대기열 앞에 넣어 준다"는 관찰
자체는 맞지만, 그건 **경쟁자가 없을 때** 얘기다.

**D38이 맞은 부분.** 잠금 순서 전수 조사("모든 경로가 attempt를 가장 먼저 잠근다, ABBA 없음")는
백엔드가 독립적으로 다시 훑어 같은 결론을 얻었다. 그 표는 계속 유효하다.

**재시작 ↔ tick은 여전히 재현되지 않았다.** 백엔드가 세 형태(재시작↔tick, 진입↔재시작↔tick,
사용자 간 교차)를 각 8라운드씩 생성기 버전 1·2 양쪽으로 돌렸는데 **수정 전 코드에서도 24라운드
전부 통과**했다. 우리가 8~32회 관측한 그 교착은 **진입 교착이었을 가능성이 높다** — 튜토리얼 화면은
마운트할 때 진입을 부르고 재시작 직후에도 다시 부르므로, 눈에는 "재시작하다 터졌다"로 보이지만
실제로 겹친 것은 진입 두 건이다. 이슈 본문에 붙은 두 스택이 모두 `ensureAttempt`를 가리킨다는 것도
이 해석과 맞는다. 다만 이건 추론이고 교착 쌍을 직접 본 것은 아니다.

**프론트 완화는 이제 필수가 아니다.** 서버가 진입 경로의 원인을 제거했고(잠금 조회를 INSERT보다
앞으로), 그래도 남는 교착은 **진입·재시작·tick 세 경로 모두 1회 재시도**한다. 재시작 중 tick 폴링을
멈추는 것은 여전히 불필요한 요청을 줄이는 좋은 습관이라 유지할 만하지만, **"서버가 고쳐지기 전까지의
유일한 방법"이라는 D38의 서술은 더 이상 맞지 않는다.** 500 재시도 버튼도 이제 마지막 방어선이지
상시 대비책이 아니다.

근거: 백엔드 PR #521, 이슈 #491.

# 백엔드 PR #505 반영 — 잔액·2단계 판정·재진입 (2026-08-20, docs/handoff-from-backend-505.md)

## D39. `GET .../practice`의 죽은 잔액이 폴링 한 번에 실제 잔액을 지우는 실제 버그를 잡았다

D37이 "잔액은 쓰기 응답 네 곳에서 받아 상태로 들고 있어라"고 경고했는데, `Tutorial.tsx`를 다시
읽어 보니 **그 경고가 이미 뚫려 있었다.** `loadMarket`은 `progress.attempt ?? ensured`로 진행
조회(GET) 쪽을 우선했고, `refreshMarket`(자식의 tick·매수 새로고침이 매번 부르는 경로)은
`progress.attempt`를 조건 없이 그대로 `attempts` 상태에 덮어썼다 — 즉 **종목 선택·프리셋
선택으로 잔액이 한 번 실값이 돼도, 다음 tick(3초 뒤) 폴링에서 바로 0으로 돌아갔을 것이다.**
9차 E가 "잔액을 아직 못 붙인다"고 유보했을 때는 문제가 안 됐지만, 이번에 퍼센트 버튼을 실제로
붙이면서 이 경로를 처음 타 보니 바로 드러났다.

고친 방법 — 잔액 세 필드만 별도 상태(`balances`, market별)로 떼어, **쓰기 응답 네 곳
(`ensurePracticeAttempt`·`restartPracticeAttempt`·`selectPracticeInstrument`·`selectExitPreset`)
에서만 갱신한다.** `refreshMarket`은 `useRef`로 최신 `balances`를 읽어 `progress.attempt`의
다른 필드(status·riskSnapshot 등, 이건 GET도 최신값을 준다)에 덮어씌운다 — 관찰 tick의
`observeStateRef`와 같은 패턴이다. `Tutorial.test.tsx`에 회귀 테스트를 추가했다 — GET이 잔액을
0으로 내려줘도 자식이 "진행만 새로고침"을 눌렀을 때 마지막으로 안 실제 잔액이 유지되는지 확인한다.

## D40. `panelTab` 자동 전환에 경쟁 상태가 있었다 — 재진입 테스트가 잡았다

재진입 UI를 "차트가 IDLE_REENTRY면 되돌아보기로 넘기지 않는다"로만 구현했더니 새 테스트가
바로 깨졌다. 원인 — `scenarioStage`는 `chart` state(비동기로 늦게 옴)에서 나오는데, **마운트
직후 첫 렌더는 `chart === null`이라 `awaitingReentry`가 잠깐 `false`로 계산된다.** evidence는
이미 `fullySold=true`라, 그 찰나에 `reviewReady`가 `true`로 잡혀 `useEffect`가 곧바로
`setPanelTab('review')`를 불러 버린다. 그 뒤 차트가 도착해 `awaitingReentry`가 `true`로
바뀌어도, 기존 effect는 `reviewReady`가 `true`일 때만 반응해 **`review`에서 되돌리는 코드가
없었다** — 되돌아보기 탭 버튼은 다시 잠기는데(disabled) 내용은 이미 복기 폼으로 넘어간 채
갇힌다.

고친 방법 — effect를 양방향으로 만들었다: `reviewReady`면 `review`로, 아니면서
`awaitingReentry`면 명시적으로 `order`로 되돌린다. **테스트를 먼저 쓰고 실행해서 잡은 버그다**
— 코드만 보고는 "이 정도는 괜찮겠지"로 넘어갔을 자리였다.

## D41. 백엔드 회신 3건 — 답은 `docs/frontend-reply-505.md`

문서 §2가 요구한 세 결정(2단계 게이팅 범위·전환 호출 주체·`ORDER_BASICS` 표시)에 대한 답을
별도 문서로 정리했다 — 다음에 이 세션을 이어받을 백엔드 세션에 그 파일 경로만 넘기면 된다.
결정 근거는 전부 **이 코드베이스에 이미 있는 관례**에서 뽑았다(예약 매도 탭을 숨기지 않고
비활성+이유로 두는 관례, 되돌릴 수 없는 동작은 항상 사용자 버튼을 거치는 관례) — 새 규칙을
지어내지 않았다.

## D42. `tutorialStageProgress` 체크리스트는 지금은 정보용이다 — 강제는 spec 049 몫

문서 §3이 "순서 강제(409)는 아직 없다"고 명시했고, 그 판단은 spec 049(2단계 분리) 몫으로
남아 있다. 그래서 이번 체크리스트(`StageProgressChecklist`)는 **아무것도 잠그지 않는다** —
서버 판정 세 개를 칩으로 보여주기만 한다. 순서를 실제로 막는 UI(예: 프리셋을 고르기 전엔
매수 버튼을 잠근다)를 지금 만들면, spec 049가 정할 실제 게이팅 규칙과 미리 어긋날 위험이
있어 손대지 않았다.

## D43. 손절·익절선은 실제로 자동 체결된다 — 화면 문구 두 곳이 반대로 적혀 있었다 (2026-08-20 실사용 중 발견)

사용자가 "시장가에 샀는데 갑자기 알아서 팔렸다"고 보고해 백엔드 코드를 직접 확인했다.
`PracticeOrderSettlementService.settleCurrentRun`이 041 tick마다
`exitPlanRepository.findPendingPracticeRunExitPlanIds`로 그 실행 세대의 OCO 예약(손절·익절)을
찾아 `exitPlanFillService.fillIfPending`으로 자동 체결한다 — 매수 순간 이 예약이 함께 생기고
(`ExitPlanCreationService`), 이건 코인·주식 공통이다(`settleCurrentRun`은 market을 가리지 않는다).

그런데 화면에는 정반대로 적혀 있었다.

- 매수 전 카드: "손절선은 값이 이만큼 떨어지면 더 잃지 않도록 **팔라고 알려주는 선**" —
  마치 사용자가 직접 눌러야 파는 것처럼 읽힌다.
- 매수 후 카드(`RiskEducationCard`): "**이 선에 닿아도 자동으로 팔리지는 않습니다.** 팔지
  말지는 직접 정하세요." — 실제 동작과 완전히 반대다.

둘 다 "값이 이 선에 닿으면 그 순간 자동으로 팔립니다"로 고쳤다. 이 문구가 언제부터 틀렸는지는
모른다 — 042(OCO 손절·익절)가 이 카드보다 나중에 들어왔을 가능성이 높지만 git blame으로
확인하지는 않았다.

**부수적으로 발견한 것** — `tutorialStageProgress.marketBuySellCompleted`는 "사용자가 낸"
시장가 매도만 세고 자동 청산은 안 센다는 게 문서 §1에 이미 명시돼 있었는데(의도된 동작),
화면 어디에도 그 이유를 설명하는 문구가 없어 "손절당했는데 왜 체크리스트가 안 넘어가나"로
막히는 게 그대로 재현됐다. `StageProgressChecklist`에 `autoStoppedThisRun` 조건(이 실행에
`sellCause`가 `STOP_LOSS`·`TAKE_PROFIT`인 진입이 있는가)을 추가해, 미완료 상태에서만 이유를
한 줄 붙였다.

## D44. `awaitingReentry`를 `=== 'IDLE_REENTRY'`로만 판정한 게 진짜 버그였다 — D43 문구 수정 직후 실사용에서 확인

D43에서 자동 손절이 실제 동작임을 확인한 뒤 사용자가 곧바로 재현했다 — "시장가 매도가 지 알아서
되고 4단계까지만 되고 끝난다." 원인은 D35에서 만든 `awaitingReentry`가 `scenarioStage ===
'IDLE_REENTRY'`로만 좁게 판정했던 것이다.

`PracticeScenarioProgressService`를 다시 읽어 보니 두 가지가 겹쳐 있었다.

1. **`scenarioStage`는 매도로 옮겨가지 않는다** — 주석이 명시한다("표는 세 행뿐이고 매도는
   어느 행에도 없다. 매도해도 커서를 옮기지 않는다"). ACT는 시간으로만 흐르고 보유 여부와
   무관하다(`scenarioProgressing` 주석 "미보유로 4막을 관전 중이어도 true").
2. **손절이 대본 커서보다 먼저 발동할 수 있다** — 손절 예약은 매 tick 가격으로 자동 체결되므로
   (D43), 대본이 아직 ACT1·ACT2를 도는 도중에 전량 매도 상태가 되는 게 정상 경로다.

그 결과 D35가 구현한 재진입 UI는 `IDLE_REENTRY`에 도달한 뒤에만 작동했고, 그 전에 손절당하면
`awaitingReentry`가 `false`로 계산돼 `reviewReady`가 `true`가 됐다 — 되돌아보기(복기) 탭이
자동으로 열리고, 복기를 저장하면 그 순간 실행이 완료 확정된다(`saveHoldingReflection`이
저장과 완료를 원자로 묶는다는 게 서비스 계약이다). **3·4막을 보지도 못하고 튜토리얼이
조기 종료되는 실제 버그였다** — 문구 오류(D43)보다 심각하다.

**고친 방법** — 판정 기준을 "지금 이 값인가"에서 "대본이 끝났는가"로 넓혔다.
`awaitingReentry = scenarioStage !== null && scenarioStage !== 'FINISHED'`. 대본이 있는
실행은 `FINISHED`에 닿기 전까지는 전량 매도가 몇 번이든 전부 재진입 대기로 본다. `uiStep`도
같은 실수를 반복하지 않도록 `orderSide`·`reviewReady`와 같은 식을 그대로 인라인해서 세
값이 서로 다른 곳에서 각자 계산되다 갈라지는 일이 없게 했다.

**교훈** — "재진입 UI"를 만들면서 `IDLE_REENTRY` enum 값 하나만 보고 "재진입 대기 구간"이라고
이름 붙인 것 자체가 틀렸다. 실제 의미는 "대본이 안 끝났다"였는데, 이름과 실제 대본 상태 전이
규칙(시간 기반, 매도와 무관)을 대조하지 않고 넘어갔다. 다음에 `scenarioStage`의 특정 값으로
분기할 때는 반드시 `PracticeScenarioProgressService`(또는 그 후속)의 전이 규칙을 먼저 읽는다.

## D45. 세 번째 발견 — CandleGuide에도 같은 자동체결 오문구가 있었고, 취소·정정·즉시체결이 "이미 결말난 주문"을 처리 못 해 카드가 영원히 멈췄다

D43·D44 수정 직후 사용자가 "지정가 매수까지는 잘되는데 매도가 이상하다, 체결은 됐다는데
그다음 뭐가 안 뜬다"고 보고해 직접 브라우저를 열어 재현했다.

**세 번째 오문구.** `grep`이 D43에서 놓친 표현("자동으로 사고팔리지 않습니다")이
`CandleGuide.tsx`(캔들 설명 접이식 카드)에 그대로 남아 있었다 — "점선 두 개는 알림이지 자동
주문이 아닙니다"로 정정했다.

**진짜 원인.** `handleCancelPending`·`handleAmendPending`·`handleFillPendingNow` 세 곳 모두
`cancelLimitOrder`/`amendLimitOrder`가 던지는 409(`ORDER_ALREADY_FILLED`·
`ORDER_ALREADY_CANCELLED`)·404(`NOT_FOUND`)를 일반 오류로만 다뤘다 — `pendingOrder`를 지우지
않고 `toUserMessage`의 기본 폴백("요청을 처리할 수 없습니다.")만 보여줬다. 이 세 코드는 오류가
아니라 "취소·정정을 부르는 사이에 tick이 먼저 결말을 냈다"는 뜻인데, 카드가 "정한 값이 되기를
기다리는 중"에 그대로 멈추고 다시 눌러도 같은 409만 반복됐다.

실전 화면 `PendingOrders.tsx`가 이미 이 판단(`handleGone`)을 갖고 있었다 — 튜토리얼 쪽만
그 패턴을 놓쳤다. `pendingOrderGoneOutcome(error, pending)` 헬퍼로 세 코드를 결말
(`FILLED`·`CANCELLED`·`UNKNOWN`)로 번역해 세 핸들러에 공통 적용했다. `handleFillPendingNow`는
추가로 주의할 점이 있다 — 취소가 `ORDER_ALREADY_FILLED`로 실패하면 "지금 값에 사겠다"는 원래
의도가 이미 이뤄진 것이므로 시장가 주문을 새로 넣지 않는다(넣으면 중복 매수가 된다).

**재현 경로.** 이 레이스는 테스트 환경 특유의 우연이 아니다 — document.hidden이 true인 백그라운드
탭에서는 폴링이 멈추므로(기존 알려진 제약) 지정가가 이미 체결 가능한 값으로 걸리면, 사용자가
"기다리지 않고 지금 값에 체결"을 누르는 바로 그 순간이 서버가 먼저 체결시키는 순간과 겹치기
쉽다 — 그 버튼을 누르고 싶어지는 이유 자체가 "정한 값에 이미 닿았거나 곧 닿는다"이기 때문이다.

**실제 브라우저로 검증했다** — 로컬 백엔드(`finplay_verify`)에 지정가 매수를 걸고 `/tick`을
직접 호출해 서버에서 먼저 체결시킨 뒤, 프론트가 아직 "기다리는 중"으로 그리고 있는 카드에서
"지정가 주문 취소"를 눌렀다. 수정 전에는 카드가 멈추고 "요청을 처리할 수 없습니다"만 남았을
상황에서, 수정 후에는 "예약한 값에 체결됐습니다"로 즉시 정리되고 재진입 매수 폼으로 넘어갔다.
회귀 테스트 3건 추가, 전체 237개 통과.

## D46. 네 번째 발견 — 재진입 안내가 "지금 보유 중"에도 떴다 (D44 수정 직후 실제 계정으로 재확인하다 발견)

D44까지 고친 뒤 "처음부터 다시 시작"해 실제 계정으로 처음부터 끝까지 다시 밟아 보다가,
지금 한창 보유 중인데도(매도 패널) "직전 진입이 정리됐습니다. 다시 살 수 있어요." 안내가 뜨는
것을 발견했다. `orderSide === 'BUY'`가 조건에 없었다 — `progress.entries`에는 아직 안 판 진입
(지금 보유 중인 것도) 함께 오므로 `awaitingReentry && entries.length > 0`만으로는 "정리됐다"를
보장하지 못했다. `orderSide === 'BUY'`를 추가해 매수 패널일 때만(=지금 보유 중이 아닐 때만)
뜨도록 고쳤다.

**끝까지 실제 계정으로 검증했다** — 17회차를 새로 시작해 종목 선택 → 프리셋(느긋하게) 선택 →
시장가 매수 → **즉시(같은 요청 안에서 tick 없이) 시장가 매도** → 체크리스트 "✓ 시장가 매매"
확인 → 지정가 매수(백엔드 `/tick` 직접 호출로 체결) → 지정가 매도(마찬가지) → **체크리스트
세 항목이 모두 ✓로 채워지는 것**과 완료 화면 진입 카드 세 장(시장가 매수·시장가 매수·지정가
매수 칩이 각각 정확히 붙은)까지 전부 실제 백엔드로 확인했다. 검증을 마친 뒤 계정을 다시
"처음부터 다시 시작"으로 깨끗하게 돌려 뒀다.

**검증 중 별개로 확인한 것(코드와 무관)** — 이 기기가 여러 세션이 동시에 쓰는 공유 환경이라,
검증 도중 Docker 전체가 두 차례 죽었다 살아났고(모든 컨테이너가 동시에 exit 255) gradle
데몬도 외부 stop 명령으로 한 번 죽었다. 둘 다 내 코드·설정과 무관한 인프라 문제였고,
컨테이너·백엔드를 다시 띄우는 것으로 해결됐다 — `docker start`가 먹히는지, `curl .../auth/me`가
401(정상)을 주는지로 확인하는 게 빠르다.

# 백엔드 PR #516·#517·#521·#522 반영 — 2단계(ORDER_BASICS) 대본 완결 (2026-08-21, 이슈 #507)

## D47. 프리셋 잠금 조건을 잘못 좁혔다 — 테스트가 코드보다 먼저 맞았다

첫 구현은 `exitPresetStageLocked`를 "시장가·지정가 왕복 미완료"로만 판정했다. 그런데
`frontend-reply-505.md` 결정 1은 "2단계에서는 프리셋을 아예 다루지 않는다"였다 — 왕복을 다
마쳤어도 **아직 2단계(`ORDER_BASICS`)라면** 여전히 잠가야 한다는 뜻인데, 코드는 그 조건을
빼먹었다. 테스트를 먼저 쓰고 돌렸더니(둘 다 완료했는데 버튼이 안 잠기는 상황을 재현) 바로
드러났다 — 화면으로 직접 확인하기 전에 코드만 보고 넘어갔으면 놓쳤을 자리다.

고친 판정: `scenarioStage === 'ORDER_BASICS'`(화면의 결정, 무조건 잠금) `||` (대본을 쓰는데
왕복 미완료(서버의 실제 409 방어선)). 지정가 토글 잠금(`limitOrderStageLocked`)은 애초에
"시장가 왕복" 하나만 보므로 이 문제가 없었다 — 2단계 안에서 지정가를 쓰는 게 목적 자체라
"2단계니까 무조건 잠근다"가 성립하지 않는다.

## D48. 실제 백엔드(origin/dev)로 전체 여정을 끝까지 검증했다

로컬 checkout(`C:\Users\user\Desktop\tradeclass-api`)은 백엔드 세션이 다른 브랜치로 활발히
쓰고 있어(워크트리 다수) 브랜치를 건드리지 않고 `git worktree add`로 별도 경로에
`origin/dev`(PR #516·517·521·522 전부 반영)를 체크아웃해 그 워크트리에서만 `bootRun`을
돌렸다 — 공유 저장소의 다른 세션 작업을 방해하지 않는 방법이다. `finplay_verify` DB에 V55
마이그레이션(`scenario_script_id`)이 자동 적용되는 것도 함께 확인했다.

실제로 확인한 것 — 종목을 새로 고르면 진짜로 `ORDER_BASICS` 대본으로 열린다(진입 대본이 이제
2단계다, PR #516 "이 PR의 사용자 노출 지점"). 목적 설명·가격 범위(90,000~110,000) 문구가
그대로 뜬다. 시장가 매수·매도 뒤 "✓ 시장가 매매"가 실제로 체크된다. 지정가 토글이 실제로
풀린다. 지정가 매수·매도 뒤 "✓ 지정가 매매"와 "3단계로 가기" 버튼이 실제로 뜬다. 완료 카드에
"2단계 연습" 칩이 두 진입 모두에 정확히 붙는다. 버튼을 누르면 실제로 041 이야기 대본으로
전환되어 사건 피드·상태 줄·"← 왼쪽에서 소식 확인"이 다시 뜨고, 가격 범위 제한이 없는 041의
넓은 변동폭(2,160~99,747원)이 실제로 나타난다. 검증 후 워크트리·백엔드 프로세스를 정리하고
계정은 "처음부터 다시 시작"으로 되돌려 뒀다.
