# AI 피드백 API 계약 (spec 012 · FEED-006~011)

프론트 구현용 계약 정본 요약이다. 근거는 `.backend-docs/api-contracts.md` §012 AI 피드백(665~820행)과 `.backend-docs/api-routes.md`(63~66행, 90~106행)이다.

**중요 — 이 레포에 없는 문서.** 계약 문서가 반복해서 참조하는 `docs/specs/012-ai-feedback/spec.md`(§C-2 구간 정의, §C-3 공시 판정, §C-4 상태 판정 순서 표, §C-5 게이트 정본, §C-7 카드 개수·재시도 상한, §C-8 저장 형태, §C-9 코인 분기, §노출 판정, §파생 사실 계산)와 `plan.md`은 `.backend-docs/`에 들어 있지 않다. 따라서 아래에서 "§C-x 정본"이라 적힌 세부 규칙(예: `revealTime` 계산식, `PRE_MARKET`/`FULL` 구간의 정확한 하한 시각, §C-4 판정 순서 표의 행 순서, `max-*` 설정값의 실제 숫자)은 **문서에 명시 없음**이며, 계약 문서의 산문에서 확인된 범위까지만 적었다.

공통 사항은 넷 모두 같다.

- 인증은 `Authorization: Bearer <accessToken>` 필수다. 네 경로 모두 `SecurityConfig` 공개 목록에 없어 `anyRequest().authenticated()`로 떨어진다.
- 성공 응답은 봉투 없는 bare JSON이며 성공 상태코드는 **전부 200**이다. 201·204는 없다.
- 오류 응답은 공통 봉투다. `{"error":{"code":"...","message":"...","requestId":"..."}}` + `X-Request-Id` 헤더.
- 인증 실패는 401 `UNAUTHORIZED`, 권한 없는 리소스는 403 `FORBIDDEN`이다.
- 모든 시각 필드는 오프셋 없는 `LocalDateTime` 문자열(`"2026-07-29T11:20:00"`)이고 날짜 필드는 `LocalDate` 문자열(`"2026-07-29"`)이다. `src/lib/datetime.ts`의 `parseLocalDateTime`으로만 파싱한다. `'Z'`를 붙이면 9시간 어긋난다.
- 비율 필드는 퍼센트가 아니라 **scale-4 비율**이다(`-0.0182` == -1.82%). 표시할 때 `ratioToPercent`를 반드시 통과시킨다.
- 소수는 JSON 숫자(BigDecimal 직렬화)로 내려온다. 이 도메인에서 문자열로 오는 소수 필드는 문서상 없다.

---

## 1. GET /api/instruments/{instrumentId}/price-moves (FEED-006)

종목의 변동 원인 카드 목록이다.

### 요청

| 위치 | 이름 | 타입 | 필수 | 비고 |
|---|---|---|---|---|
| path | `instrumentId` | number | 필수 | 이것만 받는다 |

쿼리 파라미터·요청 본문은 **없다**. 페이지네이션도 없다.

### 성공 응답 — 200 `PriceMoveListResponse`

```json
{
  "originTradeDate": "2026-07-29",
  "moves": [
    {
      "id": 12,
      "eventType": "INTRADAY",
      "windowStart": "2026-07-29T11:20:00",
      "windowEnd": "2026-07-29T11:25:00",
      "changeRate": -0.0182,
      "narrative": "11시 20분부터 5분간 1.82% 하락했습니다. 같은 시간대에 생산 차질을 다룬 기사가 있었습니다.",
      "sources": [
        {
          "type": "NEWS",
          "title": "...",
          "publisher": "hankyung.com",
          "url": "https://...",
          "publishedAt": "2026-07-29T11:15:00"
        }
      ]
    }
  ]
}
```

| 필드 | 타입 | null 가능 | 설명 |
|---|---|---|---|
| `originTradeDate` | `LocalDate` | O | 주식은 현재 재생세션의 원본 거래일. 코인은 **항상 `null`**. 주식이지만 재생세션이 `READY`가 아니어도 **`null`** |
| `moves` | array | X (빈 배열 가능) | 카드 목록 |
| `moves[].id` | number | X | 카드 PK. 정렬 2차 키이자 `post-sell`의 `peerComparison.priceMoveId`와 같은 축 |
| `moves[].eventType` | `"INTRADAY"` \| `"OPENING_GAP"` | 문서에 명시 없음 | `INTRADAY` 장중 변동, `OPENING_GAP` 시가 갭. 코인 카드의 `eventType` 값은 문서에 명시 없음 |
| `moves[].windowStart` | `LocalDateTime` | 문서에 명시 없음 | **`originTradeDate`의 날짜**가 붙은다. 조회한 날짜가 아니다. 저장은 `TIME`뿐이고 날짜는 응답 조립에서 붙인다 |
| `moves[].windowEnd` | `LocalDateTime` | 문서에 명시 없음 | 위와 같다 |
| `moves[].changeRate` | number | 문서에 명시 없음 | **scale-4 비율**(예시 `-0.0182` == -1.82%). `changeRate`의 scale을 명시한 문장은 문서에 없고 예시로만 확인된다 |
| `moves[].narrative` | string | X | LLM 생성 문장이거나 후검증 위반 시 대체된 템플릿 문장. **어느 쪽이든 항상 채워진다** |
| `moves[].sources` | array | X | **빈 배열인 카드는 존재하지 않는다** — 근거가 없으면 카드 자체를 만들지 않는다(FEED-003). 길이 ≥ 1을 가정해도 된다 |
| `sources[].type` | `"NEWS"` \| `"DISCLOSURE"` | 문서에 명시 없음 | 이 절 예시에는 `NEWS`만 나오지만 §012 서두가 `type=DISCLOSURE`의 `publisher`를 `DART` 고정으로 규정한다 |
| `sources[].title` | string | 문서에 명시 없음 | |
| `sources[].publisher` | string | 문서에 명시 없음 | 뉴스는 **`originallink` 호스트에서 `www.`만 뗀 도메인**(`hankyung.com`). 한글 언론사명이 아니다 — 오타가 아니라 의도된 값이며 한글 매핑은 후속 이슈 |
| `sources[].url` | string | 문서에 명시 없음 | 원문 링크 |
| `sources[].publishedAt` | `LocalDateTime` | 문서에 명시 없음 | 공시는 시각 부분이 항상 `00:00:00` |

응답에 **`revealTime`은 포함되지 않는다**(서버 내부 판정값). 기사 본문도 어떤 형태로도 포함되지 않는다.

### 정렬 보장

- `moves` — `windowStart` **오름차순**, 동률은 `id` **오름차순**. 첫 분봉이 09:00인 날 `OPENING_GAP`과 첫 `INTRADAY`의 `windowStart`가 정확히 같아지며, `id`는 곧 생성 순서라 **갭 카드가 먼저 온다**.
- `moves[].sources` — `publishedAt` **내림차순**, 동률은 저장 순서(`price_move_event_sources.id` 오름차순).
- 코인은 `window_start` 컬럼이 항상 `NULL`이라 실제 정렬 기준이 `occurredAt` + `id` 오름차순이지만, 응답의 `windowStart = occurredAt - rollingWindowMinutes`가 `occurredAt`의 단조 변환이므로 결과 순서는 `windowStart` 오름차순과 동치다. 즉 **클라이언트는 항상 `windowStart` 오름차순으로 취급하면 된다**.

### 게이트 / 빈 상태 — **status 필드가 없다**

이 엔드포인트는 넷 중 유일하게 **상태 enum 필드가 없다**. 구분 신호는 `originTradeDate`와 `moves.length` 조합뿐이다.

- 주식, 재생세션 `READY`, 카드 있음 → `originTradeDate` = 날짜, `moves.length > 0`.
- 주식, 재생세션 `READY`, 아직 열린 카드 없음(오전) → `originTradeDate` = 날짜, `moves = []`. 200이며 오류가 아니다.
- 주식, 재생세션 미준비 → `originTradeDate = null`, `moves = []`. 200이며 오류가 아니다.
- 코인 → `originTradeDate = null`, 최근 24시간 카드(0건일 수 있다).

**따라서 `originTradeDate === null`만으로 "재생세션 미준비"라고 판정하면 코인에서 오판한다.** 시장 구분은 `instrumentId`로 `instrumentService`의 캐시에서 `market`을 조회해 클라이언트가 스스로 알아야 한다.

### 노출 필터(스포일러 차단)

- 주식은 `(서비스 날짜 + revealTime) <= now()`인 카드만 반환한다. 하루치 카드는 08:45 배치에서 이미 전부 생성돼 있으므로 이 필터가 없으면 오후 사건이 오전에 노출된다. **`revealTime` 계산식은 spec §노출 판정 정본이며 문서에 명시 없음**(요지만 적혀 있다 — 근거 기사가 카드보다 늦게 발행되면 그 시각까지 밀고, 전장 기사는 09:00으로 당긴다).
- 코인은 `revealTime`이 `NULL`이고 게이트 없이 최근 24시간 카드를 반환한다.
- 카드 개수 상한 — 주식은 원본 거래일당 `max-intraday-cards`건 + 시가 갭 1건(갭은 조건 미충족 시 아예 없다), 코인은 종목당 `daily-limit`건. **두 설정값의 실제 숫자는 문서에 명시 없음**.

