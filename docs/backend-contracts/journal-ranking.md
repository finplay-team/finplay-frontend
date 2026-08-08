<!-- 투자일기(JOUR-001~006)·랭킹(RANK-001~002) API 계약을 프론트 구현용으로 정리한 문서 -->

# 투자일기 · 랭킹 API 계약 (JOUR-001~006, RANK-001~002)

출처는 `.backend-docs/api-contracts.md`의 `## journal`·`## ranking` 절(441~536행)과 `.backend-docs/api-routes.md`(51~57, 67~68행), 공통 규칙은 `.backend-docs/conventions.md`다. 이 문서는 그 내용을 프론트 구현 기준으로 재정리한 것이며, 문서에 없는 것은 추측하지 않고 "문서에 명시 없음"으로 적었다.

## 0. 공통 사항

- 인증은 전 엔드포인트 **Access Bearer 필수**다(`Authorization: Bearer <accessToken>`). 인증 실패는 401 `UNAUTHORIZED`.
- 본문이 있는 요청(POST·PATCH)은 `Content-Type: application/json`이다.
- 성공 응답은 봉투 없는 bare JSON이다(기존 `src/services/types.ts` 주석과 동일한 규칙).
- 오류 응답은 전역 핸들러가 통일한 공통 형식이다.
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "...", "requestId": "..." } }
  ```
- 시각 필드(`createdAt`·`updatedAt`)는 오프셋 없는 `LocalDateTime` 문자열이다. 예: `"2026-08-04T10:12:33"`. 파싱은 `src/lib/datetime.ts`의 `parseLocalDateTime`을 쓴다.
- `market` 파라미터는 `STOCK` | `CRYPTO` 리터럴만 허용한다. 누락이나 그 외 값(예: `FOREX`)은 400 `VALIDATION_ERROR`.
- 이 도메인 응답에는 **scale-4 비율 필드가 하나도 없다**. `returnRate`류 필드가 없고, 랭킹 `realizedPnl`은 금액이다. `ratioToPercent`를 적용할 대상이 없다.
- 모든 숫자 필드(체결 ID·`journalId`·`rank`·`realizedPnl`)는 JSON **숫자**다. 문자열로 내려오는 필드는 문서에 없다.

---

## 1. GET /api/journal — 투자일기 목록 조회 (JOUR-006, Issue #203)

### 요청

| 항목 | 내용 |
|---|---|
| Method·URL | `GET /api/journal` |
| 헤더 | `Authorization: Bearer <access>` 필수 |
| `market` | **필수**. `STOCK` \| `CRYPTO` |
| `cursor` | 선택. `{createdAt}_{tradeId}` 형식 문자열. 생략 시 첫 페이지 |
| `limit` | 선택. 기본 20, 허용 범위 1~100. **클램핑 없음 — 범위 밖은 400** |
| 본문 | 없음 |

조회 대상은 요청으로 지정하지 않는다. Access Token의 인증 사용자 본인이 소유한 해당 시장 계좌(`AccountService.getAccountFor`로 소유권 + 시장 스코프 검증)의 회고만 돌려준다.

### 성공 응답 (200)

`JournalListResponse` — wrapper 3필드는 형제 API(`GET /api/trades`, `GET /api/orders`)와 동일한 `content`·`nextCursor`·`hasNext`다.

```json
{
  "content": [
    {
      "journalType": "SELL",
      "buyTradeId": null,
      "sellTradeId": 34,
      "content": "목표가 도달해서 전량 매도.",
      "createdAt": "2026-08-04T15:20:41",
      "updatedAt": "2026-08-04T15:20:41"
    },
    {
      "journalType": "BUY",
      "buyTradeId": 12,
      "sellTradeId": null,
      "content": "실적 발표 전 분할 매수.",
      "createdAt": "2026-08-04T10:12:33",
      "updatedAt": "2026-08-05T09:03:12"
    }
  ],
  "nextCursor": "2026-08-04T10:12:33_12",
  "hasNext": true
}
```

항목 필드는 **6개로 고정**이다.

| 필드 | 타입 | 비고 |
|---|---|---|
| `journalType` | `"BUY"` \| `"SELL"` | 정확히 이 두 리터럴. 대문자 |
| `buyTradeId` | number \| null | `journalType === "BUY"`일 때만 값. `SELL` 항목은 `null` |
| `sellTradeId` | number \| null | `journalType === "SELL"`일 때만 값. `BUY` 항목은 `null` |
| `content` | string | 원문. 트림하지 않은 상태로 저장된 값 |
| `createdAt` | LocalDateTime 문자열 | 회고를 처음 쓴 시각 |
| `updatedAt` | LocalDateTime 문자열 | 수정 안 했으면 `createdAt`과 같은 값 |
| `nextCursor` | string \| null | 다음 페이지 커서 |
| `hasNext` | boolean | |

빈 목록도 오류가 아니다. 회고가 없으면 200 `{"content":[],"nextCursor":null,"hasNext":false}`.

### 매수·매도 항목 구분 방법 (중요)

- 통합 `journalId`는 **목록 응답에 노출되지 않는다**. JOUR-005가 확정한 타입별 경로 체계를 선점하지 않기 위한 의도적 결정이다.
- 항목의 식별자는 `journalType` + 해당 타입의 체결 ID다. 즉 `("BUY", buyTradeId)` 또는 `("SELL", sellTradeId)` 쌍이 유일 키다.
- React key로 쓸 값은 `journalId`가 아니라 `` `${journalType}-${buyTradeId ?? sellTradeId}` ``처럼 조합해야 한다.
- 상세·수정 경로도 이 체결 ID를 그대로 쓴다. `journalType`이 `BUY`면 `/api/journal/buy/{buyTradeId}`·`PATCH /api/trades/{buyTradeId}/journal`, `SELL`이면 `/api/journal/sell/{sellTradeId}`·`PATCH /api/trades/{sellTradeId}/sell-journal`.
- 종목·가격·수량·실현손익 등 체결 정보는 이 응답에 **없다**. 종목명 등이 필요하면 `GET /api/trades`(및 `instrumentService` 캐시)와 `tradeId`로 조인해야 한다.

### 정렬 보장

- 1차 키: `createdAt` **내림차순**(회고를 처음 쓴 시점).
- 2차 키(동시각 타이브레이커): **체결 ID 내림차순**.
- `updatedAt` 기준 정렬이 아니다 — 방금 수정한 오래된 회고가 목록 맨 위로 튀지 않는다. 최근 수정 순 정렬이 필요하면 클라이언트가 직접 해야 한다.
- 주의: 타이브레이커의 "체결 ID"는 매수 회고면 `buyTradeId`, 매도 회고면 `sellTradeId`다. 두 시퀀스가 별개이므로 서로 다른 테이블의 ID를 한 축에서 비교한다. 문서는 이 이상 구체적으로 명시하지 않는다.

### 커서 페이지네이션 메커닉

- 커서 값 형식: `{ISO_LOCAL_DATE_TIME}_{id}`. 예: `"2026-08-04T10:12:33_12"`. 구분자는 `_` 하나다.
- 커서 출처: 서버가 응답의 `nextCursor`로 준 값을 그대로 다음 요청의 `cursor`에 넣는다. 클라이언트가 조립하지 않는다(형식은 `GET /api/trades`의 커서와 같지만, 직접 만들 이유가 없다).
- 다음 페이지 조건: "이전 페이지 마지막 행보다 `createdAt`이 이전이거나, 동시각이면 체결 ID가 더 작은" 행. 페이지 경계에서 중복·누락이 없다.
- 마지막 페이지 판정: `hasNext === false`. 이때 `nextCursor`는 `null`이다. `hasNext`를 쓰는 것이 정본이고 `nextCursor === null`은 그 결과다.
- 커서 파싱 실패(구분자 없음, 날짜 파싱 실패, id 파싱 실패)는 400 `VALIDATION_ERROR`.

### 오류

| HTTP | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `market` 누락 또는 `STOCK`\|`CRYPTO` 외 리터럴(예: `FOREX`) |
| 400 | `VALIDATION_ERROR` | `limit`이 1~100 범위 밖(클램핑 없음) |
| 400 | `VALIDATION_ERROR` | `cursor`가 `{ISO_LOCAL_DATE_TIME}_{id}` 형식으로 파싱 실패 |
| 401 | `UNAUTHORIZED` | Access 인증 실패 |
| 404 | `NOT_FOUND` | 요청 시장의 계좌가 없음 |

---

## 2. GET /api/journal/buy/{buyTradeId} — 매수 일기 상세 (JOUR-005, Issue #217)

### 요청

경로 변수 `buyTradeId`(숫자). 본문 없음. 쿼리 파라미터 없음. Access Bearer 필수.

경로 변수는 회고 자체의 PK가 아니라 **그 회고가 달린 체결 ID**다.

### 성공 응답 (200) — `BuyJournalDetailResponse`, 5필드 고정

```json
{
  "journalId": 1,
  "buyTradeId": 12,
  "content": "실적 발표 전 분할 매수. 5% 빠지면 손절 계획.",
  "createdAt": "2026-08-04T10:12:33",
  "updatedAt": "2026-08-05T09:03:12"
}
```

| 필드 | 타입 |
|---|---|
| `journalId` | number |
| `buyTradeId` | number |
| `content` | string |
| `createdAt` | LocalDateTime 문자열 |
| `updatedAt` | LocalDateTime 문자열 |

체결 정보(종목·가격·수량·실현손익)는 포함하지 않는다.

### 오류 — 검증 순서 `체결 존재(404) → 소유(403) → 체결 구분(400) → 회고 존재(404)`

| HTTP | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `buyTradeId` 숫자 파싱 실패 |
| 400 | `VALIDATION_ERROR` | 대상 체결의 `side`가 `BUY`가 아님(매도 체결 ID를 매수 경로에 넣음) — 404가 아니라 **400** |
| 401 | `UNAUTHORIZED` | Access 인증 실패 |
| 403 | `FORBIDDEN` | 타인 소유 체결. 체결의 매수/매도 속성과 회고 존재 여부보다 **먼저** 판정된다 |
| 404 | `NOT_FOUND` | `buyTradeId`에 해당하는 체결 없음 |
| 404 | `NOT_FOUND` | 체결은 있으나 매수 회고가 아직 없음 |

409는 이 엔드포인트에 **없다**(새 행을 만들지 않는다).

주의: "체결 없음"과 "회고 미작성"이 **같은 404 `NOT_FOUND`**다. code로 구분할 수 없다.

---

## 3. GET /api/journal/sell/{sellTradeId} — 매도 회고 상세 (JOUR-005, Issue #217)

매수 상세와 완전 대칭이다.

### 성공 응답 (200) — `SellJournalDetailResponse`, 5필드 고정

```json
{
  "journalId": 1,
  "sellTradeId": 34,
  "content": "목표가 도달해서 전량 매도. 다음엔 분할 매도 시도.",
  "createdAt": "2026-08-04T15:20:41",
  "updatedAt": "2026-08-04T15:20:41"
}
```

필드는 `journalId`(number) · `sellTradeId`(number) · `content`(string) · `createdAt` · `updatedAt`.

### 오류

| HTTP | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `sellTradeId` 숫자 파싱 실패 |
| 400 | `VALIDATION_ERROR` | 대상 체결의 `side`가 `SELL`이 아님(매수 체결 ID를 매도 경로에 넣음) |
| 401 | `UNAUTHORIZED` | Access 인증 실패 |
| 403 | `FORBIDDEN` | 타인 소유 체결 |
| 404 | `NOT_FOUND` | 체결 없음 |
| 404 | `NOT_FOUND` | 체결은 있으나 매도 회고가 아직 없음 |

### `journalId` 충돌 경고

`buy_trade_journals.id`와 `sell_trade_journals.id`는 서로 다른 AUTO_INCREMENT 시퀀스다. **같은 `journalId` 값이 매수 응답과 매도 응답에 동시에 나타날 수 있고, 그때도 서로 다른 회고다.** 그래서 단일 경로 `GET /api/journal/{journalId}`는 만들지 않았다. `journalId`를 단독 키로 쓰면 안 되고, 반드시 타입과 함께 써야 한다. 사실상 프론트에서 `journalId`가 필요한 곳은 없다.

---

## 4. POST /api/trades/{buyTradeId}/journal — 매수 일기 작성 (JOUR-001, Issue #159)

### 요청

- 경로 변수 `buyTradeId`(숫자).
- 본문 `BuyJournalCreateRequest` — 필드는 `content` **하나뿐**이다.
  ```json
  { "content": "실적 발표 전 분할 매수. 5% 빠지면 손절 계획." }
  ```
- `content` 검증: `@NotBlank` + `@Size(max = 5000)`. 즉 **최대 5000자**, 공백만 있는 값 불가.
- 작성자는 본문이 아니라 Access Token의 인증 사용자(`AuthenticatedUser#userId`)로 결정한다. 사용자 ID를 본문에 넣는 필드는 없다.
- 목표가·손절가·예상보유기간 같은 구조화 필드는 이번 범위가 아니다(`plan`·`planOutcome` 등 미존재).

