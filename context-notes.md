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
- https://app.notion.com/p/3e6b1fddfba98241938e81c49f063dea — 백엔드 기준 **21개 테이블** (논리명/물리명/타입/Null/Key/Default/설명).
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

## 미로 와이어프레임 (2026-07-22)
- 보드: https://miro.com/app/board/uXjVH5PBQGY=/ — 화면 10프레임 + OAuth(카카오/네이버) 포함 유저 플로우 다이어그램 + 설계 노트 문서. 튜터 발표용.
- OAuth는 와이어프레임에만 반영(코드 미구현). 구현 시 인가코드 플로우 + 최초 로그인 자동가입/계좌생성 + 이메일 병합 정책 적용.

## 3차 스코프 — UX 보강 (2026-07-22, 사용자 추가 요청)
- 상단 내비에 지갑 pill 추가: 보유(총자산)·가능(현금 합산), 2.5초 read-only 갱신(틱은 페이지가 담당), 클릭 시 /me. 내비 폭 max-w-4xl → 5xl.
- 종목 28개로 확충 (주식 16 — LG화학은 거래정지 예시 / 코인 12). openPrices·livePrices 동기 시드.
- 내정보 계좌 카드 = 버튼 → navigate('/portfolio', {state:{market}}). Portfolio가 location.state.market으로 초기 탭 선택.
- 매매 내역 행 = 버튼 → TradeDetailModal (z-50, 배경 클릭 닫기): 단가·수량·금액·수수료 + 연결된 투자일기·AI 복기 표시.
