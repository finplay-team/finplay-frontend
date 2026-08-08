<!-- 커뮤니티 고도화(COM-004 종목 태그·COM-005 대댓글)와 캔들 기간 확장(MKT-009) 백엔드 API 계약 추출본 -->

# 커뮤니티 고도화 + 캔들 기간 확장 API 계약

근거 문서. `.backend-docs/api-contracts.md`(정본), `.backend-docs/api-routes.md`(라우트 지도), `.backend-docs/prd.md`(요구사항 상태), `.backend-docs/conventions.md`(오류 봉투).

구현 상태. COM-004·COM-005는 완료(`022-community-enhancement`, 이슈 #246·#247). COM-006(사진 첨부, 이슈 #248)은 미착수이므로 이 문서 범위 밖이다. MKT-009는 완료(`013-candle-interval`, PR #151).

## 0. 공통 규약

- 인증. 이 문서의 모든 엔드포인트는 `Authorization: Bearer <accessToken>`이 필수다. 공개 화이트리스트에 없어 `anyRequest().authenticated()`로 떨어진다. 헤더 없음·만료·변조·Refresh Token 제출은 모두 401 `UNAUTHORIZED`다.
- 성공 응답은 봉투가 없는 bare JSON이다.
- 오류 응답은 항상 아래 형태이며 `X-Request-Id` 응답 헤더가 함께 온다.

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "requestId": "…" } }
```

- 모든 시각 필드는 오프셋·`Z`가 없는 ISO-8601 `LocalDateTime` 문자열이다(예: `2026-07-27T12:00:00`). 프론트의 `parseLocalDateTime`을 그대로 쓴다.
- 인증된 사용자가 남의 리소스를 건드리면 403 `FORBIDDEN`이다.

---

## 1. POST /api/community/posts — 게시물 작성 (COM-004)

### 요청

경로 변수·쿼리 파라미터 없음. 본문(`PostCreateRequest` 성격).

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `title` | `String` | 필수 | 최대 100자. 누락·빈 값·공백만은 400 |
| `content` | `String` | 필수 | 최대 5,000자. 누락·빈 값·공백만은 400 |
| `instrumentId` | `Long` | 선택·nullable | 생략 또는 `null`이면 미태그 게시물. 게시물당 태그 가능한 종목은 **최대 1개** |

### 성공 응답 — 201 Created

```json
{
  "postId": 1,
  "authorNickname": "finplayer",
  "title": "게시물 제목",
  "content": "게시물 본문",
  "createdAt": "2026-07-27T12:00:00",
  "updatedAt": "2026-07-27T12:00:00",
  "instrumentId": 1,
  "instrumentSymbol": "005930",
  "instrumentName": "삼성전자"
}
```

| 필드 | 타입 | nullable |
|---|---|---|
| `postId` | `Long` | non-null |
| `authorNickname` | `String` | non-null |
| `title` | `String` | non-null |
| `content` | `String` | non-null |
| `createdAt` | `LocalDateTime` | non-null |
| `updatedAt` | `LocalDateTime` | non-null (생성 시 `createdAt`과 동일) |
| `instrumentId` | `Long` | 미태그면 `null` |
| `instrumentSymbol` | `String` | 미태그면 `null` |
| `instrumentName` | `String` | 미태그면 `null` |

**태그 세 필드는 항상 함께 non-null이거나 함께 `null`이다.** 즉 응답이 `symbol`·`name`을 이미 실어 주므로 태그 배지를 그리려고 instrument 캐시에 조인할 필요가 없다. `market`·`tickSize`·`tradable`은 응답에 없으므로 그 값이 필요하면 그때만 캐시를 본다.

작성자는 요청에서 받지 않고 Access Token의 인증 사용자로 결정한다.

### 오류

| HTTP | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `title`·`content` 누락·빈 값·공백만·최대 길이 초과 |
| 400 | `VALIDATION_ERROR` | `instrumentId`가 **존재하지 않는** 종목 |
| 400 | `VALIDATION_ERROR` | `instrumentId`가 **`tradable=false`인 비활성** 종목 |
| 401 | `UNAUTHORIZED` | Access 인증 실패 |

**두 태그 실패 케이스는 확인됐고 코드가 동일하다.** 검증은 `InstrumentService.getTradableInstrumentEntity`로 존재·`tradable`을 함께 보며, 문서는 "실패 사유(미존재·비활성)는 구분하지 않고 동일한 400 `VALIDATION_ERROR`로 응답한다"고 명시한다. 즉 프론트는 `code`만으로 "없는 종목"과 "거래정지 종목"을 구별할 수 없다. `message` 문구로 구별하는 방법은 문서에 명시 없음이며 문구에 의존하지 말 것.

---

## 2. GET /api/community/posts — 게시물 목록 (COM-004 태그 필터)

### 요청

| 쿼리 | 타입 | 기본값 | 범위 |
|---|---|---|---|
| `page` | `int` | `0` | 0 이상. 음수는 400 |
| `size` | `int` | `10` | 1~50. 범위 밖은 400 (서버가 클램프하지 않는다) |
| `instrumentId` | `Long` | 없음(전체) | 선택. 지정 시 그 종목이 태그된 게시물만 |

**주의. 서버 기본 `size`는 10이다.** 프론트 `communityService.getPosts`는 자체 기본값 20을 쓰고 있어 서버 기본과 다르다(항상 명시 전송하므로 동작은 문제 없음).

### 성공 응답 — 200 OK

```json
{
  "content": [
    {
      "postId": 1,
      "authorNickname": "finplayer",
      "title": "게시물 제목",
      "content": "게시물 본문",
      "createdAt": "2026-07-27T12:00:00",
      "updatedAt": "2026-07-27T12:00:00",
      "instrumentId": 1,
      "instrumentSymbol": "005930",
      "instrumentName": "삼성전자"
    }
  ],
  "page": 0,
  "size": 10,
  "totalElements": 1,
  "totalPages": 1,
  "hasNext": false
}
```

`content[]` 항목은 단건 조회와 **완전히 같은 DTO**다 — `content` 본문 전체를 포함하므로 목록에서 발췌를 잘라 쓰는 기존 방식이 그대로 유효하고, 태그 세 필드도 목록에 들어온다. 페이지 메타는 `page`·`size`·`totalElements`·`totalPages`·`hasNext`다(커서 아님).

### 정렬 보장

`created_at` **내림차순**, 동시각은 `id` **내림차순** 안정 정렬(페이지 경계 중복·누락 방지). 게시물이 0건이면 오류가 아니라 200 + 빈 `content`다.

### 태그 필터의 관용성

`instrumentId`에 **존재하지 않는 값을 넣어도 400이 아니다** — 조회 조건일 뿐이므로 빈 `content`를 반환한다. 생성·수정 시의 태그 유효성 검증과 의도적으로 다르다. `tradable=false` 종목으로 필터할 때 어떻게 되는지는 문서에 별도 명시가 없으나, "이 필터는 조회 조건일 뿐"이라는 서술상 그 종목이 태그된 과거 게시물이 그대로 반환된다고 읽힌다(→ MUST-VERIFY).

서버는 QueryDSL `leftJoin().fetchJoin()`으로 instrument를 함께 로딩해 N+1을 막는다.

### 오류

| HTTP | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `page` < 0, `size` < 1 또는 > 50 |
| 401 | `UNAUTHORIZED` | Access 인증 실패 |

---

## 3. GET /api/community/posts/{postId} — 게시물 단건 조회

### 요청

경로 변수 `postId`. 본문·쿼리 없음.

### 성공 응답 — 200 OK

작성·수정·목록 항목과 **동일한 DTO**(§1의 필드 표 그대로). 태그가 없는 게시물은 `instrumentId`·`instrumentSymbol`·`instrumentName`이 모두 `null`이다.

### 오류

| HTTP | code | 트리거 |
|---|---|---|
| 401 | `UNAUTHORIZED` | Access 인증 실패 |
| 404 | `NOT_FOUND` | 게시물 미존재 |

`postId`가 숫자가 아닐 때의 코드는 이 절에 명시 없음이나, 다른 경로(`GET /api/instruments/{instrumentId}`)의 동종 계약은 400 `VALIDATION_ERROR`다. 프론트는 이미 라우트 단계에서 정수 검사로 막고 있다.

> 문서 불일치. `api-routes.md`의 단건 조회 행은 Spec 칸이 `008 COM-001, Issue #25`뿐이고 태그를 언급하지 않지만, 정본인 `api-contracts.md`는 `022 COM-004, Issue #246`을 포함하고 태그 세 필드를 응답 예시에 넣었다. 정본을 따라 태그 필드가 온다고 가정한다.