### 성공 응답 (201) — `BuyJournalResponse`, 4필드 고정

```json
{
  "journalId": 1,
  "buyTradeId": 12,
  "content": "실적 발표 전 분할 매수. 5% 빠지면 손절 계획.",
  "createdAt": "2026-08-04T10:12:33"
}
```

**`updatedAt`이 없다**(작성 응답은 4필드, 수정 응답은 5필드). `Location` 헤더도 포함하지 않는다.

### 오류 — 검증 순서 `존재(404) → 소유(403) → 매수 여부(400) → 중복(409)`

| HTTP | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `content` 누락·공백·5000자 초과 |
| 400 | `VALIDATION_ERROR` | `buyTradeId` 숫자 파싱 실패 |
| 400 | `VALIDATION_ERROR` | 대상 체결의 `side`가 `BUY`가 아님(매도 체결) |
| 401 | `UNAUTHORIZED` | Access 인증 실패 |
| 403 | `FORBIDDEN` | 타인 소유 체결(소유하지 않은 체결의 매수/매도 속성을 오류 코드로 흘리지 않기 위해 먼저 판정) |
| 404 | `NOT_FOUND` | `buyTradeId`에 해당하는 체결 없음 |
| 409 | `DUPLICATE_RESOURCE` | 해당 매수 체결에 이미 일기가 존재(선제 조회 또는 `buy_trade_journals.buy_trade_id` UNIQUE 위반) |