### 오류

| 상태 | code | 트리거 |
|---|---|---|
| 401 | `UNAUTHORIZED` | Access 토큰 없음·만료·변조, Refresh 토큰 사용 |
| 404 | `NOT_FOUND` | `instrumentId` 미존재 |

---

## 2. GET /api/ai/post-sell/{tradeId} (FEED-007 + FEED-010 반사실 + FEED-011 집단 비교)

본인 매도 체결 1건의 매도 직후 피드백이다. **2차는 주식 전용이다.**

### 요청

| 위치 | 이름 | 타입 | 필수 | 비고 |
|---|---|---|---|---|
| path | `tradeId` | number | 필수 | 이것만 받는다 |

쿼리·본문 없다. **조회 대상 회원은 요청에서 받지 않고 Access Token의 본인으로 고정된다.**

### 성공 응답 — 200 `PostSellFeedbackResponse`

```json
{
  "tradeId": 2,
  "instrumentId": 1,
  "symbol": "005930",
  "name": "삼성전자",
  "buyAt": "2026-07-29T09:30:00",
  "sellAt": "2026-07-29T14:40:00",
  "buyPrice": 70000,
  "sellPrice": 68500,
  "quantity": 10,
  "fee": 102,
  "realizedPnl": -15207,
  "returnRate": -0.0217,
  "holdingMinutes": 310,
  "sameSessionCompleted": true,
  "holdHighPrice": 70800,
  "holdHighAt": "2026-07-29T11:05:00",
  "holdLowPrice": 68100,
  "holdLowAt": "2026-07-29T14:20:00",
  "sellVsHighRate": -0.0325,
  "sellVsLowRate": 0.0059,
  "buyToNewsMinutes": 105,
  "priceMoves": [
    {
      "id": 12,
      "windowStart": "2026-07-29T11:20:00",
      "windowEnd": "2026-07-29T11:25:00",
      "changeRate": -0.0182,
      "minutesAfterBuy": 115,
      "minutesBeforeSell": 195,
      "narrative": "...",
      "sources": []
    }
  ],
  "postSellFlow": {
    "status": "READY",
    "closePrice": 69200,
    "closeAt": "2026-07-29T15:29:00",
    "sellToCloseRate": 0.0102,
    "postSellHighPrice": 69500,
    "postSellHighAt": "2026-07-29T15:05:00"
  },
  "counterfactuals": {
    "status": "READY",
    "atClose":              { "price": 69200, "at": "2026-07-29T15:29:00", "returnRate": -0.0117 },
    "atHoldHigh":           { "price": 70800, "at": "2026-07-29T11:05:00", "returnRate":  0.0111 },
    "atFirstMoveAfterBuy":  { "price": 69300, "at": "2026-07-29T11:25:00", "returnRate": -0.0103 }
  },
  "peerComparison": {
    "status": "READY",
    "priceMoveId": 12,
    "holderCount": 47,
    "soldWithin30MinRate": 0.38,
    "medianMinutesToSell": 42,
    "yourMinutesToSell": 195
  },
  "narrative": "09시 30분 매수는 이날 하락 구간(11시 20분)보다 1시간 55분 앞섰습니다. …",
  "narrativeSource": "LLM",
  "narrativeStatus": "READY"
}
```

#### 원장 수치 (항상 채워진다)

| 필드 | 타입 | null 가능 | 설명 |
|---|---|---|---|
| `tradeId` | number | X | 요청한 매도 체결 ID |
| `instrumentId` | number | X | |
| `symbol` | string | X | **이 응답에는 `symbol`·`name`이 있다** — `GET /api/trades`와 달리 instrument 캐시 조인이 필요 없다 |
| `name` | string | X | |
| `buyAt` | `LocalDateTime` | 문서에 명시 없음 | **배분된 매수 lot 중 가장 이른 체결 시각.** 원본 거래일 축. 체결 시각이라 **초를 그대로 싣는다** |
| `sellAt` | `LocalDateTime` | 문서에 명시 없음 | 매도 체결 시각. 원본 거래일 축. 초 포함 |
| `buyPrice` | number | X | `trade_allocations`의 FIFO 배분 **가중평균** 매수단가. 단일 lot 가격이 아니다 |
| `sellPrice` | number | X | `trades` 행 그대로 |
| `quantity` | number | X | `trades` 행 그대로 |
| `fee` | number | X | 매도 수수료. `trades` 행 그대로 (주식 0.015%, 원 미만 내림) |
| `realizedPnl` | number | X | `trades` 행 그대로 |
| `returnRate` | number | X | **scale-4 비율, `RoundingMode.HALF_UP`.** `realizedPnl ÷ (배분된 매수원가 합 + 배분된 매수수수료 합)` |
| `holdingMinutes` | number | O (역전 시에만) | 아래 별도 절 참고. **`sameSessionCompleted=false`라고 `null`이 되지 않는다** |
| `sameSessionCompleted` | boolean | X | 응답 형태를 가르는 스위치. 아래 별도 절 |

LLM은 이 수치를 계산하지도 수정하지도 않는다(C-004). 예시 값은 실제 계산이 재현되는 값이다 — 매수수수료 `FLOOR(700,000×0.00015)=105`, 매수원가 합 700,105, 매도수수료 `FLOOR(685,000×0.00015)=102`, `realizedPnl = 685,000 − 102 − 700,105 = −15,207`.

#### 파생 사실 (`sameSessionCompleted=true`일 때만)

| 필드 | 타입 | 설명 |
|---|---|---|
| `holdHighPrice` / `holdHighAt` | number / `LocalDateTime` | 보유 구간 최고가와 그 시각 |
| `holdLowPrice` / `holdLowAt` | number / `LocalDateTime` | 보유 구간 최저가와 그 시각 |
| `sellVsHighRate` | number | 매도가가 최고가에서 얼마나 떨어져 있었는지. **scale-4 비율**(예시 `-0.0325`) |
| `sellVsLowRate` | number | 매도가가 최저가에서 얼마나 떨어져 있었는지. **scale-4 비율** |
| `buyToNewsMinutes` | number \| null | 매수 시각 − 첫 근거 기사 발행시각(분). **양수면 매수가 기사보다 앞섰다는 뜻**, 음수면 기사 뒤 매수. **근거 기사가 없으면 `null`** (`sameSessionCompleted=true`여도 `null`일 수 있다) |

#### `priceMoves[]` (`sameSessionCompleted=true`일 때만, 아니면 `[]`)

FEED-006의 카드와 **같은 카드지만 필드 구성이 다르다.**

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | number | FEED-006의 `moves[].id`와 같은 축 |
| `windowStart` / `windowEnd` | `LocalDateTime` | 원본 거래일 날짜 |
| `changeRate` | number | scale-4 비율 |
| `minutesAfterBuy` | number | 그 변동이 매수 몇 분 뒤였는지 |
| `minutesBeforeSell` | number | 그 변동이 매도 몇 분 전이었는지 |
| `narrative` | string | 항상 채워진다 |
| `sources[]` | array | FEED-006의 `sources`와 같은 5필드(`type`·`title`·`publisher`·`url`·`publishedAt`) |

**`eventType`은 이 응답 예시에 없다.** FEED-006에는 있고 여기에는 나오지 않으므로 존재를 가정하지 말 것 — 문서에 명시 없음.

정렬은 FEED-006과 같다. `priceMoves`는 `windowStart` 오름차순 + 동률 `id` 오름차순, 각 `sources`는 `publishedAt` 내림차순 + 동률 `price_move_event_sources.id` 오름차순.

#### `postSellFlow` (객체, `sameSessionCompleted=false`면 `null`)

| 필드 | 타입 | `NOT_YET`일 때 |
|---|---|---|
| `status` | `"NOT_YET"` \| `"READY"` | — |
| `closePrice` | number | `null` |
| `closeAt` | `LocalDateTime` | `null` |
| `sellToCloseRate` | number (scale-4 비율) | `null` |
| `postSellHighPrice` | number | `null` |
| `postSellHighAt` | `LocalDateTime` | `null` |

게이트 전에는 `status="NOT_YET"`이고 **가격 필드가 전부 `null`**이다. 마감 후 첫 조회에서 `READY`가 된다.

#### `counterfactuals` (객체, `sameSessionCompleted=false`면 `null`) — 반사실 3종

| 필드 | 타입 | 설명 |
|---|---|---|
| `status` | `"NOT_YET"` \| `"READY"` | 게이트 전 `NOT_YET` |
| `atClose` | `{ price, at, returnRate }` | 종가까지 보유했다면 |
| `atHoldHigh` | `{ price, at, returnRate }` | 보유 중 최고가에 팔았다면 |
| `atFirstMoveAfterBuy` | `{ price, at, returnRate }` | 매수 후 첫 변동 시점에 팔았다면 |