---

## 4. PATCH /api/community/posts/{postId} — 게시물 수정 (전체 교체)

### 요청

경로 변수 `postId`. 본문은 작성(§1)과 동일한 형태다.

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `title` | `String` | 필수 | 최대 100자 |
| `content` | `String` | 필수 | 최대 5,000자 |
| `instrumentId` | `Long` | 선택·nullable | — |

### 데이터 손실 트랩 — 명확히 문서화되어 있다

메서드는 PATCH지만 **부분 패치가 아니라 매 요청이 전체를 교체한다.** 계약 원문은 다음과 같다.

> `title`·`content`와 동일하게 매 요청이 전체를 교체한다(부분 패치 아님) — `instrumentId`를 생략/`null`로 보내면 기존 태그를 해제한다. 태그를 유지하려면 클라이언트가 기존 `instrumentId`를 다시 보내야 한다.

즉 **태그가 보존되지 않고 해제된다.** 문서에 명시된 확정 계약이므로 추측이 아니다. 수정 폼은 반드시 기존 `post.instrumentId`를 초기값으로 실어 함께 재전송해야 하며, 현재 프론트 `updatePost`는 `title`·`content`만 보내므로 **태그가 조용히 지워진다**(§핫스팟 참조).

### 성공 응답 — 200 OK

작성·단건 조회와 동일한 DTO. `updatedAt`이 갱신되어 `createdAt`과 달라진다(프론트 `isEdited` 판정이 여기에 의존한다).

### 오류

| HTTP | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `title`·`content` 누락·빈 값·공백만·최대 길이 초과 |
| 400 | `VALIDATION_ERROR` | `instrumentId`가 존재하지 않는 종목 |
| 400 | `VALIDATION_ERROR` | `instrumentId`가 비활성(`tradable=false`) 종목 |
| 401 | `UNAUTHORIZED` | Access 인증 실패 |
| 403 | `FORBIDDEN` | 본인 소유가 아닌 게시물 |
| 404 | `NOT_FOUND` | 게시물 미존재 |

소유자 확인은 요청 본문이 아니라 Access Token의 인증 사용자로 판단한다. 검증 순서(400 vs 403 vs 404 중 무엇이 먼저인지)는 문서에 명시 없음.

---

## 5. GET /api/community/posts/{postId}/comments — 댓글 목록 (COM-005 중첩)

### 요청

경로 변수 `postId`. **쿼리 파라미터 없음.**

### 성공 응답 — 200 OK, bare array

```json
[
  {
    "commentId": 1,
    "authorNickname": "finplayer",
    "content": "댓글 본문",
    "createdAt": "2026-07-27T12:00:00",
    "parentCommentId": null,
    "replies": [
      {
        "commentId": 2,
        "authorNickname": "another",
        "content": "대댓글 본문",
        "createdAt": "2026-07-27T12:05:00",
        "parentCommentId": 1,
        "replies": []
      }
    ]
  }
]
```

댓글이 없으면 `[]`다(오류 아님).

### `replies`의 정확한 형태

`replies`는 **부모와 완전히 같은 Comment 타입의 배열**이다 — 축소 타입이 아니다. 재귀적으로 동일한 5개 필드(`commentId`·`authorNickname`·`content`·`createdAt`·`parentCommentId`·`replies`)를 갖는다. 타입은 자기참조 구조로 선언하면 그대로 맞는다.

| 필드 | 타입 | nullable |
|---|---|---|
| `commentId` | `Long` | non-null |
| `authorNickname` | `String` | non-null |
| `content` | `String` | non-null |
| `createdAt` | `LocalDateTime` | non-null |
| `parentCommentId` | `Long` | 부모 댓글은 `null`, 대댓글은 부모의 `commentId` |
| `replies` | `Comment[]` | non-null. 자식 없으면 `[]`. **대댓글의 `replies`는 항상 `[]`** |

