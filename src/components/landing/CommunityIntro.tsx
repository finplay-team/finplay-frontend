// 게시글·댓글로 매매 경험을 공유하는 커뮤니티를 소개하는 랜딩 섹션
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { Reveal } from '../ui/Reveal'
import { Layers, User } from '../ui/icons'

const items = [
  {
    icon: <Layers width={20} height={20} />,
    title: '게시글로 남기기',
    desc: '왜 사고 왜 팔았는지 글로 적어 둡니다. 최신순 목록에서 다시 찾아 읽고, 언제든 수정하거나 지울 수 있습니다.',
  },
  {
    icon: <User width={20} height={20} />,
    title: '댓글로 이어가기',
    desc: '다른 사람의 기록에 댓글로 의견을 붙입니다. 같은 종목을 다르게 본 이유가 가장 배울 거리가 많습니다.',
  },
]

export function CommunityIntro() {
  return (
    <section className="px-4 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>커뮤니티</Eyebrow>
          <h2 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            혼자 하면
            <br />
            내 습관이 보이지 않는다
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-muted">
            같은 시세를 보고 다르게 판단한 사람들의 기록이 모입니다. 내 매매를 설명해 보는 것만으로도
            근거가 있었는지 없었는지가 드러납니다.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {items.map((it, i) => (
            <Reveal key={it.title} delay={i * 100}>
              <Card className="h-full" accent={i === 0 ? 'brand' : 'none'}>
                <div className="flex h-full gap-5 p-7">
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-brand-soft text-brand">
                    {it.icon}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">{it.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{it.desc}</p>
                  </div>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