**반사실 3종의 식별자는 별도 enum 필드가 아니라 객체 키 이름 자체다** — `atClose`·`atHoldHigh`·`atFirstMoveAfterBuy`. 배열이 아니라 고정 키 3개짜리 객체이므로 순회 대신 키 접근을 쓴다.

각 항목의 shape는 `price`(number), `at`(`LocalDateTime`), `returnRate`(number)다. **`returnRate`는 시나리오 가격마다 수수료를 다시 계산한 값이다** — 매도금액 비례라 가격이 바뀌면 수수료도 바뀐다. scale은 최상위 `returnRate`와 같은 **scale-4 비율**로 확인된다(예시 `-0.0117`·`0.0111`·`-0.0103`). 반사실 `returnRate`의 scale을 명시한 문장은 문서에 없고 예시로만 확인된다.

`status="NOT_YET"`일 때 세 객체가 `null`인지, 아니면 내부 필드가 `null`인 객체인지는 **문서에 명시 없음**. 계약 문서는 `postSellFlow`에 대해서만 "가격 필드가 전부 `null`"이라 적었다. 방어적으로 `counterfactuals?.atClose?.price` 형태의 옵셔널 체이닝을 쓴다.

**반사실은 `narrative`에 절대 들어가지 않는다** — 가정법 금지 후검증에 걸린다. 화면이 구조화 필드를 표로 나란히 놓고 해석은 사용자가 한다.

#### `peerComparison` (객체, `sameSessionCompleted=false`면 `null`) — 상태 4종

기준 카드는 **보유 구간 안의 첫 변동 카드 하나**이며 `atFirstMoveAfterBuy`와 같은 카드다.

| `status` | `priceMoveId` | `holderCount` | `soldWithin30MinRate` | `medianMinutesToSell` | `yourMinutesToSell` |
|---|---|---|---|---|---|
| `READY` | 값 | 값 (≥5) | 값 | 값 | 값 |
| `INSUFFICIENT_SAMPLE` | 값 | `null` | `null` | `null` | **값 (채워진다)** |
| `NO_EVENT` | `null` | `null` | `null` | `null` | `null` |
| `NOT_YET` | 문서에 명시 없음 | 문서에 명시 없음 | 문서에 명시 없음 | 문서에 명시 없음 | 문서에 명시 없음 |

- `NO_EVENT` — 보유 구간에 카드가 0건. **`priceMoveId`를 포함한 모든 필드가 `null`**이다. 카드는 종목·거래일당 장중 `max-intraday-cards`건이고 근거 기사가 없으면 생성되지 않으므로 **카드 0건이 오히려 흔한 경우다.**
- `INSUFFICIENT_SAMPLE` — `holderCount`가 **5 미만**일 때이며 모집단 지표 셋(`holderCount`·`soldWithin30MinRate`·`medianMinutesToSell`)이 `null`이 된다. **`yourMinutesToSell`은 모집단 통계가 아니라 본인 값(`매도시각 − 카드 windowEnd`)이므로 이때도 채워진다.**
- `NOT_YET` — 계약 문서 733행이 "`counterfactuals`도 같은 게이트를 쓴다 … `peerComparison`은 시각이 아니라 확정 집계 행의 존재로 판정한다 … 그 전에는 각각 `status="NOT_YET"`이다"라고 적었다. **즉 `peerComparison`의 상태는 3종이 아니라 4종이다.** 판정 축도 다르다 — `postSellFlow`·`counterfactuals`는 **시각** 게이트, `peerComparison`은 **확정 집계 행의 존재**다(장 마감 배치가 게이트 시각보다 늦게 돌기 때문). `NOT_YET`일 때 나머지 필드 상태는 문서에 명시 없음.

`soldWithin30MinRate` 예시는 `0.38`이다 — 퍼센트가 아닌 **비율**로 읽어야 한다(38%). scale 명시는 문서에 없다. `medianMinutesToSell`·`yourMinutesToSell`은 분 단위 정수다.

회원 ID·닉네임·개별 체결은 어떤 형태로도 포함되지 않는다. 집단 비교는 관측된 사실이므로 `narrative`에 포함될 수 있다.

#### 서술

| 필드 | 타입 | 설명 |
|---|---|---|
| `narrative` | string | 항상 채워진다 |
| `narrativeSource` | `"LLM"` \| `"TEMPLATE"` | 어느 쪽으로 만들어졌는지 |
| `narrativeStatus` | `"READY"` | **항상 `READY`다.** 매도 회고에는 템플릿 문장이 있어 서술이 비는 경우가 없다. **`UNAVAILABLE`은 이 엔드포인트에 존재하지 않는다** — 템플릿이 없는 뉴스 요약·브리핑에만 있는 상태다 |

`narrativeStatus`로 분기하는 UI를 만들 필요가 없다. 다만 **`narrative`는 시간이 지나면 바뀔 수 있다** — `postSellFlow`가 `READY`이고 `peerComparison`이 `NOT_YET`이 아닌 상태(`READY`·`INSUFFICIENT_SAMPLE`·`NO_EVENT` 모두 확정으로 친다)가 된 뒤 첫 조회에서 재생성을 시도한다. 재생성이 실패(LLM 오류 또는 후검증 위반으로 템플릿 대체)하면 기존 서술을 유지한 채 다음 조회에서 또 시도하고, 체결 1건당 누적 `max-narrative-retry`회에서 멈춘다(실제 숫자는 문서에 명시 없음). 어느 경우에도 응답은 200이고 `narrativeStatus`는 `READY`다.

### 시간 게이트 (spec §C-5)

기준 날짜는 **"오늘"이 아니라 그 체결의 서비스 날짜**이며 열리는 시각은 **15:30**이다. 오늘로 잡으면 어제 판 체결을 오늘 오전에 열었을 때 `READY`였던 값이 `NOT_YET`으로 되돌아간다. **정확한 게이트 판정식은 spec §C-5 정본이고 문서에 명시 없음** — 계약 문서에 적힌 것은 "그 체결의 서비스 날짜 15:30 이후"까지다.

"아직 안 열림"과 "열림"을 가르는 필드는 다음 둘이며, **최상위에 게이트 필드는 없다.**

- `postSellFlow.status` — `"NOT_YET"` → `"READY"`
- `counterfactuals.status` — `"NOT_YET"` → `"READY"`
- (참고) `peerComparison.status`는 시각이 아니라 집계 행 존재로 판정하므로 위 둘과 전이 시점이 다를 수 있다.

**`postSellFlow`·`counterfactuals`가 `null`인 것과 `status="NOT_YET"`인 것은 다른 상태다.** `null`은 `sameSessionCompleted=false`(계산 자체가 성립하지 않음), `NOT_YET`은 아직 시각이 안 됨(나중에 다시 오면 채워짐)이다. 화면 문구가 달라야 한다.

### `sameSessionCompleted`

`true`면 매수와 매도가 같은 원본 거래일 안에서 완결된 것이다.

`true`일 때 채워지는 필드 — `holdHighPrice`·`holdHighAt`·`holdLowPrice`·`holdLowAt`·`sellVsHighRate`·`sellVsLowRate`·`buyToNewsMinutes`·`priceMoves`·`postSellFlow`·`counterfactuals`·`peerComparison`.

`false`일 때 위 필드가 **전부 `null`**이고 **`priceMoves`만 `[]`**다. 여러 재생일에 걸친 매매는 원본 거래일이 달라 분봉이 불연속이라 계산이 성립하지 않는다.

`false`가 되는 조건 3가지.

1. 매수와 매도의 원본 거래일이 다르다.
2. **한 매도가 여러 매수 lot에 배분됐고 그 lot들이 서로 다른 원본 거래일에 걸쳐 있다** — 가장 이른 lot 하나만 보고 판정하지 않는다.
3. **시각이 역전된 조합(`sellAt < buyAt`)** — 같은 원본 거래일을 여러 서비스 날짜에 재생할 수 있어 첫 재생일 오후에 매수하고 다음 재생일 오전에 매도하는 조합이 성립한다. 원본 거래일이 같으므로 날짜 대조만으로는 `false`가 되지 않아 역전 자체를 조건으로 둔다.

**`holdingMinutes`는 위 nullable 목록에 없다.** 역전(조건 3)인 경우에만 `null`이다. 즉 **역전이면 `sameSessionCompleted=false`이면서 `holdingMinutes`도 `null`이지만, `sameSessionCompleted=false`라고 `holdingMinutes`가 `null`이 되는 것은 아니다** — 원본 거래일이 순방향인 정상 cross-session 매매에서는 그대로 채운다. 서버는 음수를 0으로 clamp하거나 벽시계 경과분으로 대체하지 않는다.

### 분 단위 값의 계산 축

`holdingMinutes`·`priceMoves[].minutesAfterBuy`·`priceMoves[].minutesBeforeSell`·`buyToNewsMinutes`는 **두 끝점을 분으로 내린 뒤 뺀 값**이다(`executed_at`이 `DATETIME(6)`이라 소수 초가 붙지만 분봉·카드 시각은 정시). 반면 **`buyAt`·`sellAt` 자체는 체결 시각이라 초를 그대로 싣는다.**

