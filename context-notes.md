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
