// 랜딩의 결정적 순간 — 스크롤을 장중 시간축으로 써서 "1분봉이 순서대로 공개되고 앞은 가려진다"를 보여주는 섹션
import { useScrollProgress } from '../../hooks/useScrollProgress'

/**
 * 09:00~15:30 = 390분. 이 숫자만이 이 섹션이 쓰는 유일한 데이터다.
 *
 * 의도적으로 가격을 그리지 않는다 — 랜딩은 비인증 공개 페이지라 시세 API(Bearer 필수)를 붙일 수 없고,
 * 그렇다고 없는 시세를 만들어 그리면 "실제로 있었던 하루"라는 주장 자체가 거짓이 된다.
 * 그래서 분 눈금의 공개 여부만 표현한다. 이건 백엔드가 실제로 하는 일과 정확히 일치한다.
 */
const TOTAL_MINUTES = 390
const HOURS_SPAN = TOTAL_MINUTES / 60 // 6.5 — 정시 눈금 간격

/**
 * 눈금은 DOM 요소 390개가 아니라 반복 배경으로 그린다.
 * 요소로 그리면 390px 미만 폭에서 flex-1 이 서브픽셀이 되어 눈금이 통째로 사라진다(모바일에서 실제로 사라졌다).
 * 배경 타일은 폭에 비례해 스케일되므로 좁은 화면에서는 촘촘한 띠로 읽힌다 — 390분이라는 사실과 어긋나지 않는다.
 */
function tickLayer(color: string, tiles: number, duty: string) {
  return {
    backgroundImage: `linear-gradient(to right, ${color} 0 ${duty}, transparent ${duty} 100%)`,
    backgroundSize: `calc(100% / ${tiles}) 100%`,
    backgroundRepeat: 'repeat-x',
  } as const
}

/** 진행도(0~1)를 09:00 기준 장중 시각으로 바꾼다. */
function clockOf(progress: number): string {
  const minutes = Math.min(TOTAL_MINUTES, Math.round(progress * TOTAL_MINUTES))
  const hour = 9 + Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * 각 카드가 열리는 진행도와 문구. 전부 백엔드가 실제로 하는 동작이며 만들어낸 수치가 없다.
 * 근거는 FEED-009(브리핑은 전장 구간 기사만), FEED-006(reveal_time 게이트로 스포일러 차단),
 * MKT-002(재생 분봉의 기록된 가격에 체결), FEED-007·010·011(그 체결의 서비스 날짜 15:30 이후 개방)이다.
 */
const beats = [
  {
    at: 0.04,
    time: '09:00',
    title: '개장 전 브리핑이 열립니다',
    body: '장이 열리기 전 구간의 기사·공시만 모읍니다. 장중에 나온 기사는 섞이지 않습니다.',
  },
  {
    at: 0.32,
    time: '장중',
    title: '변동 원인은 지나간 뒤에만',
    body: '가격이 움직인 이유는 그 시각이 지나야 열립니다. 앞으로 무슨 일이 생길지는 볼 수 없습니다.',
    emphasis: true,
  },
  {
    at: 0.6,
    time: '장중',
    title: '체결은 그 순간의 기록된 가격으로',
    body: '주문은 재생 중인 그 분봉에 실제로 기록돼 있던 가격에 체결됩니다.',
  },
  {
    at: 0.88,
    time: '15:30',
    title: '마감 후 회고가 열립니다',
    body: '다른 시점에 팔았다면 어땠는지, 같은 구간을 겪은 다른 회원은 어떻게 움직였는지가 이때 붙습니다.',
  },
]

const hourLabels = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '15:30']