**본문 검증이 경로 검증보다 먼저다.** `@Valid`가 컨트롤러 진입 전에 평가되므로 "없는 체결 + 공백 본문"은 404가 아니라 **400**이다.

`content`는 앞뒤 공백을 트림하지 않고 원문 그대로 저장한다. 트림이 필요하면 클라이언트가 보내기 전에 해야 한다.

---

## 5. POST /api/trades/{sellTradeId}/sell-journal — 매도 회고 작성 (JOUR-003, Issue #183)

매수 작성과 대칭이다. 차이는 **경로(`/sell-journal`) · 체결 구분 검증(`side != SELL`) · 응답의 체결 ID 필드명(`sellTradeId`)** 세 가지뿐이다.

### 요청

- 경로 변수 `sellTradeId`(숫자).
- 본문 `SellJournalCreateRequest` — `content` 하나, `@NotBlank` + `@Size(max = 5000)`.
  ```json
  { "content": "목표가 도달해서 전량 매도. 다음엔 분할 매도 시도." }
  ```

### 성공 응답 (201) — `SellJournalResponse`, 4필드 고정

```json
{
  "journalId": 1,
  "sellTradeId": 34,
  "content": "목표가 도달해서 전량 매도. 다음엔 분할 매도 시도.",
  "createdAt": "2026-08-04T15:20:41"
}
```

`updatedAt` 없음, `Location` 헤더 없음. 실현손익·배분된 매수 lot 등 매도 결과 정보는 포함하지 않는다(`GET /api/trades`가 정본).

### 오류 — 검증 순서 `존재(404) → 소유(403) → 매도 여부(400) → 중복(409)`

| HTTP | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `content` 누락·공백·5000자 초과 |
| 400 | `VALIDATION_ERROR` | `sellTradeId` 숫자 파싱 실패 |
| 400 | `VALIDATION_ERROR` | 대상 체결의 `side`가 `SELL`이 아님(매수 체결) |
| 401 | `UNAUTHORIZED` | Access 인증 실패 |
| 403 | `FORBIDDEN` | 타인 소유 체결(타인의 매수 체결이어도 403이 먼저) |
| 404 | `NOT_FOUND` | `sellTradeId`에 해당하는 체결 없음 |
| 409 | `DUPLICATE_RESOURCE` | 이미 매도 회고 존재(`sell_trade_journals.sell_trade_id` UNIQUE) |