따라서 클라이언트가 `sellAt - buyAt`을 직접 계산하면 서버의 `holdingMinutes`와 1분 어긋날 수 있다. **서버 값을 쓴다.**

### 오류

| 상태 | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 매수 체결(`side=BUY`)로 호출 |
| 400 | `VALIDATION_ERROR` | **코인 체결(`market=CRYPTO`)로 호출** — 2차는 주식 전용(2026-08-04, 이슈 #136). 빈 값을 채운 200을 돌려주지 않는다 |
| 401 | `UNAUTHORIZED` | 인증 실패 |
| 403 | `FORBIDDEN` | 타인 소유 체결 |
| 404 | `NOT_FOUND` | `tradeId` 미존재 |

**투자일기에 의존하지 않는다.** 투자일기를 쓰지 않고 매수·매도한 건도 정상 200이다. 목표가·손절가 등 구조화 필드(`plan`·`planOutcome`)는 아직 없고, 생기면 같은 응답에 추가되므로 위 필드는 유지된다.

### 문구 제약 (화면 문구도 따라야 한다)

인과 단정("~때문에"), 투자 권유("매수", "주목"), 가격 예측("오를 것"), 조언·후회 유도("~하세요", "~했으면 좋았을"), 판단·훈수("버티셨네요", "놓치셨", "더 기다렸다면"), 가정법 어미(`~다면`)를 쓰지 않는다. 서버가 LLM 출력을 후검증하므로 **화면이 반사실 표에 붙이는 라벨도 같은 제약을 지켜야** 한다("안 팔았다면" 같은 문구 금지, "종가 기준" 같은 사실 라벨을 쓴다).

---

## 3. GET /api/instruments/{instrumentId}/news (FEED-008)

종목의 뉴스·공시 목록과 AI 요약이다. 순수 조회이며 **조회 시 생성하지 않는다**(GET 부수효과 없음).

### 요청

| 위치 | 이름 | 타입 | 필수 |
|---|---|---|---|
| path | `instrumentId` | number | 필수 |

쿼리·본문 없다. 페이지네이션 없다.

### 성공 응답 — 200 `InstrumentNewsResponse`

```json
{
  "originTradeDate": "2026-07-29",
  "summaryScope": "PRE_MARKET",
  "summaryStatus": "READY",
  "summary": "직전 거래일 장 마감 이후 반도체 업황을 다룬 기사가 있었습니다. …",
  "items": [
    { "type": "NEWS",       "title": "...", "publisher": "hankyung.com",     "url": "https://...",              "publishedAt": "2026-07-28T18:40:00" },
    { "type": "DISCLOSURE", "title": "주요사항보고서(유상증자결정)", "publisher": "DART", "url": "https://dart.fss.or.kr/...", "publishedAt": "2026-07-28T00:00:00" }
  ]
}
```

| 필드 | 타입 | null 가능 | 설명 |
|---|---|---|---|
| `originTradeDate` | `LocalDate` | O | 주식은 현재 재생세션 원본 거래일. **재생세션 미준비면 `null`**(어떤 거래일을 재생 중인지 확정되지 않아 날짜를 지어낼 수 없다). **개장 전(09:00 이전)은 날짜를 채운다.** 코인은 항상 `null` |
| `summaryScope` | `"PRE_MARKET"` \| `"FULL"` \| `"ROLLING_24H"` \| `null` | O | 아래 표 |
| `summaryStatus` | `"READY"` \| `"NOT_YET"` \| `"EMPTY"` \| `"UNAVAILABLE"` | X | 아래 표 |
| `summary` | string | O | `READY`가 아니면 `null` |
| `items` | array | X (빈 배열 가능) | 아래 |
| `items[].type` | `"NEWS"` \| `"DISCLOSURE"` | 문서에 명시 없음 | |
| `items[].title` | string | 문서에 명시 없음 | |
| `items[].publisher` | string | 문서에 명시 없음 | 뉴스는 원문 링크 도메인, 공시는 `DART` 고정 |
| `items[].url` | string | 문서에 명시 없음 | 원문 URL |
| `items[].publishedAt` | `LocalDateTime` | 문서에 명시 없음 | **공시는 시각 부분이 항상 `00:00:00`** (OpenDART가 접수일자만 제공) |

**`items[]`에 `id`는 노출되지 않는다** — 정렬 2차 키로만 쓰인다. 즉 클라이언트가 항목에 안정적인 key를 붙일 식별자가 없다. `url`을 key로 쓰는 것이 현실적이다.

**`items[]`에 종목 정보(`instrumentId`·`symbol`·`name`)는 없다** — 브리핑과 다르다. 이미 종목 단위 조회이므로 필요 없다.

기사 본문은 어떤 형태로도 포함되지 않는다(저작권). 노출은 제목·언론사·원문 URL·발행시각뿐이다.

### `summaryScope` 결정 표

| 시장 | 조회 시각 | `summaryScope` | 요약 범위 |
|---|---|---|---|
| STOCK | 09:00 이전 | `null` | `summaryStatus="NOT_YET"`, `items=[]` |
| STOCK | 09:00 이상 15:30 미만 | `PRE_MARKET` | spec §C-2의 `전장` (실제 구간 정의는 문서에 명시 없음) |
| STOCK | 15:30 이상 | `FULL` | spec §C-2의 `FULL` (실제 구간 정의는 문서에 명시 없음) |
| CRYPTO | 언제나 | `ROLLING_24H` | 최근 24시간 |

**15:30에 `summaryScope`가 `PRE_MARKET`→`FULL`로 바뀌고 `summary` 문장도 하루 전체를 다룬 것으로 교체된다.** 08:45 배치에서 범위가 다른 요약 두 개를 만들어 두고 조회 시각에 따라 골라 준다. 클라이언트가 요약을 장기 캐시하면 15:30 이후에도 `PRE_MARKET` 문장을 보여주게 된다.

### `summaryStatus`

- `READY` — 요약 있음. `summary` 채워짐.
- `NOT_YET` — **주식만.** 09:00 이전 **또는** 재생세션 미준비. `summaryScope=null`, `summary=null`, `items=[]`. 재생세션 미준비일 때는 `originTradeDate`까지 `null`이다.
- `EMPTY` — 기사 0건 **또는 요약 행이 아직 없음**(배치 미실행·배포 당일). `summary=null`.
- `UNAVAILABLE` — LLM 호출 실패 **또는 후검증 재생성 1회 후에도 금지 표현이 남음**. `summary=null`.

**`items`가 채워질 수 있는 상태.** `READY`는 물론이고 **`EMPTY`가 "행 없음" 때문일 때와 `UNAVAILABLE`일 때도 `items`가 채워진다.** 즉 `summaryStatus !== 'READY'`라고 목록을 숨기면 안 된다. `EMPTY`의 두 원인(기사 0건 / 요약 행 없음)은 **응답 필드로 구분되지 않으므로 `items.length`로 판별한다** — `items.length === 0`이면 기사 0건, `> 0`이면 요약 행 없음.

**판정 순서는 spec §C-4의 표를 따른다.** 계약 문서는 순서 1·2번이 "재생세션 미준비 → 개장 전"임을 밝히고 3~6번의 내용은 언급만 한다(§C-4 표 자체는 이 레포에 없다 — **문서에 명시 없음**). 어느 값이든 상태코드는 200이다.

### 노출 필터

- 주식 — 09:00 이전이거나 재생세션이 `READY`가 아니면 `NOT_YET`이다. 개장 후에는 `publishedAt`이 **현재 재생 시각을 지난 기사만** 반환한다(전장 기사는 09:00으로 클램프). 15:00 기사를 09:30에 보여주지 않는다.
- 09:00 하한은 개장 전 브리핑과 동일하게 맞춘 것이다 — 이쪽에 하한이 없으면 08:41에 조회해 브리핑이 감추는 기사를 먼저 볼 수 있다.
- 공시는 발행시각이 `00:00:00`뿐이라 **날짜 조건으로 따로 판정한다.** 직전 거래일 접수분은 `PRE_MARKET`부터, **원본 거래일 당일 접수분은 `FULL`에서만** 나온다(spec §C-3).
- 코인 — 이 필터가 없고 조회 시각 기준 최근 24시간 기사를 반환한다.
- 다른 원본 거래일의 기사를 섞지 않는다(가격 방향과 기사 내용이 반대가 되므로).

### 정렬과 상한

- `items` — `publishedAt` **내림차순**, 동률은 `id` **내림차순**. 공시 발행시각이 전부 `00:00:00`이라 동률이 흔하다.
- 상한은 `feedback.news.max-items-per-news-list`(숫자는 문서에 명시 없음). 요약 프롬프트 상한(`max-items-per-summary`)과는 다른 값이다.
- 상한 초과 시 **공시를 먼저 채우고 남은 자리를 뉴스 최신순으로 채운다.** **절단과 정렬은 별개다** — 살아남은 항목의 순서는 위 정렬 그대로이고 **공시는 목록 아래쪽에 온다.**

### 코인 분기

- `originTradeDate = null`, `summaryScope = "ROLLING_24H"`, **`summaryStatus`가 `NOT_YET`이 되지 않는다** — '개장 전'도 재생 거래일도 없어 §C-4 판정 1·2번이 성립하지 않고 3~6번만 쓴다.
- `items`는 조회 시각 기준 최근 24시간 뉴스뿐이고 **노출 게이트가 없다.** 코인은 공시가 없어 `type`은 실질적으로 `NEWS`뿐이다.
- 요약은 **`generated_at` 최신 1행**을 본다("오늘 날짜 행"으로 찾으면 자정 직후와 배치 실패 시각마다 빈다).
- 갱신 주체는 **매시 05분 코인 배치**(`feedback.batch.crypto-cron`)이며 같은 행 UPSERT다.
- **`items`의 24시간 창은 조회 시각 기준이고 요약은 마지막 배치 기준이라 최대 65분 어긋나는데 허용된 동작이다.** 요약이 목록에 없는 기사를 언급할 수 있으므로 화면이 둘을 1:1로 연결하지 않는다.

요약은 회원별이 아니다 — `(종목, 원본 거래일, 범위)` 단위로 1건씩 생성해 전 회원이 공유한다.

### 오류

| 상태 | code | 트리거 |
|---|---|---|
| 401 | `UNAUTHORIZED` | 인증 실패 |
| 404 | `NOT_FOUND` | `instrumentId` 미존재 |

---

## 4. GET /api/market/briefing?market= (FEED-009)

시장 단위 개장 전 브리핑이다. 변동 원인 카드는 가격이 움직인 **뒤**를 설명해 매매 판단에 쓸 수 없고, 브리핑이 그 공백을 채운다 — **뉴스를 보고 매매하는 사용자의 진입점**이다.

### 요청

| 위치 | 이름 | 타입 | 필수 | 허용 값 |
|---|---|---|---|---|
| query | `market` | string | **필수** | `STOCK` \| `CRYPTO` 리터럴만 |

경로 변수·본문 없다. 기본값 없다 — 누락하면 400이다.

### 성공 응답 — 200 `MarketBriefingResponse`

```json
{
  "market": "STOCK",
  "originTradeDate": "2026-07-29",
  "status": "READY",
  "summary": "간밤 미국 증시에서 반도체 업종이 강세를 보였다는 보도가 있었습니다. …",
  "items": [
    {
      "instrumentId": 1,
      "symbol": "005930",
      "name": "삼성전자",
      "type": "NEWS",
      "title": "...",
      "publisher": "hankyung.com",
      "url": "https://...",
      "publishedAt": "2026-07-28T18:40:00"
    }
  ]
}
```

| 필드 | 타입 | null 가능 | 설명 |
|---|---|---|---|
| `market` | `"STOCK"` \| `"CRYPTO"` | X | 요청 값 에코 |
| `originTradeDate` | `LocalDate` | O | 주식 원본 거래일. **재생세션 미준비면 `null`**. 코인은 항상 `null` |
| `status` | `"READY"` \| `"NOT_YET"` \| `"EMPTY"` \| `"UNAVAILABLE"` | X | 필드 이름이 `summaryStatus`가 아니라 **`status`**다 |
| `summary` | string | O | `READY`가 아니면 `null` |
| `items` | array | X (빈 배열 가능) | **전 종목 합산 단일 목록** |
| `items[].instrumentId` | number | 문서에 명시 없음 | **브리핑에만 있다** — 화면이 추가 조회를 하지 않아도 되게 넣었다 |
| `items[].symbol` | string | 문서에 명시 없음 | 브리핑에만 있다 |
| `items[].name` | string | 문서에 명시 없음 | 브리핑에만 있다 |
| `items[].type` | `"NEWS"` \| `"DISCLOSURE"` | 문서에 명시 없음 | |
| `items[].title` | string | 문서에 명시 없음 | |
| `items[].publisher` | string | 문서에 명시 없음 | 뉴스는 도메인, 공시는 `DART` |
| `items[].url` | string | 문서에 명시 없음 | |
| `items[].publishedAt` | `LocalDateTime` | 문서에 명시 없음 | 공시는 `00:00:00` |

`items[]`에 `id`는 없다(뉴스 목록과 같다). `summaryScope`에 해당하는 필드는 브리핑에 **없다** — 범위가 항상 `전장` 하나이기 때문이다.

**`items`는 저장하지 않고 조회 시 같은 구간 질의로 다시 만든다.** 요약만 저장된다.

### `status`

- `READY` — 요약 있음.
- `NOT_YET` — **주식만.** **세션은 준비됐고 09:00 이전**일 때. `summary=null`, `items=[]`, `originTradeDate`는 날짜가 채워진다.
- `EMPTY` — 기사 0건, **재생세션 미준비**, 또는 브리핑 행이 아직 없음. `summary=null`. 재생세션 미준비면 `originTradeDate=null`.
- `UNAVAILABLE` — LLM 호출 실패 또는 후검증 재생성 1회 후에도 금지 표현이 남음.

**뉴스 목록과의 의도된 차이 — 재생세션 미준비의 상태값이 다르다.** 뉴스 목록(FEED-008)은 `summaryStatus="NOT_YET"`, 브리핑(FEED-009)은 `status="EMPTY"`다. 계약 문서와 라우트 문서가 둘 다 "Part C와 의도된 차이"라고 명시했다. **공통 처리 함수로 묶으면 이 차이가 지워진다.**

**판정 순서는 spec §C-4 표를 따른다** — 00:00~08:40처럼 두 조건(세션 미준비 + 개장 전)이 동시에 성립하는 구간이 있다. §C-4 표는 이 레포에 없어 **행 순서는 문서에 명시 없음**이지만, 브리핑에서 미준비가 `EMPTY`로 나오는 것으로 보아 미준비 판정이 개장 전 판정보다 앞선다.

**`items`가 채워질 수 있는 상태** — `READY` 외에 **`EMPTY`가 "행 없음" 때문일 때와 `UNAVAILABLE`일 때 `items`가 채워진다**("요약이 없어도 기사 목록 자체는 쓸모가 있다"). `EMPTY`이지만 `items.length > 0`이면 "요약만 없음"으로 렌더한다.

어느 값이든 상태코드는 200이다.

### 범위 (주식)

**spec §C-2의 `전장` 구간 기사·공시만 담는다. 장중 기사는 어떤 경우에도 포함하지 않는다.** 재생 방식이라 그날 장중 뉴스를 아침에 노출하면 오후에 무엇이 일어날지 미리 알려주는 셈이 된다. 장중 기사는 `GET /api/instruments/{id}/news`에서 재생 시각을 따라 하나씩 공개된다. 09:00 하한은 Part C(뉴스 목록)와 동일하다.

공시는 **직전 거래일 접수분만** 브리핑에 들어간다(원본 거래일 당일 접수분은 뉴스 목록의 `FULL`에서만).

### 정렬과 상한

- `items` — `publishedAt` **내림차순**, 동률은 `id` **내림차순**.
- 상한은 `feedback.news.max-items-per-briefing`(숫자는 문서에 명시 없음). 프롬프트 상한(`max-items-per-summary`)과 다른 값이다.
- 상한 초과 시 **공시를 먼저 채우고 남은 자리를 뉴스 최신순**으로 채운다. **이 규칙이 가장 세게 걸리는 자리가 브리핑이다** — 전 종목 합산 단일 목록이라 종목당 2건만 쌓여도 상한을 넘고, 공시는 `00:00:00`이라 내림차순 최하위여서 규칙이 없으면 상시 전멸한다.
- **절단과 정렬은 별개다** — 살아남은 항목의 순서는 위 정렬 그대로이고 **공시는 목록 아래쪽에 온다.** 즉 화면 상단은 뉴스, 하단은 공시가 되는 것이 정상이다.

### 코인 분기

- `market=CRYPTO`는 **허용 리터럴이라 400이 아니다.**
- 재생세션과 무관하게 `originTradeDate = null`이고 **`status`가 `NOT_YET`이 되지 않는다.** 재생세션이 `READY`가 아니어도 `EMPTY`가 되지 않는다.
- `items`는 조회 시각 기준 최근 24시간 코인 뉴스뿐이고 노출 게이트가 없다(코인은 공시가 없다).
- 브리핑 요약은 **`generated_at` 최신 1행**을 본다.
- 생성 주체가 다르다 — 주식은 08:45 개장 전 배치, 코인은 **매시 05분 코인 배치**(`feedback.batch.crypto-cron`).

요약은 회원별이 아니다 — `(시장, 원본 거래일)` 단위로 1건(`UNIQUE(market, origin_trade_date)`)이며 전 회원이 공유한다.

### 오류

| 상태 | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `market` 누락 |
| 400 | `VALIDATION_ERROR` | `market`이 `STOCK`·`CRYPTO` 외 리터럴 |
| 401 | `UNAUTHORIZED` | 인증 실패 |

404는 문서에 없다(경로에 리소스 ID가 없다).

---

## 상태값 → 화면 매핑 표

| Endpoint | 필드 | status value | 의미 | 화면에 뭘 그려야 하는지 |
|---|---|---|---|---|
| price-moves | (없음) `originTradeDate` + `moves` | `originTradeDate` 있음 · `moves.length>0` | 정상 | 카드 목록을 `windowStart` 오름차순 그대로 |
| price-moves | 동일 | `originTradeDate` 있음 · `moves=[]` | 주식, 아직 열린 카드 없음(주로 오전) | "아직 공개된 변동 원인이 없습니다. 장이 진행되면 순서대로 열립니다" — 오류 아님 |
| price-moves | 동일 | `originTradeDate=null` · `moves=[]` · 주식 | 재생세션 미준비 | "장 준비 중입니다" 안내. 재조회 유도. 오류 아님 |
| price-moves | 동일 | `originTradeDate=null` · 코인 | 코인 정상(24h 롤링) | 날짜 라벨 없이 카드 목록. `originTradeDate=null`을 오류로 처리하지 말 것 |
| post-sell | `postSellFlow.status` | `NOT_YET` | 그 체결의 서비스 날짜 15:30 전 | "장 마감 후 다시 확인" 안내. 종가·매도후고가 자리를 빈 값으로 렌더하지 말 것 |
| post-sell | `postSellFlow.status` | `READY` | 열림 | `closePrice`·`closeAt`·`sellToCloseRate`·`postSellHighPrice`·`postSellHighAt` 표시 |
| post-sell | `postSellFlow` | `null` | `sameSessionCompleted=false` | 섹션 자체를 숨기고 "여러 거래일에 걸친 매매라 보유 구간 분석이 없습니다" 안내 |
| post-sell | `counterfactuals.status` | `NOT_YET` | 15:30 전 | "장 마감 후 다시 확인". 반사실 표 자체를 미노출 |
| post-sell | `counterfactuals.status` | `READY` | 열림 | `atClose`·`atHoldHigh`·`atFirstMoveAfterBuy` 3행 + 실제(`sellAt`·`returnRate`) 행. 라벨은 사실형("종가 기준") |
| post-sell | `counterfactuals` | `null` | `sameSessionCompleted=false` | 섹션 숨김 |
| post-sell | `peerComparison.status` | `READY` | 표본 5건 이상 | `holderCount`·`soldWithin30MinRate`·`medianMinutesToSell`·`yourMinutesToSell` 비교 표시 |
| post-sell | `peerComparison.status` | `INSUFFICIENT_SAMPLE` | `holderCount` 5 미만 | 모집단 3개 지표를 숨기고 **`yourMinutesToSell`만** 표시 + "비교 표본이 부족합니다" |
| post-sell | `peerComparison.status` | `NO_EVENT` | 보유 구간에 변동 카드 0건 | 섹션 숨김 또는 "이 구간에 비교할 변동 이벤트가 없습니다". **모든 필드가 `null`이라 `priceMoveId`도 없다** |
| post-sell | `peerComparison.status` | `NOT_YET` | 확정 집계 행이 아직 없음 | "장 마감 후 다시 확인". `postSellFlow`가 `READY`인데 여기만 `NOT_YET`일 수 있다 |
| post-sell | `peerComparison` | `null` | `sameSessionCompleted=false` | 섹션 숨김 |
| post-sell | `narrativeStatus` | `READY` (항상) | 서술 있음 | `narrative` 그대로. 분기 UI 불필요. `narrativeSource`로 LLM/TEMPLATE 배지를 붙일지는 선택 |
| news | `summaryStatus` | `READY` | 요약 + 목록 | `summary` 문단 + `items` 목록 |
| news | `summaryStatus` | `NOT_YET` | 주식, 09:00 이전 **또는** 재생세션 미준비 | "개장 후 공개됩니다" / 미준비면 "장 준비 중". `originTradeDate=null` 여부로 두 원인을 구분한다 |
| news | `summaryStatus` | `EMPTY` + `items=[]` | 해당 구간 기사 0건 | "이 구간에 뉴스·공시가 없습니다" |
| news | `summaryStatus` | `EMPTY` + `items.length>0` | 요약 행 없음(배치 미실행) | **목록은 그린다.** 요약 영역만 "요약을 준비 중입니다" |
| news | `summaryStatus` | `UNAVAILABLE` | LLM 실패 또는 후검증 위반 | **목록은 그린다.** 요약 영역만 "요약을 제공할 수 없습니다" |
| news | `summaryScope` | `null` | `NOT_YET`과 동시 발생 | 범위 배지 미표시 |
| news | `summaryScope` | `PRE_MARKET` | 09:00~15:30 주식 | "개장 전 기준" 배지 |
| news | `summaryScope` | `FULL` | 15:30 이후 주식 | "하루 전체 기준" 배지. 15:30 넘으면 재조회해서 배지·문장이 바뀌어야 한다 |
| news | `summaryScope` | `ROLLING_24H` | 코인 | "최근 24시간 기준" 배지 |
| briefing | `status` | `READY` | 요약 + 목록 | `summary` 문단 + 종목명 붙은 `items` 목록 |
| briefing | `status` | `NOT_YET` | 주식, 세션 준비됨 + 09:00 이전 | "개장 시각에 공개됩니다". `originTradeDate`는 있으므로 날짜 표시 가능 |
| briefing | `status` | `EMPTY` + `originTradeDate=null` | 재생세션 미준비 | "장 준비 중입니다". **뉴스 목록은 같은 상황에서 `NOT_YET`이다 — 분기를 공유하지 말 것** |
| briefing | `status` | `EMPTY` + `items=[]` + `originTradeDate` 있음 | 기사 0건 | "개장 전 확인된 소식이 없습니다" |
| briefing | `status` | `EMPTY` + `items.length>0` | 브리핑 행 없음 | **목록은 그린다.** 요약 영역만 준비 중 |
| briefing | `status` | `UNAVAILABLE` | LLM 실패 또는 후검증 위반 | **목록은 그린다.** 요약 영역만 제공 불가 |

---

## 프론트 구현 시 함정

1. **모든 "안 됨" 상태가 200이다.** 이 도메인에서 4xx는 인증·권한·미존재·잘못된 파라미터·코인 post-sell뿐이다. 개장 전, 재생세션 미준비, 기사 0건, 요약 행 없음, 서술 실패, 카드 0건은 전부 200이며 `apiClient` 오류 경로로 흐르지 않는다. **로딩→에러→데이터 3분기 UI로는 부족하고 상태 enum 분기가 필요하다.**

2. **`price-moves`만 status 필드가 없다.** 나머지 셋은 `summaryStatus`/`status`가 있는데 이것만 `originTradeDate`+`moves.length` 조합으로 추론해야 한다. 그리고 `originTradeDate=null`은 "재생세션 미준비"와 "코인" 둘 다이므로, **`instrumentService`의 캐시로 `market`을 먼저 알아야 문구를 고를 수 있다.**

3. **뉴스 목록과 브리핑의 상태 필드 이름이 다르다.** `summaryStatus` vs `status`. 공통 타입으로 묶으려면 이름을 정규화해야 한다.

4. **재생세션 미준비의 상태값이 두 엔드포인트에서 다르다.** 뉴스는 `NOT_YET`, 브리핑은 `EMPTY`다. 문서가 "의도된 차이"라고 못 박았으므로 하나로 통일하는 헬퍼를 만들면 버그다.

5. **`EMPTY`의 두 원인을 `items.length`로만 구분한다.** 응답에 원인 필드가 없다. `EMPTY` + `items.length>0`이면 "요약만 없음"이라 **목록은 반드시 그려야 한다.** `UNAVAILABLE`도 같다. `status !== 'READY'`면 통째로 빈 상태를 그리는 구현이 가장 흔한 버그다.

6. **`postSellFlow`/`counterfactuals`/`peerComparison`이 `null`인 것과 `status="NOT_YET"`인 것은 다른 상태다.** `null`은 `sameSessionCompleted=false`(영구히 계산 불가 → 섹션 숨김), `NOT_YET`은 15:30 전(나중에 채워짐 → 재방문 유도). 옵셔널 체이닝으로 뭉개면 두 경우가 같은 빈 카드로 렌더된다.

7. **`sameSessionCompleted=false`에서 `priceMoves`만 `[]`이고 나머지는 `null`이다.** 배열/객체 처리를 하나로 묶을 수 없다.

8. **`holdingMinutes`는 `sameSessionCompleted`의 nullable 목록에 없다.** `false`여도 대부분 값이 있고, **`sellAt < buyAt` 역전인 경우에만** `null`이다. `sameSessionCompleted`으로 `holdingMinutes` 렌더를 가드하면 정상 cross-session 매매에서 값을 잃는다.

9. **`peerComparison`은 상태가 3종이 아니라 4종이다.** `NO_EVENT`·`INSUFFICIENT_SAMPLE`·`READY` 외에 **`NOT_YET`**이 있다(계약 문서 733행). 판정 축도 시각이 아니라 확정 집계 행의 존재이므로, **`postSellFlow.status==='READY'`인데 `peerComparison.status==='NOT_YET'`인 중간 상태가 실제로 존재한다**(장 마감 배치가 게이트 시각보다 늦게 돈다). 두 섹션을 하나의 게이트 boolean으로 묶으면 이 구간에서 빈 표가 나온다.

10. **`INSUFFICIENT_SAMPLE`에서 `yourMinutesToSell`은 살아 있다.** 모집단 3개 지표(`holderCount`·`soldWithin30MinRate`·`medianMinutesToSell`)만 `null`이다. 전체를 숨기면 본인 값을 잃는다.

11. **`NO_EVENT`에서는 `priceMoveId`까지 `null`이다.** 기준 카드를 하이라이트하려고 `priceMoveId`로 `priceMoves`를 찾는 코드가 `null` 인덱싱으로 터진다. 그리고 카드 0건은 드문 케이스가 아니라 **흔한 경우**라고 문서가 명시한다.

12. **반사실은 배열이 아니라 고정 키 3개 객체다.** `atClose`·`atHoldHigh`·`atFirstMoveAfterBuy`. `.map()`을 기대하고 타입을 만들면 안 되고, 표시 순서는 클라이언트가 정한다(문서에 순서 규정 없음).

13. **반사실 `returnRate`는 수수료를 다시 계산한 값이다.** `(시나리오가격 − 매수가) / 매수가` 같은 식으로 클라이언트에서 재계산하면 서버 값과 어긋난다. 절대 재계산하지 말고 서버 값을 쓴다.

14. **반사실 라벨에 가정법을 쓰면 안 된다.** 서버가 서술에서 가정법을 금지한 이유가 그대로 화면에도 적용된다. "안 팔았다면 -1.17%" 대신 "종가 기준 -1.17%"처럼 사실형으로 쓴다.

15. **`buyAt`은 매수 체결 시각이 아니라 배분된 lot 중 가장 이른 체결 시각이다.** 화면에 "매수 시각"이라고만 쓰면 여러 lot에 배분된 매도에서 사용자가 자기 거래내역과 대조하다 혼란을 겪는다. 그리고 이 값이 `holdingMinutes`·`buyToNewsMinutes`·`minutesAfterBuy`·반사실 기준을 전부 결정한다.

16. **`buyAt`·`sellAt`은 "오늘"이 아니라 원본 거래일 축이다.** 날짜를 그대로 표시하면 사용자가 실제 매매한 서비스 날짜와 다른 날짜를 본다. 시각만 표시하거나 "원본 거래일" 라벨을 함께 붙인다. `price-moves`의 `windowStart`·`windowEnd`, `postSellFlow.closeAt`도 같다.

17. **분 단위 값을 클라이언트에서 계산하지 말 것.** 서버는 두 끝점을 분으로 내린 뒤 뺀다. `buyAt`·`sellAt`은 초를 포함하므로 `(sellAt - buyAt)/60000`은 서버 `holdingMinutes`와 1분 어긋날 수 있다.

18. **`returnRate`·`changeRate`·`sellVsHighRate`·`sellVsLowRate`·`sellToCloseRate`·`soldWithin30MinRate`는 전부 비율이지 퍼센트가 아니다.** `src/lib/datetime.ts`의 `ratioToPercent`를 통과시킨 뒤 `src/lib/format.ts`의 `formatPercent`에 넣는다. `formatPercent`에 비율을 바로 넣으면 -1.82%가 "-0.0%"로 나온다. `formatPercent`는 소수 1자리 고정이라 -1.82%가 "-1.8%"가 되는 점도 감안한다.

19. **`soldWithin30MinRate` 예시는 `0.38`이다.** 다른 rate와 달리 scale-4가 아니라 소수 2자리로 보이지만 여전히 비율이다. `changeRate`·`soldWithin30MinRate`의 scale을 명시한 문장은 문서에 없다 — **예시로만 확인된다.**

20. **`summaryScope`는 15:30에 바뀐다.** `PRE_MARKET` 요약을 캐시해 두면 15:30 이후에도 낡은 문장을 보여준다. 15:30 경계에 재조회 트리거가 필요하다.

21. **`post-sell`의 `narrative`도 바뀔 수 있다.** `postSellFlow` `READY` + `peerComparison` 확정 이후 첫 조회에서 재생성된다. 서술을 영구 캐시하면 매도 후 흐름·집단 비교가 빠진 문장이 굳는다.

22. **코인 `post-sell`은 400이다.** 코인 매도 체결에 이 화면 링크를 노출하면 400을 맞는다. **`market`으로 진입점 자체를 가드해야 한다.** 매수 체결(`side=BUY`)도 400이다 — 두 경우 모두 같은 `VALIDATION_ERROR` 코드라 `code`만으로 원인을 구분할 수 없다.

23. **뉴스 `items[]`에 `id`가 없다.** React key로 쓸 안정적 식별자가 없어 `url`(또는 `url`+`publishedAt`)을 key로 써야 한다. 인덱스를 key로 쓰면 재조회 시 항목이 섞인다.

24. **`items[]`에 종목 정보가 있는 것은 브리핑뿐이다.** 뉴스 목록에는 `instrumentId`·`symbol`·`name`이 없다(이미 종목 단위 조회이므로). 두 응답의 item 타입을 하나로 합치면 브리핑 전용 3필드가 optional이 되어 브리핑에서 실수로 누락하기 쉽다.

25. **공시가 목록 아래쪽에 몰리는 것이 정상이다.** `publishedAt`이 `00:00:00`이라 내림차순 최하위다. "정렬이 깨진 것 같다"고 클라이언트에서 재정렬하면 서버 절단 규칙(공시 우선 확보)의 의도가 무너진다. 절단과 정렬은 별개다.

26. **`sources`는 절대 빈 배열이 아니다** — 근거 없는 카드는 만들지 않는다. 반대로 `moves`/`items`는 빈 배열이 정상 상태다.

27. **`narrative`는 항상 채워진다.** `price-moves`의 카드 `narrative`, `post-sell`의 `narrative` 모두 템플릿 대체가 있어 비지 않는다. 빈 문자열 방어보다 `narrativeSource`가 `TEMPLATE`일 때의 문장 품질(짧고 건조함)을 감안한 레이아웃이 필요하다.

28. **`publisher`가 한글 언론사명이 아니라 도메인이다** (`hankyung.com`). 오타가 아니라 계약이다. 화면에 그대로 노출할지, 클라이언트 매핑 테이블을 둘지 결정해야 한다(백엔드 한글 매핑은 후속 이슈).

29. **`revealTime`·`eventType`(post-sell 내부 카드)·`id`(news/briefing items)는 응답에 없다.** 서버 내부 값을 화면에서 쓰려는 설계를 세우지 말 것.

30. **`parseLocalDateTime`을 반드시 쓴다.** 이 도메인의 모든 시각 필드는 오프셋 없는 `LocalDateTime`이다. `new Date("2026-07-29T11:20:00")`은 브라우저마다 UTC로 해석될 수 있어 9시간 어긋난다.

---

## 프론트 코드 현황과 갭

읽은 파일 — `src/services/types.ts`, `src/services/tradeService.ts`, `src/services/instrumentService.ts`, `src/lib/datetime.ts`, `src/lib/format.ts`.

### 아직 없는 것

- **AI 피드백 타입이 하나도 없다.** `src/services/types.ts`에 `PriceMoveListResponse`·`PostSellFeedbackResponse`·`InstrumentNewsResponse`·`MarketBriefingResponse` 및 그 하위 타입이 전부 없다. `src/services/` 아래 `feedbackService.ts`/`aiService.ts`도 없고(`accountService`·`authService`·`communityService`·`holdingService`·`instrumentService`·`orderService`·`tradeService`뿐), `src` 전체에 `price-moves`·`post-sell`·`briefing`·`summaryStatus` 문자열이 하나도 없다. 즉 이 도메인은 **완전 신규 구현**이다.

### 재사용할 헬퍼

- `src/lib/datetime.ts` — `parseLocalDateTime`(필수), `formatHhMm`(카드 `windowStart`·`windowEnd`, `holdHighAt` 등 시각 표시에 적합), `formatDateTime`, `ratioToPercent`(모든 rate 필드에 필수).
- `src/lib/format.ts` — `formatKRW`(가격), `formatManEok`/`formatPnl`(`realizedPnl`), `formatPercent`(비율 변환 **후**), `pnlTone`(반사실 표의 부호 색상).
- `src/services/instrumentService.ts` — `ensureInstrumentCache`/`getCachedInstrument`로 `instrumentId` → `market` 판정. **`price-moves`의 `originTradeDate=null` 해석과 `post-sell` 진입점 가드에 필수다.** `post-sell`·브리핑 `items`는 `symbol`·`name`을 자체 포함하므로 표시용 조인은 필요 없다.
- 기존 타입 별칭 `LocalDateTimeString`·`LocalDateString`·`Decimal`·`ApiErrorEnvelope`·`Market`을 그대로 쓴다.

### 발견한 불일치 (이 도메인과 직접 관련)

- `types.ts:19` — `Decimal` 주석이 "같은 값이 엔드포인트마다 다른 scale로 온다, 문자열 비교 금지"라고 적혀 있다. 이 도메인의 rate 필드에도 적용된다. `changeRate === -0.0182` 같은 등치 비교를 쓰지 말고 부호·구간 비교만 한다.
- `format.ts:35` — `formatPercent`가 `toFixed(1)` 고정이다. `changeRate`는 scale-4라 -1.82%가 "-1.8%"로 잘린다. 변동 원인 카드처럼 소수 둘째 자리가 의미 있는 곳(서버 `narrative`가 "1.82% 하락"이라 적는다)은 **서술 문장과 숫자 배지가 어긋난다.** 표시 자리수를 파라미터화하거나 별도 포매터가 필요하다.
- `types.ts:172-174` — `OrderType`이 `'MARKET'`만, `OrderStatus`가 `'FILLED'`만이고 "지정가·미체결 주문 개념은 없다"고 적혀 있는데, `api-routes.md`에는 `POST /api/orders/limit`·`PENDING` 상태가 있다. 이 도메인 밖이지만 **`types.ts`가 백엔드보다 낡았다는 신호**이므로, AI 피드백 타입을 추가할 때 기존 주석을 근거로 삼지 말고 계약 문서를 근거로 삼는다.
- `types.ts:305` — 댓글 주석이 "대댓글 없음"인데 `api-routes.md`는 `replies` 중첩을 명시한다. 위와 같은 낡음 신호다.
- `holding`·`accountSummary`의 `returnRate`에 대해서는 "scale-4 비율, ×100 필수"라는 주석이 이미 있다(`types.ts:254`, `datetime.ts:27`). AI 피드백의 rate 필드도 **같은 관례를 따르므로 새 변환 함수를 만들지 않고 `ratioToPercent`를 재사용한다.**

---

# 정정 — spec.md 정본 확인분 (오케스트레이터 추가, 2026-08-08)

이 문서를 처음 쓸 때 `docs/specs/012-ai-feedback/spec.md`가 로컬에 없어 §C-4·C-5를
"문서에 명시 없음"으로 남겼다. 이후 upstream에서 받아 확인했다 —
정본은 `.backend-docs/upstream/012-ai-feedback-spec.md`이며 아래가 그 내용이다.

## 정정 1 — `peerComparison.status`는 3상태가 아니라 4상태다

작업 지시가 3종(`NO_EVENT`·`INSUFFICIENT_SAMPLE`·`READY`)이라고 한 것은 **지시가 틀렸다**.
spec.md:332 기준 열거형 `PostSellFeedbackStatus`는 4종이고,
`postSellFlow.status`·`counterfactuals.status`·`peerComparison.status`·`narrativeStatus`가
이 하나를 공유한다. 자리마다 나올 수 있는 값의 범위가 다른 것은 판정 로직 차이이지 타입 차이가 아니다.

| 값 | `peerComparison`에서 언제 |
|---|---|
| `NO_EVENT` | 보유 구간 변동 카드 0건. `priceMoveId` 포함 **전 필드 `null`**. **1순위로 판정한다** |
| `INSUFFICIENT_SAMPLE` | 행 있고 `holderCount < 5`. 모집단 지표 3종 `null`, `yourMinutesToSell`은 채움 |
| `READY` | 행 있고 `holderCount >= 5` |
| `NOT_YET` | 그 밖 (장 마감 배치 전) |

`NO_EVENT`를 1순위로 두는 이유는, 기준 카드가 없으면 확정 집계 행이 애초에 생기지 않아
행 존재만 보면 영원히 `NOT_YET`이 되기 때문이다.

`narrativeStatus`는 **`READY` 뿐**이다 — 템플릿 폴백이 있어 서술이 비지 않으므로
`UNAVAILABLE`이 존재하지 않는다.

## 정정 2 — Part C·D `status` 판정 순서 (확정)

두 조건이 동시에 성립하는 구간이 있으므로 순서를 그대로 따른다.

| 순서 | 조건 | 결과 |
|---|---|---|
| 1 | 재생세션 미준비 (주식) | Part C `NOT_YET` / Part D `EMPTY`, `originTradeDate=null` |
| 2 | 09:00 이전 (주식) | `NOT_YET`, `originTradeDate` **채움** |
| 3 | 대상 기사·공시 0건 | `EMPTY`, `items=[]` |
| 4 | 행이 없다 | `EMPTY`, **`items`는 채운다** |
| 5 | 행이 있고 `summary`가 `NULL` | `UNAVAILABLE`, **`items`는 채운다** |
| 6 | 그 외 | `READY` |

1번에서 Part C가 `NOT_YET`, Part D가 `EMPTY`인 것은 **의도된 차이**다 —
Part D는 "브리핑이 아예 없는 날"이 정상이고 Part C는 "아직 열리지 않았다"가 맞다.
공통 헬퍼로 묶으면 버그가 된다.

`summaryStatus`(Part C) 값별 의미도 확정됐다.

| 값 | 언제 |
|---|---|
| `READY` | 요약 행 있고 `summary` 있음 |
| `NOT_YET` | 주식, 09:00 이전 **또는** 재생세션 미준비 |
| `EMPTY` | 기사 0건, **또는 요약 행 없음**(배치 미실행·배포 당일) |
| `UNAVAILABLE` | 행 있고 `summary`가 `NULL`(LLM 실패 또는 후검증 재생성 후에도 위반) |

**4·5번에서 `items`가 채워진다**는 점이 여전히 최대 함정이다.
`status !== 'READY'`로 통째로 빈 상태를 그리면 목록을 잃는다.

## 정정 3 — C-5 노출 게이트 (확정)

| 대상 | 게이트 |
|---|---|
| 카드 (주식) | `(서비스 날짜 + reveal_time) <= now()` |
| 카드 (코인) | **없음** (`reveal_time`이 `NULL`) |
| Part C `items` (주식) | `(서비스 날짜 + clamp(published_at)) <= now()` |
| Part C 요약 · Part D (주식) | 09:00 이후 |
| `postSellFlow` · `counterfactuals` | `now() >= (그 매도 체결의 서비스 날짜) 15:30` |
| `peerComparison` | **확정 집계 행 존재 (시각 아님)** |
| 서술 재생성 | `postSellFlow`가 `READY` **이고** `peerComparison.status != NOT_YET` |

**"오늘 15:30"이 아니라 "그 체결의 서비스 날짜 15:30"이다.** 오늘로 잡으면 어제 판 체결을
오늘 오전에 열었을 때 `READY`였던 값이 `NOT_YET`으로 되돌아간다.

## 정정 4 — 중간 상태가 실존한다 (프론트 설계에 직결)

`postSellFlow`·`counterfactuals`는 **시각** 게이트, `peerComparison`은 **행 존재** 게이트다.
축이 다르므로 장 마감 배치가 15:30 게이트보다 늦게 돌면
`postSellFlow=READY` + `peerComparison=NOT_YET` 구간이 실제로 존재한다
(spec.md:1366이 "15:31에 조회하면 `peerComparison.status=NOT_YET`"으로 명시).

→ **두 섹션을 하나의 boolean 게이트로 묶으면 그 구간에 빈 표가 나온다.**
반드시 섹션별 `status`를 각각 읽어 따로 렌더한다.

## 정정 5 — 서술은 "한 번 지나가면 끝"이 아니다

재생성 게이트는 **재생성이 성공할 때만** 닫힌다. 성공 시 `narrative_finalized=TRUE`,
실패(템플릿 대체)면 `FALSE`로 남아 다음 조회에서 상한(`max-narrative-retry`) 이내면 다시 시도한다.
또 재생성 게이트는 `NO_EVENT`·`INSUFFICIENT_SAMPLE`도 확정으로 친다 —
"행 존재"로만 두면 카드 0건인 흔한 경우에 매도 후 흐름이 반영된 서술이 영원히 안 만들어진다.

→ 프론트 함의: **같은 `tradeId`를 다시 조회하면 `narrative` 문장이 바뀔 수 있다.**
서술을 로컬에 영구 캐시하지 않는다.

## 참고 — spec 024는 프론트 영향이 없다

`docs/specs/024-feedback-query-cache`(이슈 #245)가 upstream에 새로 있다. FEED-008·009의
조회 성능 개선(Redis 캐시 + 분산 락)이며 **"두 경로의 응답 계약은 한 글자도 바뀌지 않는다"**(ADR-0015)고
명시돼 있다. 시각 의존 `items`는 의도적으로 캐시 대상에서 제외됐다. PRD 구현 현황 표에도 올리지 않는 변경이다.
→ 프론트는 이 spec을 고려할 필요가 없다.