export function ReplayScrub() {
  const { ref, progress, reduced } = useScrollProgress<HTMLDivElement>()
  const revealed = Math.min(TOTAL_MINUTES, Math.round(progress * TOTAL_MINUTES))
  // 공개 구간은 요소 폭을 줄이지 않고 clip-path 로 잘라낸다 — 폭을 줄이면 배경 타일이 어긋난다
  const cut = `inset(0 ${(100 - (revealed / TOTAL_MINUTES) * 100).toFixed(3)}% 0 0)`

  return (
    // 컨테이너를 뷰포트보다 높게 잡아야 sticky 자식이 머무는 동안 스크롤 여유가 생긴다.
    // 300vh는 스크롤 이동 거리가 뷰포트의 3배라 콘텐츠 변화 없이 스크롤만 계속되는 구간이 길었다.
    <section ref={ref} className="relative h-[150vh]">
      {/* pt 로 떠 있는 내비 아래를 확보한다 — 없으면 좁은 화면에서 제목이 내비 뒤로 잘린다 */}
      <div className="sticky top-0 flex h-[100dvh] flex-col justify-center overflow-hidden px-4 pb-6 pt-24 md:pt-28">
        <div aria-hidden className="orb -left-32 top-1/4 h-96 w-96" />

        <div className="relative mx-auto w-full max-w-6xl">
          <h2 className="font-display text-2xl font-bold leading-[1.12] tracking-tight sm:text-4xl md:text-5xl">
            스크롤을 내리면
            <br />
            <span className="text-brand">그날의 장</span>이 흐릅니다
          </h2>
          <p className="mt-3 max-w-md text-xs leading-relaxed text-muted sm:text-sm md:mt-4 md:text-base">
            주식 장 하루는 09:00부터 15:30까지 390분입니다. 그 분봉이 하나씩 공개되고, 아직 오지 않은
            구간은 가려져 있습니다.
          </p>

          <div className="mt-5 flex items-baseline gap-3 md:mt-8">
            <span className="font-display text-4xl font-bold tabular tracking-tight text-brand md:text-6xl">
              {clockOf(progress)}
            </span>
            <span className="text-[10px] uppercase tracking-eyebrow text-muted">
              공개된 분봉 {revealed} / {TOTAL_MINUTES}
            </span>
          </div>

          {/* 390분 눈금 사다리 — 공개 여부만 표현하고 가격은 그리지 않는다 */}
          <div className="relative mt-4 h-20 md:mt-6 md:h-32" aria-hidden>
            {/* 미공개 분 눈금 — 좁은 폭에서는 타일이 1px 미만이 되어 촘촘한 띠로 읽힌다(의도된 열화) */}
            <div
              className="absolute inset-x-0 bottom-0 h-[56%]"
              style={tickLayer('rgba(38,38,46,0.95)', TOTAL_MINUTES, '55%')}
            />
            {/* 미공개 정시 눈금 — duty 를 고정 px 로 둬 어느 폭에서도 선이 살아 시간 구조가 보인다 */}
            <div
              className="absolute inset-x-0 bottom-0 top-0"
              style={tickLayer('rgba(58,58,70,0.95)', HOURS_SPAN, '1.5px')}
            />
            {/* 공개 분 눈금 */}
            <div
              className="absolute inset-x-0 bottom-0 h-[56%] transition-[clip-path] duration-200 ease-out"
              style={{ ...tickLayer('rgba(94,234,212,0.5)', TOTAL_MINUTES, '55%'), clipPath: cut }}
            />
            {/* 공개 정시 눈금 */}
            <div
              className="absolute inset-x-0 bottom-0 top-0 transition-[clip-path] duration-200 ease-out"
              style={{ ...tickLayer('#5EEAD4', HOURS_SPAN, '1.5px'), clipPath: cut }}
            />
          </div>

          {/* 정시 라벨 — HTML 로 두어 좁은 화면에서도 글자 크기가 줄지 않는다 */}
          <div className="mt-2 flex justify-between text-[9px] tabular text-muted sm:text-[10px]">
            {hourLabels.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>

          {/* 유리 카드 — 시각이 지나면 빈 유리 슬롯이 채워진다.
              닫힌 카드의 본문을 흐리게 남기면 대비 기준에 미달하므로 껍데기만 남기고 내용은 감춘다. */}
          <div className="mt-5 grid grid-cols-2 gap-2 md:mt-8 lg:grid-cols-4">
            {beats.map((beat) => {
              const open = reduced || progress >= beat.at
              return (
                <div
                  key={beat.title}
                  className={`glass ${beat.emphasis && open ? 'glass-sheen' : ''} px-3 py-3 transition-opacity duration-500 md:px-5 md:py-4`}
                  style={{ opacity: open ? 1 : 0.35 }}
                >
                  <div
                    className="transition-opacity duration-500 ease-spring"
                    style={{ opacity: open ? 1 : 0 }}
                  >
                    <p className="text-[9px] uppercase tracking-eyebrow text-brand sm:text-[10px]">
                      {beat.time}
                    </p>
                    <p className="mt-1.5 text-xs font-semibold leading-snug text-ink sm:text-sm">
                      {beat.title}
                    </p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted sm:text-xs">
                      {beat.body}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