본문 검증 우선(없는 체결 + 공백 본문 = 400), 트림 없이 원문 저장도 매수와 같다.

---

## 6. PATCH /api/trades/{buyTradeId}/journal — 매수 일기 수정 (JOUR-002, Issue #197)

### 요청

- 경로 변수 `buyTradeId`(숫자). 작성과 **같은 리소스 경로를 PATCH로 재사용**한다.
- 본문 `BuyJournalUpdateRequest` — `content` 하나, 작성과 같은 `@NotBlank` + `@Size(max = 5000)`.
  ```json
  { "content": "돌아보니 실적 발표 전 매수 타이밍이 조금 일렀다." }
  ```
- PATCH지만 부분 수정이 아니라 **본문 교체**다. `content`는 필수다.
- `buyTradeId`·`journalId`·`createdAt`은 요청으로 지정할 수 없다.

### 성공 응답 (200) — `BuyJournalUpdateResponse`, 5필드 고정

```json
{
  "journalId": 1,
  "buyTradeId": 12,
  "content": "돌아보니 실적 발표 전 매수 타이밍이 조금 일렀다.",
  "createdAt": "2026-08-04T10:12:33",
  "updatedAt": "2026-08-05T09:03:12"
}
```

상태는 200이다(생성이 아니므로 201 아님). `createdAt`은 원본 값 그대로다. 상세 조회 응답(`BuyJournalDetailResponse`)과 필드 구성이 1:1로 같다.

### 오류 — 검증 순서 `체결 존재(404) → 소유(403) → 매수 여부(400) → 회고 존재(404)`

| HTTP | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `content` 누락·공백·5000자 초과 |
| 400 | `VALIDATION_ERROR` | `buyTradeId` 숫자 파싱 실패 |
| 400 | `VALIDATION_ERROR` | 대상 체결의 `side`가 `BUY`가 아님(매도 체결) |
| 401 | `UNAUTHORIZED` | Access 인증 실패 |
| 403 | `FORBIDDEN` | 타인 소유 체결(타인의 매도 체결이면 회고 존재 확인 전에 403) |
| 404 | `NOT_FOUND` | 체결 없음 |
| 404 | `NOT_FOUND` | 체결은 있으나 일기가 아직 없음 — **upsert가 아니다** |

**409는 이 엔드포인트에 없다.**

### 잠금 없음 (확인됨)

- 해당 매수 체결의 일부 또는 전부가 이미 매도되어 `trade_allocations`에 배분이 생겼든, 전량 매도됐든 **관계없이 항상 수정할 수 있다**. 매도 배분·`holding_lots` 여부를 판정에 쓰지 않는다.
- 2026-08-04 이슈 #197 확정 — `005-order-sell` spec.md가 규정했던 "첫 매도 배분 발생 시 잠금"은 이 결정으로 대체됐다.
- 수정 횟수 제한 없음, 수정 이력 보관 없음(연속 수정 모두 허용, 마지막 본문만 남는다).
- 결론: 프론트에 "잠김" 배지나 수정 버튼 disable 로직을 두면 안 된다. 잠금 관련 오류 코드도 존재하지 않는다.

---

## 7. PATCH /api/trades/{sellTradeId}/sell-journal — 매도 회고 수정 (JOUR-004, Issue #190)

매수 수정과 대칭이다.

### 요청

경로 변수 `sellTradeId`(숫자) + 본문 `SellJournalUpdateRequest`(`content`, `@NotBlank` + `@Size(max = 5000)`).

```json
{ "content": "돌아보니 목표가 도달 전에 일부 익절했어야 했다." }
```

### 성공 응답 (200) — `SellJournalUpdateResponse`, 5필드 고정

```json
{
  "journalId": 1,
  "sellTradeId": 34,
  "content": "돌아보니 목표가 도달 전에 일부 익절했어야 했다.",
  "createdAt": "2026-08-04T15:20:41",
  "updatedAt": "2026-08-05T09:03:12"
}
```

### 오류 — 검증 순서 `체결 존재(404) → 소유(403) → 매도 여부(400) → 회고 존재(404)`

| HTTP | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `content` 누락·공백·5000자 초과 |
| 400 | `VALIDATION_ERROR` | `sellTradeId` 숫자 파싱 실패 |
| 400 | `VALIDATION_ERROR` | 대상 체결의 `side`가 `SELL`이 아님(매수 체결) |
| 401 | `UNAUTHORIZED` | Access 인증 실패 |
| 403 | `FORBIDDEN` | 타인 소유 체결(타인의 매수 체결이면 403 먼저) |
| 404 | `NOT_FOUND` | 체결 없음 |
| 404 | `NOT_FOUND` | 체결은 있으나 매도 회고가 아직 없음(upsert 아님) |

409 없음. 수정 횟수 제한이나 잠금 조건 없음(연속 수정 모두 허용, 이력 미보관).

### 작성 vs 수정 응답 필드 비교표

| 필드 | POST 201 | PATCH 200 | GET 200 |
|---|---|---|---|
| `journalId` | O | O | O |
| `buyTradeId` / `sellTradeId` | O | O | O |
| `content` | O | O | O |
| `createdAt` | O | O | O |
| `updatedAt` | **X** | O | O |

---

## 8. GET /api/rankings — 전체 랭킹 조회 (RANK-001, Issue #187)

### 요청

| 항목 | 내용 |
|---|---|
| Method·URL | `GET /api/rankings` |
| 헤더 | `Authorization: Bearer <access>` 필수 |
| `market` | **필수**. `STOCK` \| `CRYPTO`. 컨트롤러가 검증하는 유일한 파라미터 |
| `limit` | 선택. 기본 10, 상한 50. **범위 밖이어도 오류 없이 클램핑** |
| 본문 | 없음 |

