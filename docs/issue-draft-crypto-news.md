# 이슈 초안 — 코인 뉴스 0건

> 백엔드 레포(`finplay-team/finplay`)에 올릴 초안이다. 프론트 레포에는 올리지 않는다.
> 템플릿은 `.github/ISSUE_TEMPLATE/bug.yml`(제목 접두 `[fix] `, 라벨 `bug`)을 따르되,
> 기존 이슈(#244 등)의 서술 방식(현상 → 근거 → 불확실한 것 명시 → 완료 조건)에 맞췄다.
>
> **라벨 제안**: `bug`, `scope:고도화`, `도메인:AI피드백`

---

## 제목

```
[fix][AI 피드백] 코인 뉴스가 한 건도 수집되지 않는다 — 수집 대상에는 들어가는데 적재가 0건
```

---

## 현상

**뉴스 수집이 코인 종목에 대해 한 건도 쌓이지 않는다.** 같은 배치가 도는 주식은 정상 적재된다.

로컬(`local,oauth-real,crypto-real`) 실측이다.

```sql
SELECT i.market, n.type, COUNT(*) AS cnt
FROM market_news_items n JOIN instruments i ON n.instrument_id = i.id
GROUP BY i.market, n.type;

-- market  type  cnt
-- STOCK   NEWS  192
-- (CRYPTO 행 자체가 없음)
```

`instrument_news_summaries`도 같다 — STOCK 32건, CRYPTO 0건. `market_briefings`도 STOCK 1건뿐이다.

그 결과 코인 쪽 세 경로가 전부 빈 응답이다. **오류가 아니라 계약대로의 `EMPTY`라 겉으로는 정상으로 보인다.**

```
GET /api/instruments/17/news        → {"originTradeDate":null,"summaryScope":"ROLLING_24H","summaryStatus":"EMPTY","summary":null,"items":[]}
GET /api/instruments/19/news        → 동일
GET /api/market/briefing?market=CRYPTO → {"market":"CRYPTO","originTradeDate":null,"status":"EMPTY","summary":null,"items":[]}
```

## 수집 대상에는 들어가 있다

`NewsCollectionService`의 뉴스 수집 루프는 두 시장을 모두 돈다.

```java
for (Market market : Market.values()) {
    List<Instrument> instruments = instrumentService.getInstrumentEntities(market);
    List<String> sameMarketNames = instruments.stream().map(Instrument::getName).toList();
    for (Instrument instrument : instruments) { ... }
}
```

공시만 `Market.STOCK`으로 한정돼 있는데(코인은 공시 개념이 없으므로) 이건 설계대로다.

즉 **"코인은 원래 대상이 아니다"로는 설명되지 않는다.** 코드상 대상인데 결과가 0이다.

## 배치는 실제로 돌았다

주식 192건이 쌓여 있으므로 `feedback.news.collect-cron`(`0 0/30 * * * *`)이 최소 한 번은 실행됐다.
API 키도 `.env`에 채워져 있다 — `NAVER_SEARCH_CLIENT_ID`·`NAVER_SEARCH_CLIENT_SECRET`·`DART_API_KEY`·`OPENAI_API_KEY` 모두 값이 있다.

**따라서 "아직 안 돌았다"·"키가 없다"도 원인이 아니다.**

## 원인은 확인하지 못했다

프론트 쪽에서 확인 가능한 범위가 여기까지다. 서버 로그와 수집기 내부를 봐야 판정할 수 있다.
**추측을 원인으로 적지 않기 위해 후보만 남긴다.**

- **검색어.** 종목 `name`(`비트코인`·`이더리움` 등)으로 네이버 뉴스를 검색하는데, 코인 이름의 검색 결과 특성이 주식 종목명과 다를 수 있다
- **교차 필터.** 같은 시장 종목명으로 거르는 `sameMarketNames` 로직이 코인에서 과하게 걸러낼 가능성
- **수집기 분기.** `NaverNewsCollector`가 시장별로 다르게 동작하는 부분이 있는지
- **저장 단계.** `findExistingUrls` 중복 제거에서 걸리는지

## 재현 방법

1. `SPRING_PROFILES_ACTIVE=local,oauth-real,crypto-real`로 기동한다
2. `feedback.news.collect-cron` 주기(30분)를 한 번 이상 지난다
3. 위 SQL을 실행한다 → `CRYPTO` 행이 나오지 않는다
4. `GET /api/instruments/{코인 id}/news`를 호출한다 → `summaryStatus="EMPTY"`, `items=[]`

## 기대 동작

- 코인 종목에 대해서도 `market_news_items`에 뉴스가 적재된다
- 적재된 뉴스를 근거로 `instrument_news_summaries`(`ROLLING_24H`)와 코인 `market_briefings`가 생성된다
- `GET /api/instruments/{코인 id}/news`가 `summaryStatus="READY"`와 `items`를 반환한다

## 완료 조건

**1단계 — 판정**

- [ ] 코인 수집이 어느 단계에서 0건이 되는지 확인한다 (검색 호출 자체 / 검색 결과 / 교차 필터 / 저장)
- [ ] 그 단계를 근거와 함께 이슈에 남긴다 — 로그 또는 실제 응답으로

**2단계 — 1단계 결과에 따른다**

- [ ] 수집이 가능한 문제면 고치고, **코인 종목 한 건 이상이 실제로 적재되는 것을 확인한다**
- [ ] 코인 뉴스를 이 소스로는 얻을 수 없다는 결론이면, `docs/specs/012-ai-feedback`에 그 사실과 근거를 남기고
      `ROLLING_24H` 요약·코인 브리핑이 상시 `EMPTY`임을 계약으로 명시한다 — 지금은 "언젠가 채워질 것"처럼 읽힌다

**공통**

- [ ] 기존 테스트가 전부 그대로 통과한다
- [ ] 수집 전후로 주문·체결·계좌·잔액·보유·손익 원장이 변하지 않는다

## 제외 범위

- **주식 뉴스 경로.** 192건 정상 적재되므로 대상이 아니다
- **공시(DART) 수집.** 설계상 주식 전용이며 이 이슈에서 바꾸지 않는다
- **변동 원인 카드(`price_move_events`)가 0건인 것.** 뉴스가 선행 조건이라 같이 해결될 수 있으나,
  별개 원인일 수 있어 이 이슈에서 판정하지 않는다
- **재생세션 미준비로 주식 뉴스 API가 `NOT_YET`을 반환하는 것.** 로컬 환경 문제이지 결함이 아니다

## 관련 스펙

`docs/specs/012-ai-feedback`

## 프론트 영향 (참고)

프론트는 이미 `EMPTY`를 정상 상태로 처리하고 있어 화면이 깨지지는 않는다.
다만 코인 탭에서 뉴스·브리핑·변동 원인이 **항상 빈 상태**로만 보이므로,
이 이슈가 해결되기 전에는 코인으로 AI 피드백을 시연할 수 없다.