`updatedAt`은 없다. 댓글 수정 API도 없다.

### 정렬 보장

- 최상위 배열에는 **부모 댓글(`parentCommentId=null`)만** 들어간다 — 대댓글이 최상위로 중복 노출되지 않는다.
- 최상위: `createdAt` **오름차순**(오래된 것 먼저), 동시각은 `commentId` **오름차순** 안정 정렬.
- 각 부모의 `replies`: **같은 정렬 규칙**(`createdAt` 오름차순, 동시각 `commentId` 오름차순).

### 페이지네이션 — 여전히 없다

`api-contracts.md`의 이 절에는 `page`·`size`·`cursor`·`limit`·상한 개수 어떤 것도 없고 응답도 페이지 메타 없는 bare array다. **COM-005 중첩 이후에도 페이지네이션은 도입되지 않았다** — 부모·자식 전부를 한 응답에 받아 전부 렌더한다. 댓글 총량 상한도 문서에 명시 없음.

### 오류

| HTTP | code | 트리거 |
|---|---|---|
| 401 | `UNAUTHORIZED` | Access 인증 실패 |
| 404 | `NOT_FOUND` | 게시물 미존재 |

---

## 6. POST /api/community/posts/{postId}/comments — 댓글·대댓글 작성 (COM-005)

### 요청

경로 변수 `postId`. 본문.

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `content` | `String` | 필수 | 최대 1,000자. 누락·공백만은 400 |
| `parentCommentId` | `Long` | 선택·nullable | 지정 시 **같은 게시물의 기존 부모 댓글 ID**여야 한다. 생략·`null`이면 부모 댓글(0단계)로 생성 |

### 성공 응답 — 201 Created

```json
{
  "commentId": 1,
  "authorNickname": "finplayer",
  "content": "댓글 본문",
  "createdAt": "2026-07-27T12:00:00",
  "parentCommentId": null,
  "replies": []
}
```

목록의 항목과 동일한 DTO다. 대댓글로 생성했으면 `parentCommentId`가 부모 id로 채워지고 `replies`는 `[]`다. 작성자는 Access Token의 인증 사용자로 결정한다.

### 1단계 제한

깊이는 부모·자식 **2단계로 고정**이다. 대댓글에 다시 답글을 달 수 없다.

### 오류

| HTTP | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `content` 누락·공백만·1,000자 초과 |
| 400 | `VALIDATION_ERROR` | `parentCommentId`가 **이미 대댓글인 댓글** — message는 "대댓글에는 답글을 남길 수 없습니다" |
| 401 | `UNAUTHORIZED` | Access 인증 실패 |
| 404 | `NOT_FOUND` | `parentCommentId`가 **존재하지 않음** |
| 404 | `NOT_FOUND` | `parentCommentId`가 **다른 게시물 소속** |
| 404 | `NOT_FOUND` | 게시물(`postId`) 미존재 |

`NOT_FOUND` 세 케이스(게시물 없음 / 부모 없음 / 부모가 남의 게시물 소속)는 **코드가 모두 `NOT_FOUND`로 같아 구별할 수 없다.** 프론트에서 "게시물이 사라졌다"와 "답글 대상이 사라졌다"를 다르게 처리하려면 코드가 아닌 요청 컨텍스트(`parentCommentId`를 보냈는지)로 분기해야 한다. 검증 순서도 문서에 명시 없음.

---

## 7. DELETE /api/community/comments/{commentId} — 댓글 삭제 (CASCADE)

경로가 게시물 하위가 아니라 **`/api/community/comments/{commentId}`로 분리**되어 있다(`CommentController`). `postId`를 넘기지 않는다.

### 요청

경로 변수 `commentId`. 본문 없음.

### 성공 응답 — 204 No Content, 본문 없음

### CASCADE

부모 댓글(대댓글을 가진 댓글)을 삭제하면 **자식 대댓글도 DB `ON DELETE CASCADE`로 함께 삭제된다.** 소유권 검사는 **부모 댓글에 대해서만** 수행한다 — 즉 남이 쓴 대댓글도 내 부모 댓글을 지우면 함께 사라진다. 응답은 삭제된 자식 목록을 알려주지 않으므로 프론트는 로컬 상태에서 그 부모의 `replies`까지 스스로 제거해야 한다.

### 오류

| HTTP | code | 트리거 |
|---|---|---|
| 401 | `UNAUTHORIZED` | Access 인증 실패 |
| 403 | `FORBIDDEN` | 작성자 불일치 |
| 404 | `NOT_FOUND` | 댓글 미존재 |

### 참고 — 게시물 삭제와의 관계

`DELETE /api/community/posts/{postId}`(204)는 해당 게시물의 댓글을 먼저 모두 삭제한 뒤 게시물을 삭제한다.

---

## 8. GET /api/instruments/{instrumentId}/candles — 캔들 조회 (MKT-009)

### 요청

경로 변수 `instrumentId`.

| 쿼리 | 타입 | 필수 | 값·형식 |
|---|---|---|---|
| `interval` | `String` | **필수** | `1m` \| `1d` \| `1w` \| `1M` 중 정확히 하나. **대소문자 구분** |
| `from` | ISO-8601 `LocalDateTime` | 선택 | 예: `2026-07-27T09:00:00`. 오프셋·`Z` 금지 |
| `to` | ISO-8601 `LocalDateTime` | 선택 | 같은 형식. **항상 inclusive** |

### `interval` — 대소문자가 의미를 바꾼다

- `1m` = 1분봉, `1d` = 일봉, `1w` = 주봉, `1M` = **월봉**.
- **`1m`(분봉)과 `1M`(월봉)은 대소문자만 다른 서로 다른 값이며 서버는 정규화하지 않는다.** 문자열을 `toLowerCase()`·`toUpperCase()` 하는 순간 잘못된 봉을 받거나 400이 된다.
- `1D`·`1W`·`1MO`·`1min` 등 어떤 변형도 400 `VALIDATION_ERROR`다.
- **검증 순서: `interval`이 `instrumentId` 존재 확인보다 먼저다.** 없는 종목 + 잘못된 `interval`은 404가 아니라 400이다.

### `from`·`to` 의미 — 시장·interval별로 해석이 다르다