### `limit` 클램핑 — /trades·/orders와의 비대칭 (중요)

- `limit`이 **생략되거나 0 이하**면 컨트롤러가 거부하지 않고 그대로 `RankingService`로 전달되어 서비스가 **10으로 클램핑**한다.
- `limit`이 **51 이상**이면 **50으로 클램핑**한다.
- `GET /api/trades`·`GET /api/orders`는 범위 밖 `limit`을 400으로 거부하는데, **이 API만 의도적으로 클램핑한다.** 같은 이름의 파라미터가 엔드포인트마다 정책이 다르다.
- 단, `limit`이 **정수로 파싱 불가능한 값**(예: `abc`)이면 값 범위와 무관하게 400 `VALIDATION_ERROR`다. 클램핑은 파싱된 정수에만 적용된다.
- 프론트 함의: 요청한 `limit`과 실제로 돌아오는 항목 수가 다를 수 있다. `content.length`를 신뢰해야 하고, 요청 `limit`을 화면 계산에 쓰면 안 된다. 반대로 `tradeService.ts`가 하는 클라이언트 측 강제 클램프는 이 API에선 불필요하다(해롭지도 않다).

### 성공 응답 (200) — `RankingListResponse`, 2단 구조

```json
{
  "market": "STOCK",
  "content": [
    { "rank": 1, "nickname": "투자왕",   "realizedPnl": 500000 },
    { "rank": 1, "nickname": "차트요정", "realizedPnl": 500000 },
    { "rank": 3, "nickname": "존버맨",   "realizedPnl": 120000 }
  ]
}
```

wrapper(`RankingListResponse`) 2필드.

| 필드 | 타입 | 비고 |
|---|---|---|
| `market` | `"STOCK"` \| `"CRYPTO"` | 요청한 시장. **항목마다 반복하지 않는다** |
| `content` | 항목 배열 | |

항목(`RankingListItemResponse`)은 **3필드 고정**이다.

| 필드 | 타입 | 비고 |
|---|---|---|
| `rank` | number | 1부터. 공동 순위 있음 |
| `nickname` | string | **마스킹 없이 전체 노출** |
| `realizedPnl` | number | 실현손익 **금액**(원). 비율·퍼센트가 아니다. scale은 문서에 명시 없음 — 정수 예시만 제시됨 |

`content`에는 `nextCursor`·`hasNext`·`totalElements`가 **없다**. 페이지네이션 없는 top-N 목록이다.

빈 목록도 오류가 아니다. 매도 체결 이력이 있는 회원이 한 명도 없으면 200 `{"market":"STOCK","content":[]}`.

### 사용자 식별 필드

- `nickname`만 노출된다. 마스킹 없음.
- `userId`는 응답에 **포함하지 않는다**. `accountId`·`email`·프로필 이미지 등 다른 식별 필드도 없다.
- 응답은 인증 사용자로 스코프되지 않는 전체 랭킹이므로 다른 회원 항목도 그대로 보인다.
- 함의: "내 항목 하이라이트"는 `nickname` 문자열 비교밖에 방법이 없다(커뮤니티 `Post.authorNickname`과 같은 제약). 닉네임 중복 가능성은 문서에 명시 없음.

### 대상 집합과 정렬

- `market` 쿼리로 지정한 시장 전체 회원 중 **매도 체결 이력이 한 번도 없는 회원은 제외**한다. 실현손익이 정확히 0이어도 매도 이력이 있으면 포함된다.
- 정렬은 **실현손익 내림차순**이다. 동점 내부의 2차 정렬 기준은 문서에 명시 없음(예시는 `투자왕`·`차트요정` 순이지만 보장으로 서술되지 않았다).

### 동점 처리 — 공동 순위

- **동점자는 공동 순위를 받고, 다음 순위는 동점자 수만큼 건너뛴다.** 공동 1위가 2명이면 다음 회원은 2위가 아니라 **3위**다.
- 공식: `rank = 해당 score보다 엄격히 큰 회원 수 + 1`(`countStrictlyGreater(score) + 1`).
- Redis ZSET 기본 순위 커맨드는 동점이어도 멤버 문자열 사전순으로 순차 배정해 이 규칙과 다르게 동작하므로 `RankingService`가 애플리케이션 계층에서 보정한다.
- 함의: `content` 배열의 인덱스로 순위를 계산하면 안 된다. 항상 `rank` 필드를 써야 한다. `rank` 값에 구멍이 생기고(1,1,3) 중복도 생긴다 — `rank`를 React key로 쓰면 안 된다.

### 데이터 신선도

- score의 정본은 MySQL이다. 매 조회마다 `trades`를 재집계하지 않고, 매도 체결로 `accounts.realized_pnl`이 갱신된 뒤 **after-commit**에만 Redis ZSET에 반영된 값을 읽는다.
- Redis 갱신이 재시도 후에도 실패하면 로그만 남기고 매도 체결 자체에는 영향이 없다. 즉 **랭킹이 최신 체결을 아직 반영하지 않은 상태가 정상적으로 존재할 수 있다.**

### 오류

