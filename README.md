# FinPlay

투자를 기록하고 복기하며 배우는 **주식·코인 교육형 모의투자 플랫폼**의 프론트엔드.
실제 시세로 움직이는 가상 자산 1,000만원으로 매매를 연습하고, 매매 판단을 기록해 AI 복기·습관
분석을 받는다. 종목 추천은 하지 않는다.

## 스택
- Vite + React 18 + TypeScript
- Tailwind CSS v3 (Soft Structuralism 디자인)
- React Router · IntersectionObserver 스크롤 애니메이션
- 데이터는 현재 **Mock**(`src/services/*`). 실제 API 계약은 `docs/api-spec.md` 참고.

## 실행
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 타입체크 + 프로덕션 번들
```

## 페이지
| 경로 | 설명 |
|---|---|
| `/` | 랜딩 (기록·복기, AI 습관, 계좌 분리, 랭킹 철학, 미션, 기술) |
| `/signup` · `/login` | 회원가입 / 로그인 (mock 인증) |
| `/rankings` | 주식·코인 랭킹 (실현손익 기준) |
| `/admin` | 관리자 (회원·종목·미션·경제이벤트) — ADMIN 롤 전용 |

## 데모 계정
- 일반: `user@investory.app` / `demo1234`
- 관리자: `admin@investory.app` / `admin1234`

## 문서
- `docs/decisions.md` — 기획서 "미정" 항목 결정표
- `docs/db-schema.md` — DB ERD·테이블
- `docs/api-spec.md` — REST API 계약 (mock ↔ 실 API 매핑)
