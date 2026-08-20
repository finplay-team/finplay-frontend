# 백엔드 세션에 가져갈 프롬프트 — 튜토리얼 게이트형 3단계

작성 2026-08-20, finplay-frontend 세션. 아래 내용을 그대로 복사해 `finplay`(백엔드) 레포의 새
Claude Code 세션에 붙여넣으면 된다. 근거는 이 레포의 `checklist.md` 9차 D·`context-notes.md`
D31·D33·D34, `docs/backend-issues.md`의 "education (튜토리얼)" 절.

> ## ⚠️ 2026-08-20 정정 — 이 문서는 처리가 끝났고, 조사 항목 1번은 전제가 틀렸다
>
> 백엔드 세션이 이 프롬프트로 작업을 마쳤다. **이 문서를 다시 백엔드에 넘기지 마라.**
> 최신 상태는 `checklist.md` 9차 D의 회신 블록과 `context-notes.md` D35~D38에 있다.
>
> **아래 "확인·구현이 필요한 것" 1번(evidence 체인이 재진입을 아는가)은 전제가 틀렸다.**
> 세 가지가 코드로 확인됐다.
>
> 1. **재진입해도 두 번째 holding은 생기지 않는다** — `V10`의
>    `uk_holdings_account_instrument UNIQUE (account_id, instrument_id)` 때문에 계좌·종목당 보유
>    행은 하나뿐이다. "두 번째 holding이 생기면"으로 시작하는 시나리오가 성립하지 않는다.
> 2. **샌드박스 attempt는 `MarketPracticeChainResolutionService`를 아예 타지 않는다** —
>    `PracticeHoldingObservationService`가 `isTutorialSample()`로 먼저 갈라
>    `createAttemptObservation` → `PracticeAttemptEvidenceService.requireCurrentRun`으로 간다.
>    026 chain 해석은 **attempt가 없는 legacy 사용자용 폴백**이다.
> 3. **그 경로는 `entrySequence`를 이미 안다** — 관찰 필터 기준선이 **첫 진입** snapshot
>    (`PracticeRiskSnapshot.FIRST_ENTRY_SEQUENCE`)에 고정돼 있고, 소스 주석이 이유까지 적어 뒀다.
>    "이 자리에 최신 진입을 쓰면 재매수 순간 이전 관찰이 사라진다."
>
> `PracticeScenarioFullJourneyIntegrationTest`(PR #494)가 매수 → 관찰 3건 → 손절 → 재매수 →
> 익절 → 복기 → 완료를 실제 MySQL로 완주해 이를 검증한다. **따라서 프론트가 재진입 UI를 보류할
> 이유는 없다.**
>
> 나머지 항목의 처리 결과 — 2번(진입별 주문유형)은 `entries[].buyOrderType`으로 들어왔고,
> 3번(순서 강제)은 **판정만** 들어왔다(`tutorialStageProgress`, 거부는 아직 없다).
> 4번(041 대본 궁합)은 제품 판단이라 그대로 남았다.

---

## 백엔드 세션에 붙여넣을 프롬프트

```
튜토리얼(코인) 매수 단계를 "2-1 시장가 체험 → 2-2 지정가 체험 → 3단계 손절익절 프리셋 체험"으로
나누고, 각 단계는 이전 단계를 실제로 마쳐야 열리는 진짜 잠금 구조로 만들려 한다. finplay-frontend
세션에서 이미 코드를 읽고 조사해 둔 내용이 있다.

## 이미 되어 있는 것 (dev 브랜치 코드로 확인함, 다시 만들 필요 없음)

- 한 run 안에서 여러 번 사고파는 것 자체는 이미 지원된다. `PracticeRiskSnapshot.entrySequence`,
  `InvestmentPracticeQueryService.exitPresetLocked()`가 실제 순보유수량(`TradeService.
  netFilledQuantity`)으로 "지금 보유 중인가"를 매번 다시 계산해 다 팔면 자동으로 잠금이 풀린다.
- `GET /api/education/practice`의 `entries[]`가 진입마다 프리셋·기준선·매도이유·손익을 따로
  담아 재진입 이야기를 완료 화면에 보여준다(041/042, PR #494).

## 확인·구현이 필요한 것

1. **[가장 먼저 확인] evidence 체인이 재진입을 아는가.** "지켜보기·매도·복기"를 관리하는
   `MarketPracticeChainResolutionService`는 즐겨찾기→매수의도→매수→보유로 이어지는 **하나의
   chain**을 골라 쓰는 026 스펙 시스템이고, `entrySequence`를 전혀 참조하지 않는다(042보다
   오래됐다). 재진입으로 두 번째 holding이 생기면:
   - `POST /education/practice/holding-observations`가 그 두 번째 holding을 향하는지
   - `POST /education/practice/holding-reflections`가 첫 holding에 묶인 채로 남는지
   확인된 바가 없다. 이걸 확인하지 않고 프론트가 재진입 UI를 만들면 실제 사용자의 완료 처리가
   조용히 깨질 수 있어서 프론트 세션은 이번에 재진입 UI를 만들지 않았다. 필요하면 chain 해석
   로직을 entrySequence 인식하도록 손봐야 한다.

2. **진입별 주문유형(시장가/지정가) 기록.** `PracticeEntryResponse`(그리고 이걸 만드는
   `PracticeEntryComparisonService`)에 그 진입의 매수가 시장가였는지 지정가였는지가 없다.
   게이트를 서버가 판정하려면 이 정보가 필요하다.

3. **순서를 강제하는 실제 검증 규칙.** 지금은 지정가 매수 주문을 아무 때나 넣어도 서버가 그냥
   받아준다. "이 attempt·run에서 시장가로 최소 1회 완결(매수+매도)하지 않았으면 지정가 매수를
   거부한다" 같은 규칙이 주문 생성 경로에 필요하다. "시장가·지정가를 둘 다 완결해야 손절·익절
   프리셋 3단계가 열린다"도 마찬가지다. **잠금은 반드시 서버가 판정해야 한다** — 프론트가
   로컬로 판단하면 새로고침 한 번에 뚫리고 서버·화면의 단계 인식이 어긋난다.

4. **041 대본과의 궁합 검토.** 사건·가격 흐름(ACT1~4)은 run 전체에 걸친 고정 이야기다. 한 run
   안에서 2~3번 사고팔면 세 번째 진입은 이미 이야기가 꽤 진행된 시점에서 시작한다. "지정가
   체험"·"프리셋 체험"이라는 학습 목적과 그 시점의 이야기 전개가 자연스러운지 제품 관점에서
   판단이 필요하다. 대안으로 "게이트형 3단계는 대본이 없는(생성기 버전 1) attempt에서만 적용"
   같은 범위 축소도 검토 가치가 있다.

## 먼저 처리해야 할 백엔드 이슈 두 건

`finplay-frontend/docs/backend-issues.md`의 "education" 절에 등록돼 있다. **이 문서 자체의
adversarial 재검증(2026-08-08 절 참고)은 거치지 않았다고 명시돼 있으니, 등록 전에 한 번 더
확인해야 한다.**

- **E-1** — 튜토리얼 계좌 잔액(`tutorialCashBalance`·`tutorialAvailableCash`·
  `tutorialRealizedPnl`)이 `PUT .../attempts/{market}/instrument`(종목 선택) 이후 응답에서
  0으로 온다(계약 문서 명시, TUTORIAL-CASH-ISOL-011). 매수 폼에 "주문 가능" 잔액과 10/25/50/75/
  최대 퍼센트 버튼을 실전(pages/Trade.tsx)처럼 만들려면 이 시점에 실제 잔액이 필요한데 지금은
  못 낸다. `PUT .../instrument` 응답에도 실제 잔액을 채우거나, 별도의 가벼운 잔액 조회 경로를
  연다.
- **E-2** — `practice_attempts` 행 잠금(`SELECT ... FOR UPDATE`)이 재시작(`POST .../restart`)과
  tick 폴링(`POST .../tick`)이 겹칠 때 데드락 난다. 로컬 검증에서 실제로 8~32회 관측했다
  (`org.hibernate.exception.LockAcquisitionException: ... Deadlock found when trying to get
  lock`). 근본 원인(잠금 순서 역전 여부)은 로그만으로 단정 못 해 코드로 확인이 필요하다. 화면에
  "서버에 문제가 발생했습니다"로 노출된다.

## 이번 세션에서 해줬으면 하는 것

1. 위 1번(evidence 체인) 조사부터 — 이게 나머지 설계 방향을 정한다.
2. E-1·E-2 조사·수정.
3. 확인된 것을 바탕으로 `docs/specs/`에 게이트형 3단계 spec 작성(planner) — 4번(041 궁합)을
   결정하고, 2·3번(주문유형 필드·검증 규칙)을 계약에 반영.
4. `docs/api-contracts.md`·`api-routes.md` 갱신, `docs/prd.md` §3 구현 현황 갱신(규칙 10).
5. `C:\Users\user\orca\finplay-frontend`의 `checklist.md`(9차 D)·`context-notes.md`에 진행
   상황과 확정된 계약을 남겨 다음 프론트 세션이 그대로 이어받게 한다.
```