| 대상 | `from`/`to` 해석 | `from > to` 판정 기준 |
|---|---|---|
| 주식 `1m` | **날짜 성분 무시, 시각(시:분:초)만 사용.** 결과는 항상 현재 재생 중인 단일 거래일 안이다 | 시각만 비교 |
| 주식 `1d`·`1w`·`1M` | **시각 성분 무시, 날짜 성분만 사용.** 버킷 시작일이 `[from의 날짜, to의 날짜]`(양끝 포함)에 있으면 포함 | 날짜만 비교 |
| 코인 전 interval | **날짜 + 시각 전체를 사용** | 전체 시각 비교 |

이 차이 때문에 **같은 `from`·`to` 쌍이 주식 집계에서는 통과하고 코인에서는 400이 될 수 있다.** 예로 주식 `1m`에서는 `from=2026-07-23T09:00:00`·`to=2026-07-22T09:01:00`이 (시각 09:00 ≤ 09:01이므로) 통과하지만, 반대로 `from=2026-07-22T09:01:00`·`to=2026-07-23T09:00:00`은 시각이 역전되어 400이다.

`from`·`to`를 **모두 생략**하면 공개 상한까지의 최신 200개다 — 주식 `1m`은 재생 중 거래일 중 이미 공개된 분봉, 주식 `1d`·`1w`·`1M`은 최신 200개 버킷, 코인은 진행 중 봉을 포함한 최신 200개.

