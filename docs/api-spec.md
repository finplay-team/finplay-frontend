# API 명세 — Investory

프론트 `src/services/*.ts`가 호출하는 mock 함수를 실제 REST API로 옮길 때의 계약(contract).
현재는 mock이 Promise로 반환하지만, 엔드포인트·요청/응답 형태를 아래에 고정해 두어 교체가 1:1로 되도록 한다.

- Base URL: `/api`
- 인증: `Authorization: Bearer <JWT>` (로그인 이후)
- 공통 에러: `{ "error": { "code": string, "message": string } }` + 적절한 HTTP status

---

## Auth

| 메서드 | 경로 | 요청 | 응답 | 대응 mock |
|---|---|---|---|---|
| POST | `/auth/signup` | `{ email, nickname, password }` | `{ user, token }` + 주식·코인 계좌 자동 생성 | `authService.signup` |
| POST | `/auth/login` | `{ email, password }` | `{ user, token }` | `authService.login` |
| POST | `/auth/logout` | — | `204` | `authService.logout` |
| GET | `/auth/me` | — | `{ user }` | `authService.getSession` |

`user` = `{ id, email, nickname, role, status, createdAt }` (비밀번호 미포함)

---

## Accounts

| 메서드 | 경로 | 응답 |
|---|---|---|
| GET | `/accounts` | 내 계좌 목록 `[{ id, market, seedAmount, cashBalance, totalValue, realizedPnl, unrealizedPnl }]` |
| GET | `/accounts/:id/holdings` | 보유자산 `[{ instrument, quantity, avgPrice, valuation }]` |

---

## Instruments

| 메서드 | 경로 | 쿼리 | 응답 |
|---|---|---|---|
| GET | `/instruments` | `?market=STOCK\|CRYPTO` | 거래 가능 종목 목록 |
| GET | `/instruments/:id/prices` | `?interval=1m&from&to` | 시세 히스토리(차트용) |
| WS | `/ws/prices` | 구독 `{ symbols[] }` | 실시간/지연 시세 틱 (코인 실시간, 주식 지연/재생) |

---

## Orders & Decision Logs

| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| POST | `/orders` | `{ accountId, instrumentId, side, orderType, price?, quantity, decisionLog? }` | 생성된 주문. 체결 시 Kafka 이벤트 발행 |
| GET | `/orders` | `?accountId&status` | 주문/거래 내역 |
| DELETE | `/orders/:id` | — | 미체결 주문 취소 |
| POST | `/orders/:id/decision-log` | `{ basis, memo }` | 투자일기 기록 |
| GET | `/decision-logs/:id/review` | — | AI 복기 피드백(생성 후) |

`decisionLog` = `{ basis: NEWS\|TECHNICAL\|LONGTERM\|GUT\|ETC, memo }`

---

## Rankings

| 메서드 | 경로 | 쿼리 | 응답 | 대응 mock |
|---|---|---|---|---|
| GET | `/rankings` | `?market=STOCK\|CRYPTO` | `[{ rank, nickname, realizedPnl, returnRate, avgHoldingDays, tradeCount, unrealizedPnl }]` | `rankingService.getRankings` |
| GET | `/rankings/me` | `?market` | 내 순위 행 (or null) | `rankingService.getMyRow` |

산정: 실현손익 누적 기준, 매일 00:00 스냅샷.

---

## AI

| 메서드 | 경로 | 응답 |
|---|---|---|
| GET | `/ai/habit-report` | `?accountId&period=WEEKLY\|MONTHLY` → `{ metrics, content }` (종목 추천 없음, 응답 검증 통과분만) |

`metrics` = `{ tradeCount, avgHoldingDays, stopLossRatio, concentrationCount }`

---

## Missions

| 메서드 | 경로 | 응답 |
|---|---|---|
| GET | `/missions` | 활성 미션 + 내 진행 상태 |
| POST | `/missions/:id/claim` | 완료 처리 → 뱃지/칭호 보상 (시드 미지급) |

---

## Notifications

| 메서드 | 경로 | 응답 |
|---|---|---|
| GET | `/notifications` | 알림 목록 |
| POST | `/notifications/:id/read` | 읽음 처리 |

---

## Admin (ADMIN 롤 전용)

| 메서드 | 경로 | 요청/응답 | 대응 mock |
|---|---|---|---|
| GET | `/admin/stats` | `{ totalUsers, activeUsers, totalAccounts, todayTradeVolume, activeEvents }` | `adminService.getStats` |
| GET | `/admin/users` | 회원 목록 | `adminService.getUsers` |
| PATCH | `/admin/users/:id/status` | `{ status }` → 정지/활성 | `adminService.toggleUserStatus` |
| GET | `/admin/instruments` | `?market` 종목 목록 | `adminService.getInstruments` |
| PATCH | `/admin/instruments/:id` | `{ isTradable }` | `adminService.toggleInstrument` |
| GET/POST | `/admin/missions` | 목록 / 생성 | `adminService.getMissions` / `createMission` |
| PATCH | `/admin/missions/:id` | `{ isActive }` | `adminService.toggleMission` |
| GET/POST | `/admin/events` | 목록 / 등록`{ title, type, eventAt, description }` | `adminService.getEvents` / `createEvent` |
| PATCH | `/admin/events/:id/alert` | `{ alertEnabled }` | `adminService.toggleEventAlert` |