| HTTP | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `market` 누락 또는 `STOCK`\|`CRYPTO` 외 리터럴(예: `FOREX`) |
| 400 | `VALIDATION_ERROR` | `limit`이 정수로 파싱 불가능(예: `abc`) |
| 401 | `UNAUTHORIZED` | Access 인증 실패 |
| 500 | `INTERNAL_ERROR` | Redis 장애 — 조회 경로(`topN`/`countStrictlyGreater`)는 예외를 그대로 던진다. 별도 장애 응답 정책은 아직 없다(PR #196 리뷰) |

---

## 9. GET /api/rankings/me — 내 랭킹 조회 (RANK-002, Issue #233)

### 요청

| 항목 | 내용 |
|---|---|
| Method·URL | `GET /api/rankings/me` |
| 헤더 | `Authorization: Bearer <access>` 필수 |
| `market` | **필수**. `STOCK` \| `CRYPTO` |
| `limit` | **없음**(이 엔드포인트에 `limit` 파라미터가 없다) |
| 본문 | 없음 |

대상은 항상 인증 토큰의 본인이다. 다른 사용자의 `accountId`·`userId`를 지정하는 파라미터가 없다(구조적으로 타인 조회 불가).

### 성공 응답 (200) — `MyRankingResponse`, 4필드 고정 (flat, wrapper 없음)

**경우 A — 매도 체결 이력이 있는 경우.**

```json
{ "market": "STOCK", "rank": 3, "nickname": "존버맨", "realizedPnl": 120000 }
```

**경우 B — 매도 체결 이력이 없는 경우 (오류 아님, 200).**

```json
{ "market": "STOCK", "rank": null, "nickname": "투자왕", "realizedPnl": 0 }
```

| 필드 | 타입 | 경우 A | 경우 B |
|---|---|---|---|
| `market` | `"STOCK"` \| `"CRYPTO"` | 요청한 시장 | 요청한 시장(항상 값 있음) |
| `rank` | number \| **null** | 보정된 순위 | **`null`** |
| `nickname` | string | 값 | **정상 값**(null 아님, 마스킹 없음) |
| `realizedPnl` | number | 값 | **`0`**(null 아님) |

**`null`이 되는 필드는 `rank` 하나뿐이다.** `nickname`·`realizedPnl`(0 포함)은 매도 이력과 무관하게 항상 정상 값으로 채워진다. 전용 상태값이나 전용 오류 코드를 새로 만들지 않았다 — "랭킹 목록 대상에서 제외됨"(RANK-001)과 "본인 조회 응답에 참고 정보가 없음"은 다른 개념이라는 게 문서의 명시적 설명이다.

구조가 RANK-001과 다르다. RANK-001은 `{market, content:[...]}` 2단이고, 여기는 항목 필드가 **최상위에 평평하게** 있다. `content` 래핑이 없다.

### 순위 계산과 데이터 출처

- RANK-001과 **동일한 ZSET 상태·보정 공식**(`countStrictlyGreater(score) + 1`)을 재사용한다. 별도 공식이 없다.
- 매도 이력 유무 판정도 DB `accounts.realized_pnl`이 아니라 항상 Redis ZSET(`RankingStore.score`)을 기준으로 한다 — 두 엔드포인트가 서로 다른 순간의 데이터를 봐서 순위가 불일치하는 상황을 없애기 위한 결정이다.
- 응답의 `realizedPnl`도 이 `score`를 그대로 노출한다. DB `accounts.realized_pnl`을 별도로 재조회하지 않는다(PR #234 리뷰 반영).
- 매도 이력이 없어 `score`가 없으면 `realizedPnl`은 0이다(이 경우 DB 값도 항상 0이라 결과가 같다).
- 상위 노출 구간(`GET /api/rankings`의 `limit`)에 들지 않아도 본인의 정확한 보정 순위를 반환한다. 목록 노출 여부와 무관하게 항상 계산된다.
- 주의: 이 `realizedPnl`은 `GET /api/accounts/summary?market=`의 `realizedPnl`(DB 원장 값)과 순간적으로 다를 수 있다. after-commit 반영 지연·Redis 재시도 소진 시 그렇다.

### 오류

| HTTP | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `market` 누락 또는 `STOCK`\|`CRYPTO` 외 리터럴 |
| 401 | `UNAUTHORIZED` | Access 인증 실패 |
| 500 | `INTERNAL_ERROR` | Redis 조회 경로 장애(RANK-001과 동일한 정책, 문서에 이 절에서 재언급은 없으나 같은 조회 경로를 공유한다) |

403·404는 이 엔드포인트에 없다. 소유권 검증이 구조적으로 불필요하고, 데이터 없음도 404가 아니라 200 + `rank: null`이다.

---

## 10. 기존 프론트 코드와의 대조

현재 `src/`에는 **투자일기·랭킹 관련 코드가 전혀 없다**(`journal`·`ranking` 문자열 매치 0건). 즉 신규 추가이고, 기존 코드와 충돌하는 구현은 없다. 다만 기존 파일들의 규칙·주석과 대조하면 아래 항목을 주의해야 한다.

### `src/services/types.ts`

- 이 도메인 타입이 아직 없다. 추가해야 하는 타입은 `JournalType`(`'BUY' | 'SELL'`), `JournalListItem`, `JournalPage`, `BuyJournalDetail`, `SellJournalDetail`, `BuyJournalResponse`(4필드), `SellJournalResponse`(4필드), `BuyJournalUpdate`/`SellJournalUpdate`(5필드), `JournalContentRequest`(`{content: string}`), `RankingListItem`, `RankingList`, `MyRanking`이다.
- 기존 `TradePage` 주석(`cursor 형식: {ISO_LOCAL_DATE_TIME}_{tradeId}`, `limit 기본 20, 1..100, 서버가 클램프하지 않고 400`)이 **`GET /api/journal`에도 그대로 적용된다.** 두 API의 커서·limit 정책이 동일하므로 wrapper 타입을 제네릭화할 여지가 있다(`content`·`nextCursor`·`hasNext` 3필드 동일).
- 반면 `GET /api/rankings`의 `limit` 정책은 **정반대**(클램핑)다. `TradePage` 주석을 그대로 복사해 랭킹에 붙이면 잘못된 문서가 된다.
- `Decimal = number` 타입 주석은 "같은 값이 엔드포인트마다 다른 scale로 온다"고 경고한다. 랭킹 `realizedPnl`의 scale은 계약 문서에 명시가 없으므로(정수 예시만) `Decimal`로 받고 숫자 비교만 하는 편이 안전하다.
- `AccountSummary.returnRate` 주석의 scale-4 비율 경고는 이 도메인에 **해당 사항이 없다**. 투자일기·랭킹 응답에 비율 필드가 없다.
- `Post` 타입에 달린 "authorId가 없어 소유 판정은 authorNickname 비교뿐" 제약이 랭킹에도 똑같이 있다(`userId` 미노출).

### `src/services/tradeService.ts`

- `getTrades`의 `Math.min(100, Math.max(1, p.limit ?? 20))` 클램프 패턴은 `GET /api/journal`에 **그대로 재사용해야 한다**(서버가 400을 내므로).
- 반면 `getRankings`에 같은 패턴을 쓰면 의미가 다르다. 서버가 이미 10/50으로 클램핑하므로 클라이언트 클램프는 불필요하고, 특히 `Math.max(1, ...)`는 서버 기본값 10을 가리게 된다(`limit` 생략 시 서버는 10을 쓰지만, 클라이언트가 1을 보내면 1건만 온다). 랭킹은 `limit`을 넘기지 않거나 원하는 값을 그대로 넘기는 편이 맞다.
- `query`에서 `cursor ?? undefined`로 null을 제거하는 패턴은 `GET /api/journal`에도 필요하다. `cursor=` 빈 문자열을 보내면 파싱 실패 400 위험이 있다(빈 문자열 처리는 문서에 명시 없음).

### `src/lib/format.ts`

- `formatPnl`·`formatManEok`을 랭킹 `realizedPnl`에 쓸 수 있다. 다만 `formatManEok`은 만 단위 미만을 반올림·축약하므로 랭킹 표에서 동점자 두 명이 서로 다른 값인데 같게 보일 수 있다. 정확한 비교가 필요한 랭킹 표에서는 `formatKRW`가 안전하다.
- `formatPercent`는 이 도메인에서 쓸 곳이 없다(비율 필드 없음).
- `pnlTone`은 `realizedPnl` 0인 사용자(매도 이력 있으나 손익 0, 또는 이력 없음)에 `text-muted`를 준다. 의도한 표시인지 확인이 필요하다.

### `src/lib/datetime.ts`

- `parseLocalDateTime`을 `createdAt`·`updatedAt`에 그대로 쓴다. `'Z'`를 붙이면 9시간 어긋난다.
- `formatDateTime`은 "7월 29일 09:01" 형식으로 **연도를 표시하지 않는다.** 투자일기 목록은 과거 여러 달·연도에 걸칠 수 있으므로 연도 표기 포맷이 필요할 수 있다.
- `ratioToPercent`는 이 도메인에서 호출할 대상이 없다.

---

## 프론트 구현 시 함정

1. **`journalId`로 상세를 열 수 없다.** 목록 응답에 `journalId`가 아예 없고, 상세 경로의 경로 변수는 체결 ID(`buyTradeId`/`sellTradeId`)다. 상세·수정 링크는 반드시 `journalType`으로 분기해 해당 체결 ID를 써야 한다.
2. **`journalId`는 전역 유일하지 않다.** 매수·매도 회고 테이블의 시퀀스가 별개라 같은 값이 양쪽에 존재할 수 있다. 캐시 키·React key로 쓰면 다른 회고를 덮어쓴다. 키는 `` `${journalType}-${buyTradeId ?? sellTradeId}` ``로 조합한다.
3. **목록 항목의 `buyTradeId`/`sellTradeId` 중 하나는 항상 `null`이다.** `item.buyTradeId`를 무조건 참조하면 매도 항목에서 `null`이 URL에 들어가 `/api/journal/buy/null` → 400을 맞는다. `journalType`으로 먼저 분기한다.
4. **경로와 체결 종류가 어긋나면 404가 아니라 400이다.** 매수 경로에 매도 체결 ID를 넣으면 "없음"이 아니라 `VALIDATION_ERROR`다. "일기 미작성" UI를 404로만 판정하면 이 경우를 놓친다.
5. **"체결 없음"과 "회고 미작성"이 같은 404 `NOT_FOUND`다.** code로 구분할 수 없으므로 "아직 작성 안 함 → 작성 폼 보여주기" 분기를 404만 보고 하면, 존재하지 않는 체결에도 작성 폼을 띄우게 된다. 목록이나 `GET /api/trades`로 체결 존재를 이미 아는 문맥에서만 그 분기를 써야 한다.
6. **작성 응답(201)에는 `updatedAt`이 없다.** 4필드다. 작성 직후 응답을 목록 항목 타입(6필드)에 그대로 꽂으면 `updatedAt`이 `undefined`가 되어 날짜 포맷 함수가 깨진다. 작성 직후엔 `updatedAt = createdAt`으로 채우거나 목록을 재조회한다.
7. **PATCH는 upsert가 아니다.** 회고가 없는 체결에 PATCH하면 404다. "저장" 버튼 하나로 처리하려면 클라이언트가 신규/수정을 스스로 알아야 한다. 404를 받고 POST로 폴백하는 재시도 로직을 짜면 6번의 모호한 404 때문에 오작동할 수 있다.
8. **POST 중복은 409 `DUPLICATE_RESOURCE`다.** 동시 요청 경합(더블 클릭)에서도 같은 409로 변환되므로, 이 코드를 "이미 작성됨 → 수정 모드로 전환"으로 처리해야 한다. 제출 버튼 중복 클릭 방지도 필요하다.
9. **본문 검증이 경로 검증보다 먼저다.** 없는 체결 + 공백 본문 = 400이다. 오류 코드로 원인을 역추적할 때 400이 곧 "본문 문제"라고 단정하면 안 된다.
10. **`content`는 서버가 트림하지 않는다.** 공백만 있는 값은 `@NotBlank`로 400이지만, 앞뒤 공백이 섞인 값은 그대로 저장된다. 저장 전 클라이언트에서 트림하고, 트림 결과가 빈 문자열이면 요청을 보내지 말고 로컬 검증으로 막는다.
11. **`content` 상한은 5000자다.** 서버 오류 전에 로컬에서 카운터로 막는다. 5000은 문자 수 기준 `@Size(max=5000)`이며 바이트 기준 여부는 문서에 명시 없음 — 이모지·한글 카운트 방식 차이는 확인이 필요하다.
12. **잠금이 없다.** 전량 매도된 체결의 일기도 항상 수정 가능하다. "매도 후 잠김" UI를 만들면 안 된다(예전 `005-order-sell` spec의 잠금 규칙은 이슈 #197로 폐기됐다).
13. **목록 정렬은 `createdAt` 기준이라 방금 수정한 항목이 맨 위로 오지 않는다.** 수정 후 목록을 재조회하면 사용자가 방금 고친 항목이 화면 밖에 있을 수 있다. 수정 결과는 목록 재조회에 의존하지 말고 해당 항목만 로컬 갱신하는 편이 낫다.
14. **`GET /api/journal`의 `limit`은 클램핑되지 않고 400이다.** `GET /api/rankings`와 정반대다. 두 서비스 함수에 같은 클램프 유틸을 공유하면 랭킹의 서버 기본값 10을 가리게 된다.
15. **랭킹은 요청 `limit`과 실제 항목 수가 다를 수 있다.** 51 이상은 50으로, 0 이하·생략은 10으로 조용히 바뀐다. 페이지 계산에 요청값을 쓰지 말고 `content.length`를 쓴다.
16. **`limit=abc` 같은 비정수는 랭킹에서도 400이다.** 클램핑은 파싱된 정수에만 적용된다. 입력값을 그대로 쿼리에 넘기지 말고 숫자로 변환해 보낸다.
17. **랭킹 `rank`는 배열 인덱스와 다르다.** 공동 순위 때문에 값이 중복되고(1,1,3) 건너뛴다. `index + 1`로 순위를 그리면 틀리고, `rank`를 React key로 쓰면 중복 키가 된다.
18. **랭킹에 `userId`가 없다.** "내 순위 하이라이트"는 `nickname` 문자열 비교뿐이다. 더 정확하게 하려면 `GET /api/rankings/me`를 따로 호출해 두 값을 함께 표시하는 방식이 안전하다.
19. **`nickname`은 마스킹 없이 전체 노출된다.** 클라이언트에서 임의로 마스킹하면 `GET /api/rankings/me`의 본인 닉네임과 대조가 깨진다.
20. **`GET /api/rankings/me`의 `rank`만 `null`이 될 수 있다.** `nickname`·`realizedPnl`은 항상 값이 있고 `realizedPnl`은 0이다. `rank == null`을 "응답 전체가 비었다"로 해석해 빈 상태 UI를 띄우면 닉네임·0원 정보를 버리게 된다. 반대로 `if (!data.rank)`로 판정하면 `rank`가 0일 가능성은 없으니 동작은 하지만, `rank === null`로 명시 비교하는 게 안전하다.
21. **`GET /api/rankings`와 `GET /api/rankings/me`의 응답 구조가 다르다.** 전자는 `{market, content:[...]}` 2단, 후자는 `{market, rank, nickname, realizedPnl}` flat이다. `content`를 기대하고 접근하면 `undefined`다.
22. **랭킹 `realizedPnl`은 Redis ZSET score 기반이라 `GET /api/accounts/summary`의 `realizedPnl`(DB)과 순간적으로 어긋날 수 있다.** 두 값을 같은 화면에 나란히 놓으면 사용자가 불일치를 본다. 랭킹 위젯 안에서만 랭킹 값을 쓰는 편이 낫다.
23. **Redis 장애 시 랭킹 조회는 500 `INTERNAL_ERROR`다.** 폴백 응답 정책이 없으므로 랭킹 위젯은 500을 독립적으로 처리해 페이지 전체를 깨뜨리지 않아야 한다.
24. **`GET /api/journal`은 요청 시장의 계좌가 없으면 404다.** 목록이 비어 있는 것과 계좌 없음이 다르게 응답한다. 404를 "빈 목록"으로 뭉개면 계좌 문제를 놓친다.
25. **회고 목록에 종목명·가격·수량·실현손익이 없다.** 종목 표시가 필요하면 `GET /api/trades`(+ `instrumentService` 캐시)와 `tradeId`로 조인해야 한다. 목록 API 하나로 카드 UI를 완성할 수 없다.
26. **`updatedAt === createdAt`이면 미수정이다.** 별도 `isEdited` 플래그가 없으므로 "수정됨" 배지는 두 값 비교로 만들어야 한다(문자열 동등 비교로 충분하다 — 같은 직렬화 형식).
27. **커서를 직접 조립하지 말 것.** 형식이 `{createdAt}_{tradeId}`로 공개돼 있지만, 매수·매도가 섞인 목록에서 어느 체결 ID가 들어가는지는 서버 판단이다. 항상 응답의 `nextCursor`를 그대로 되돌려 보낸다.
28. **`hasNext`가 마지막 페이지 판정의 정본이다.** `content.length < limit`으로 판정하면 안 된다(랭킹처럼 클램핑되는 API 습관이 섞이면 특히 위험하다).