`to`는 `1m`·`1d`·`1w`·`1M` 공통으로 **inclusive**다 — `to`와 정확히 같은 시각에 시작하는 봉도 포함된다(이슈 #157). 클라이언트가 "오늘 날짜"·"이번 주 월요일"을 경계 보정 없이 그대로 `to`로 보내면 된다.

### 성공 응답 — 200 OK, bare array

```json
[
  {
    "sourceTime": "2026-07-22T09:00:00",
    "open": 71000,
    "high": 71500,
    "low": 70900,
    "close": 71200,
    "volume": 12345
  }
]
```

| 필드 | 타입 | 비고 |
|---|---|---|
| `sourceTime` | `LocalDateTime` | 버킷 시작 시각. 집계 봉은 버킷 시작일 `T00:00:00` |
| `open` | 숫자 | — |
| `high` | 숫자 | — |
| `low` | 숫자 | — |
| `close` | 숫자 | — |
| `volume` | `BigDecimal` | **코인 소수 수량 표현용**(예: `0.26725783`). 주식은 정수 합계(`12345`) |

- 정렬. `sourceTime` **오름차순**.
- 개수. **모든 `interval`·모든 시장 공통 최대 200개.** 초과 구간은 `to` 기준 **최신 200개**만 반환한다. 200개 넘는 구간을 이어붙이는 페이징은 범위 밖이다.
- 응답 형식은 주식·코인이 완전히 같다 — `market`으로 파싱을 나눌 필요가 없다. 단 미마감/미완성 봉 규칙은 다르다(아래).
- `sourceTradingDate`는 캔들 응답에 **없다**(현재가 API에만 있는 필드).

### 주식 집계 규칙 (`1d`·`1w`·`1M`)

- 원천은 `stock_candles` 1분봉뿐이고 **집계 결과를 저장하지 않는다**(신규 테이블 없음).
- 버킷 경계. `1d` = 거래일(`trading_date`) 하나. `1w` = 그 거래일이 속한 주로 **월요일 시작**(ISO-8601, KST). `1M` = 그 거래일이 속한 달력월로 **1일 시작**(KST).
- `sourceTime`은 버킷 시작일 `T00:00:00`이다. **월요일·1일이 실제 거래일이 아니어도 라벨로만 쓴다** — 그 날짜에 장이 열렸다는 뜻이 아니다.
- OHLCV는 버킷 안 분봉의 최초 `open`·최대 `high`·최소 `low`·최종 `close`·합계 `volume`이다.
- 공개 상한(reveal bound). 오늘 `READY` 재생세션이 없으면 **어떤 `interval`이든 200 `[]`**. 있으면 재생거래일보다 이전 거래일은 전량 집계, 재생거래일 당일은 `1m`과 같은 공개 컷오프(09:01 이전 0개, 09:01부터 컷오프까지)까지만 집계, 재생거래일 이후 거래일은 방어적으로 제외한다.
- **미완성 버킷은 응답에 포함된다.** 진행 중인 거래일·주·월도 이미 공개된 분봉만으로 계산해 노출한다. 공개된 분봉이 0개인 버킷만 빠진다. 즉 같은 요청을 다시 보내면 마지막 봉의 값이 자란다.
- **거래일이 없는 주·월은 응답에 아예 없다** — 빈 봉으로 채우지 않으며 **반환된 봉 사이가 달력상 연속임을 보장하지 않는다.** 캔들 인덱스를 날짜 격자로 가정하면 안 된다.

### 주식 `1m` 규칙 (회귀 없음)

- **아직 마감하지 않은 분봉은 어떤 경우에도 제외된다.** 09:00~09:00:59 구간에는 첫 분봉조차 마감 전이라 **빈 배열**이다. 09:01부터 마감된 마지막 분봉까지, 15:30 이후에는 그날 공개된 전체가 후보다.
- `1m`은 **미마감 제외**, 집계(`1d`·`1w`·`1M`)는 **미완성 포함** — 같은 시장 안에서도 규칙이 반대다.
- 재생세션이 `READY`가 아니거나(`PREPARING`·`FAILED`) 그 서비스 날짜의 세션이 없으면 예외 없이 **200 + `[]`**다. 가격 API가 같은 상황에서 409 `PRICE_UNAVAILABLE`을 내는 것과 다른 계약이다.
- `sourceTime`의 날짜는 오늘이 아니라 원본 거래일이다.

### 코인 위임 규칙

- 4개 `interval` 모두 빗썸 공개 캔들 REST에 위임한다. `1m`→`/v1/candles/minutes/1`, `1d`→`/v1/candles/days`, `1w`→`/v1/candles/weeks`, `1M`→`/v1/candles/months`. 인증·API Key 불필요.
- **저장·캐시 없음** — MySQL에 코인 캔들 테이블을 만들지 않는다. 예외는 MKT-010(이슈 #242)로 추가된 **`1m` 전용 Redis 캐시**다. 서버가 빗썸 `transaction` 스트림으로 만든 진행 중 분봉을 Redis에 두고, 캐시에 없는 구간만 REST로 보충한다. `1d`·`1w`·`1M`은 캐시 없이 전량 위임이다.
- **실시간 차트다 — 과거 재생이 아니다.** 11:43:06에 조회하면 `11:43`·`11:42`·`11:41` 봉이 온다.
- **진행 중(미마감) 봉을 포함한다.** 같은 요청을 다시 보내면 마지막 봉의 `high`·`low`·`close`·`volume`이 자란 값으로 온다 — 정상 동작이다. 주식 `1m`이 미마감을 제외하는 것과 의도적으로 다르다.
- 전용 스트림이 없다. 부드러운 갱신은 프론트가 짧은 주기로 재호출하는 방식이다.
- 버킷 경계는 **빗썸이 준 값을 그대로 쓴다.** 서버가 다시 자르거나 묶지 않고 `candle_date_time_kst`를 `sourceTime`으로 매핑한다. 필드 매핑은 `trade_price`→`close`(이름과 달리 현재가가 아니다), `candle_acc_trade_volume`→`volume`(거래대금 `candle_acc_trade_price`가 아니다). 빗썸의 일·주·월 전용 필드(`prev_closing_price`·`change_price`·`change_rate`·`first_day_of_period`)는 응답에 내려오지 않는다.
- 2026-08-03 외부 스모크 관측상 빗썸 일봉은 KST 자정·그날 날짜, 주봉은 KST 자정·**월요일**, 월봉은 KST 자정·**1일**이어서 주식 버킷 경계와 사실상 일치했다. 다만 서버는 이 일치를 전제로 보정하지 않으므로 빗썸이 경계를 바꾸면 다시 벌어질 수 있다.
- 캔들 경로는 `PriceStore`(Redis 현재가)·`PriceQueryService`를 거치지 않고 **현재가 경로와 완전히 독립**이다. 현재가가 409인 상태에서도 캔들은 200일 수 있고, 그 반대도 가능하다. 차트 봉과 최신 틱이 밀리초 단위로 일치하지 않을 수 있으며 서버가 보정하지 않는다.
- **코인 `instrumentId`는 더 이상 400이 아니다**(Issue #20). Issue #17 시절 "주식 종목만 캔들 조회를 지원합니다" 400은 계약에서 제거됐다 — 프론트에 그 분기가 남아 있으면 정리한다.

### 오류

| HTTP | code | 트리거 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `interval`이 4값이 아님(대소문자 변형 `1D`·`1W`·`1MO`·`1min` 포함) |
| 400 | `VALIDATION_ERROR` | `from > to` — 판정 기준은 시장·`interval`별로 다름(위 표) |
| 401 | `UNAUTHORIZED` | Access 인증 실패 |
| 404 | `NOT_FOUND` | 존재하지 않는 `instrumentId` |
| 502 | `MARKET_DATA_PROVIDER_ERROR` | **코인** 빗썸 조회 실패. 빈 배열 200으로 위장하거나 이전 값으로 대체하지 않는다 |

- 오류 계약은 `1m`만 지원하던 때와 **동일하며 013에서 바뀌지 않았다** — 확장된 것은 `interval` 허용값뿐이다.
- 502는 코인 전용 경로다. 주식의 200 `[]`("아직 공개할 봉이 없다"는 정상 상태)와 성격이 완전히 다르다.
- MKT-010 이후 코인 `1m`에서 요청 구간이 Redis 캐시로 전부 커버되면 빗썸을 호출하지 않으므로 그 시점의 빗썸 장애가 502를 내지 않는다. Redis 장애 시에는 반대로 전량 빗썸 위임이다.
- `interval` 누락 시의 코드는 문서에 명시 없음(필수 파라미터이므로 400 `VALIDATION_ERROR`로 추정 — MUST-VERIFY).

---

## 9. 작성자 식별 — COM-004/005는 아무것도 바꾸지 않았다

`api-contracts.md`의 community 절 전체에서 응답에 노출되는 작성자 식별자는 **`authorNickname`뿐**이다. `authorId`·`memberId`·`userId` 같은 필드는 게시물 응답에도, 댓글·대댓글 응답에도 **없다.** COM-004(태그)는 instrument 세 필드만 추가했고, COM-005(대댓글)는 `parentCommentId`·`replies`만 추가했다.

따라서 기존 프론트 전략이 그대로 유효하다.

- 소유 판정 신호는 `authorNickname === member.nickname` 비교뿐이다.
- **최종 권위는 서버의 403 `FORBIDDEN`이다.** 닉네임 비교는 버튼 표시용 힌트에 불과하다(닉네임 변경 API가 존재하므로 동명이인·변경 이력에 의한 오판이 원리적으로 가능하다).
- 대댓글도 같은 규칙이다. 다만 CASCADE 때문에 "내가 지울 수 있는 대상"과 "실제로 사라지는 대상"이 다르다 — 내 부모 댓글을 지우면 남의 대댓글도 사라지는데, 그 남의 대댓글에는 내 삭제 버튼이 뜨지 않는다.

---

## 10. 기존 프론트 코드와의 불일치 목록

### `src/services/types.ts`

| 위치 | 현재 | 필요한 변경 |
|---|---|---|
| `Post` (L276-283) | `postId`·`authorNickname`·`title`·`content`·`createdAt`·`updatedAt` | **태그 3필드 없음.** `instrumentId: number \| null`, `instrumentSymbol: string \| null`, `instrumentName: string \| null` 추가 필요 |
| `Post` 주석 | "authorId 가 없어 소유 판정은 authorNickname 비교뿐이다" | **여전히 정확하다.** 유지 |
| `PostCreateRequest` (L295-298) | `title`·`content` | `instrumentId?: number \| null` 추가 |
| `PostUpdateRequest` (L300-303) | `title`·`content` | `instrumentId?: number \| null` 추가. 주석 "두 필드 모두 필수"를 "세 필드 전체 교체"로 갱신 |
| `Comment` (L306-311) | 4필드 | `parentCommentId: number \| null`, `replies: Comment[]` 추가(자기참조) |
| `Comment` 주석 (L305) | "createdAt 오름차순, 페이지네이션·수정·**대댓글**·좋아요 없음" | **대댓글이 생겼으므로 틀렸다.** 페이지네이션·수정·좋아요 없음은 여전히 맞다 |
| `CommentCreateRequest` (L314-316) | `content` | `parentCommentId?: number \| null` 추가 |
| `Candle` 주석 (L118-123) | "`?interval=1m`" 전제로만 서술 | `1d`·`1w`·`1M` 추가, from/to 해석이 interval별로 다름, 최대 200개 공통, 코인 502를 반영해 갱신 |
| `PostPage` (L285-292) | `content`·`page`·`size`·`totalElements`·`totalPages`·`hasNext` | **계약과 정확히 일치. 변경 불필요** |

### `src/services/communityService.ts`

- `getPosts` (L13-17). `instrumentId` 필터를 전달하지 않는다. 기본 `size`가 20이라 서버 기본 10과 다르다(항상 명시 전송이므로 버그는 아님).
- `updatePost` (L28-30). **`title`·`content`만 보낸다 → 서버가 `instrumentId`를 `null`로 간주해 태그를 해제한다. 데이터 손실.** 주석 "title·content 를 모두 보내야 한다"도 `instrumentId` 포함으로 갱신 필요.
- `createPost` (L19-21). `instrumentId`를 실을 통로가 없다.
- `getComments` (L37-39). 반환 타입 `Comment[]`은 여전히 맞지만 각 항목이 중첩 `replies`를 갖는다. 주석 "bare array, 페이지네이션이 없어 전부 렌더한다"는 **여전히 정확하다**.
- `createComment` (L41-43). `parentCommentId`를 실을 통로가 없다.
- `deleteComment` (L46-48). 경로는 맞다. **CASCADE 언급이 없다** — 호출자가 자식까지 로컬에서 제거해야 한다.

### `src/services/instrumentService.ts`

- `getCandles` (L57-66)이 **`interval: '1m'`을 하드코딩**한다. `interval` 파라미터를 받도록 확장해야 한다. 주석 "interval 은 항상 '1m'"도 틀렸다.
- 타입은 리터럴 유니온 `'1m' | '1d' | '1w' | '1M'`으로 두어 대소문자 오타를 컴파일 타임에 막는 것이 좋다.
- `Instrument` 캐시(`getCachedInstrument`)는 태그 배지에 **필요하지 않다**(응답에 symbol·name이 온다). 태그 선택 드롭다운을 만들 때는 필요하며, 이때 `tradable=false` 종목을 후보에서 제외해야 400을 사전에 막는다.

### `src/hooks/useCandles.ts`

- `getCandles(instrumentId, { signal })`만 호출해 `interval`을 전달할 수 없다. `interval`을 파라미터로 받아 effect 의존성에 넣어야 한다.
- `MAX_BARS = 400`이지만 서버 상한은 200이다. `1m` 폴링 누적에는 의미가 있으나 집계 봉에서는 도달하지 않는다.
- `sourceTime` 키 upsert 병합(L51)은 **`1m`에는 맞지만 집계 봉에는 위험하다.** `1d`·`1w`·`1M`은 미완성 버킷이 포함되어 값이 자라므로 upsert 자체는 맞게 동작하지만, `interval`을 바꿀 때 이전 `interval`의 봉이 섞이면 차트가 깨진다. 초기화 effect(L38-41)의 의존성이 `[instrumentId, market]`뿐이므로 **`interval`을 반드시 추가**해야 한다.
- 갱신 트리거가 `market === 'CRYPTO'`면 폴링, 아니면 `minuteTick`이다. 집계 봉(`1d`·`1w`·`1M`)에는 분 단위 재조회가 과도하다 — `interval`별 갱신 정책 분리를 검토한다.
- ISO 문자열 사전순 = 시간순 가정(L53)은 집계 봉(`...T00:00:00`)에도 그대로 유효하다.

### `src/pages/Community.tsx`

- `createPost({ title, content })` (L69)에 태그 입력이 없다. 종목 선택 UI 신설 필요.
- 목록 카드(L201-217)에 태그 배지가 없다. `post.instrumentSymbol`·`post.instrumentName`을 그대로 쓸 수 있다.
- 태그 필터 UI가 없다. `getPosts({ instrumentId })` 배선 필요.
- `VALIDATION_ERROR` 메시지가 "제목과 내용을 다시 확인해 주세요."(L78)로 고정이라 **태그 실패(없는/비활성 종목)를 이 문구가 잡아먹는다.** 코드로 구별 불가하므로 문구를 태그까지 포함하도록 넓혀야 한다.
- `PAGE_SIZE = 10`은 서버 기본과 일치하고 1~50 범위 안이다.

### `src/pages/CommunityPost.tsx`

- `handleSave` (L100-103)가 `title`·`content`만 보낸다 → **태그 해제 데이터 손실.** `instrumentId`를 편집 상태에 넣어 함께 보내야 한다.
- 편집 폼 안내 문구 "제목과 내용이 모두 저장됩니다."(L259-261)도 태그 포함으로 갱신 필요.
- `comments` 상태가 평면 배열이고 렌더(L370-412)가 1단이다. 중첩 렌더·들여쓰기·답글 버튼이 필요하다.
- 댓글 수 표시 `comments.length`(L336)는 **부모 댓글 수만 센다** — 대댓글이 빠진다. 총계는 `parents + Σreplies`로 계산해야 한다.
- `handleCommentSubmit` (L147-149)이 새 댓글을 항상 배열 끝에 붙인다. 대댓글은 끝이 아니라 **해당 부모의 `replies` 끝**에 넣어야 한다.
- `handleCommentDelete` (L167-173)가 최상위 배열만 필터한다. 부모 삭제 시 **자식 CASCADE 반영이 없고**, 대댓글 삭제 시 `replies` 안을 찾지 못한다.
- 게시물 상세에 태그 배지 표시가 없다.
- 답글 작성 시의 `VALIDATION_ERROR`("대댓글에는 답글을 남길 수 없습니다")·`NOT_FOUND`(부모 없음/다른 게시물 소속) 분기가 없다. 특히 `NOT_FOUND`를 지금은 무조건 `setGone(true)`(L152-155)로 처리하는데, **답글 실패의 404는 게시물이 사라진 것이 아니므로 페이지 전체를 "삭제된 게시글"로 만들어버리는 오작동**이 된다.
- 낙관적 렌더 대신 실패 시 `getComments` 재조회로 서버 정렬·CASCADE 결과를 신뢰하는 편이 안전하다.

### `src/components/CandleChart.tsx`

- 파일 헤더·`aria-label`(L72, L111)·기본 `emptyMessage`(L45)가 모두 "1분봉"으로 하드코딩되어 있다. `1d`·`1w`·`1M`에서 문구가 거짓말이 된다.
- X축 라벨이 `formatHhMm`(L170, L180)으로 **시:분만** 그린다. 집계 봉의 `sourceTime`은 전부 `T00:00:00`이므로 **모든 라벨이 "00:00"으로 나온다.** `interval`에 따라 날짜 포맷으로 갈아타야 한다.
- `maxBars = 120`(narrow 60)은 서버 상한 200 이하라 안전하다.
- 빈 배열을 정상 상태로 처리하는 설계(L64-87)는 계약과 맞다 — 재생세션 미준비의 200 `[]`가 그대로 여기 걸린다.
- 봉 `key`가 `b.sourceTime`(L143)이라 `interval` 전환 시 키 충돌 없이 재마운트된다.

---

## 11. MUST-VERIFY (문서에 명시가 없어 서버로 확인해야 하는 항목)

1. **`interval` 누락 시의 코드·상태.** 필수 파라미터인데 누락 케이스가 오류 표에 없다. 400 `VALIDATION_ERROR`로 추정.
2. **`tradable=false` 종목으로 목록 필터**할 때의 동작. "조회 조건일 뿐"이라는 서술상 과거 태그 게시물이 반환되어야 하지만 명시가 없다.
3. **검증 순서.** 게시물 PATCH의 400(본문·태그) / 403(소유) / 404(미존재) 우선순위, 댓글 작성의 게시물 404 vs 부모 404 vs 본문 400 우선순위가 모두 문서에 명시 없음. (주문 API는 "존재→소유→상태" 순서를 명시하는데 커뮤니티는 그런 언급이 없다.)
4. **댓글 총량 상한.** 페이지네이션이 없는데 한 게시물의 댓글·대댓글 총 개수 상한이 명시 없음 — 수천 건이면 응답이 커진다.
5. **`postId`·`commentId`가 숫자가 아닐 때**의 코드. 커뮤니티 절에는 명시 없음(instrument 절은 400 `VALIDATION_ERROR`).
6. **태그 400의 `message` 문구.** 미존재·비활성이 같은 코드라 문구 차이 여부가 유일한 단서인데 문서에 문구가 없다. 문구에 의존하지 말 것.
7. **게시물에 태그된 종목이 나중에 `tradable=false`로 바뀌면** 기존 게시물의 응답이 어떻게 되는지(태그 유지 vs `null`) 명시 없음.

---

## 프론트 구현 시 함정

1. **PATCH가 태그를 지운다.** `updatePost`에 `instrumentId`를 안 실으면 서버는 "태그 해제"로 읽는다. 제목만 고쳤는데 종목 태그가 사라진다. 수정 폼은 로드한 `post.instrumentId`를 상태에 담아 **항상 재전송**해야 한다. 사용자가 태그를 의도적으로 떼는 UI와 "안 보낸 것"이 서버에서 구별되지 않는다는 점도 함께 설계해야 한다.

2. **`1m`과 `1M`은 다른 봉이다.** 분봉과 월봉이 대소문자만 다르다. 서버는 정규화하지 않는다. `interval.toLowerCase()`·`toUpperCase()`·URLSearchParams를 거치며 케이스가 바뀌는 코드 경로, 그리고 셀렉트 박스의 `value`를 소문자로 통일하는 습관이 그대로 버그다. 리터럴 유니온 타입으로 못 박고, 대소문자 변환을 절대 하지 않는다.

3. **`interval`을 바꿀 때 봉 캐시를 비우지 않으면 차트가 섞인다.** `useCandles`의 초기화 effect 의존성이 `[instrumentId, market]`뿐이다. 분봉과 일봉이 같은 Map에 upsert되면 축이 무너진다. `interval`을 의존성에 추가한다.

4. **집계 봉의 X축이 전부 "00:00"이 된다.** `1d`·`1w`·`1M`의 `sourceTime`은 항상 `날짜T00:00:00`이다. `formatHhMm`을 그대로 쓰면 모든 라벨이 같아진다. `interval`별 라벨 포맷 분기가 필수다.

5. **집계 봉 라벨의 날짜는 거래일이 아니다.** 주봉의 `sourceTime`은 그 주 월요일, 월봉은 1일인데 **그날 장이 열렸다는 뜻이 아니다** — 라벨 전용이다. "이 날짜의 시세"라고 표시하면 거짓이 된다.

6. **집계 봉은 달력상 연속이 아니다.** 거래일이 없는 주·월은 응답에 아예 빠지고 빈 봉으로 채우지도 않는다. 배열 인덱스를 균등 시간 격자로 가정해 X 좌표를 잡으면 간격이 왜곡된다(현재 `CandleChart`가 인덱스 기반이므로 이 왜곡을 그대로 갖는다 — 의도된 단순화인지 결정할 것).

7. **미마감 규칙이 시장·interval별로 반대다.** 주식 `1m`은 미마감 분봉을 **제외**하고, 주식 집계와 코인 전 interval은 진행 중 버킷을 **포함**한다. 마지막 봉의 값이 재조회마다 자라는 것은 정상이며 "데이터가 튄다"고 판단해 방어 로직을 넣으면 오히려 틀린다.

8. **`200 []`는 오류가 아니다.** 재생세션 미준비(`PREPARING`·`FAILED`·세션 없음)와 09:00~09:00:59 첫 분봉 구간은 모든 `interval`에서 정상적으로 빈 배열이다. 같은 상황에서 현재가 API는 409 `PRICE_UNAVAILABLE`을 내므로 두 화면 상태가 어긋난다 — 차트는 "표시할 봉 없음", 시세는 "가격 없음"으로 각각 처리한다.

9. **코인 502를 오류로, 주식 빈 배열을 정상으로 나눠야 한다.** 코인 빗썸 실패는 502 `MARKET_DATA_PROVIDER_ERROR`이고 서버가 빈 배열로 위장하지 않는다. 502는 재시도 안내, 200 `[]`는 빈 상태 문구로 구분한다. 반대로 코인 `interval=1m`은 Redis 캐시가 구간을 덮으면 빗썸 장애에도 200이 나오므로 502가 산발적으로만 뜬다.

10. **`from > to` 판정 기준이 시장·interval별로 다르다.** 주식 `1m`은 시각만, 주식 집계는 날짜만, 코인은 전체 시각으로 비교한다. 하나의 날짜 피커 값을 세 경로에 그대로 넘기면 코인에서만 400이 터지는 일이 생긴다. `to`는 항상 inclusive이므로 `-1초`·`-1일` 같은 경계 보정을 넣지 말 것(넣으면 마지막 봉이 사라진다).

11. **200개 상한이 조용히 자른다.** 넓은 범위를 요청하면 오류 없이 `to` 기준 최신 200개만 온다. "요청 구간이 다 왔다"고 가정하지 말고, 배열 길이가 200이면 더 있을 수 있다고 표시하거나 범위를 좁힌다. 페이징으로 이어붙이는 API는 없다.

12. **댓글 수를 `comments.length`로 세면 대댓글이 빠진다.** 최상위 배열은 부모만 담는다. 총계는 `parents.length + Σ parent.replies.length`다.

13. **부모 댓글 삭제가 남의 대댓글까지 지운다.** DB `ON DELETE CASCADE`이고 소유권 검사는 부모에만 한다. 응답(204)은 무엇이 지워졌는지 알려주지 않는다. 로컬 상태에서 그 부모의 `replies`까지 함께 제거하거나, 안전하게 `getComments`를 재조회한다. 삭제 확인 문구에 "달린 답글도 함께 삭제됩니다"를 넣는 것이 정직하다.

14. **답글 실패의 404를 "게시글 삭제됨"으로 오해하면 페이지가 날아간다.** 현재 `CommunityPost`는 어떤 `NOT_FOUND`든 `setGone(true)`로 상세 화면을 폐기한다. 그런데 `parentCommentId`가 없거나 다른 게시물 소속일 때도 404 `NOT_FOUND`다. 답글 요청의 404는 **댓글 목록만 재조회**하고 인라인 오류로 처리해야 한다.

15. **대댓글에 답글 시도는 400이지 403·404가 아니다.** 코드가 `VALIDATION_ERROR`로 본문 길이 오류와 겹친다. 답글 UI를 대댓글에는 아예 렌더하지 않는 것이 1차 방어이고, 서버 400은 마지막 안전망으로 문구만 띄운다.

16. **태그 400은 미존재와 비활성을 구별할 수 없다.** 코드가 둘 다 `VALIDATION_ERROR`다. 종목 선택 UI에서 `tradable=false`를 애초에 후보에서 빼서 이 400을 만들지 않는 것이 유일한 실질적 대책이다. 오류 문구는 "제목·내용·종목을 다시 확인해 주세요" 수준으로 넓혀야 한다.

17. **목록 필터의 관용성과 작성의 엄격함이 다르다.** `GET ...?instrumentId=999999`는 400이 아니라 빈 목록이다. 필터가 조용히 0건이 되는 것을 "서버 오류"로 오인하지 말고, 태그 필터 배지를 노출해 사용자가 필터가 걸린 상태임을 알게 한다.

18. **태그 배지에 instrument 캐시 조인은 불필요하다.** 응답이 `instrumentSymbol`·`instrumentName`을 이미 준다. `symbol`·`name` 없이 `instrumentId`만 온다고 가정해 `ensureInstrumentCache()`를 기다리면 배지가 헛되게 늦게 뜬다. 단 `market`·`tickSize`·`tradable`은 응답에 없으므로 종목 상세로 링크를 걸며 시장 구분이 필요하면 그때만 캐시를 본다.

19. **태그 세 필드는 함께 null이거나 함께 non-null이다.** `instrumentId`만 보고 `instrumentSymbol!`로 단정하는 것은 계약상 안전하지만, 셋 중 하나만 검사하는 코드는 리팩터링에 취약하다. `instrumentId !== null`을 타입 가드 하나로 좁혀 쓴다.

20. **`authorId`는 여전히 없다.** COM-004·COM-005 어느 쪽도 작성자 id를 노출하지 않았다. 소유 판정은 `authorNickname` 비교뿐이고 **최종 권위는 403 `FORBIDDEN`**이다. 닉네임 변경 API가 존재하므로 낙관적 UI가 틀릴 수 있다 — 버튼은 힌트로만 두고 403을 항상 처리한다. 이 규칙은 대댓글에도 그대로 적용된다.

21. **댓글에 `updatedAt`이 없고 수정 API도 없다.** 게시물의 `isEdited` 패턴을 댓글에 복사하면 존재하지 않는 필드를 읽는다.

22. **댓글 페이지네이션이 여전히 없다.** 중첩 이후에도 bare array 전량 반환이다. 부모·자식 모두 한 번에 렌더되므로 댓글이 많은 게시물에서 렌더 비용이 선형으로 늘어난다. 서버 상한이 문서에 없으니 클라이언트 측 "더 보기" 접기를 자체적으로 두는 편이 안전하다.

23. **댓글 삭제 경로는 게시물 하위가 아니다.** `DELETE /api/community/comments/{commentId}`이며 `postId`를 받지 않는다. 대댓글도 같은 경로다.

24. **코인 캔들에 `sourceTradingDate` 개념이 없고, 캔들 응답 자체에 그 필드가 없다.** 현재가 응답과 혼동해 캔들에서 거래일을 읽으려 하면 `undefined`다. 주식 캔들의 `sourceTime` 날짜가 원본 거래일이라는 점(오늘이 아니다)도 그대로 유효하다.

25. **캔들과 현재가는 독립 경로다.** 코인 현재가가 409인데 캔들이 200일 수 있고, 캔들이 502인데 주문·현재가가 정상일 수 있다. 한쪽 실패로 화면 전체를 오류 상태로 만들면 과잉이다.

26. **"코인은 캔들 조회 400"이라는 옛 계약은 제거됐다**(Issue #17 → #20). 프론트에 코인 종목에서 차트를 감추거나 400을 분기하는 코드가 남아 있으면 함께 정리한다.
