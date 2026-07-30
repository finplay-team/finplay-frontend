// 존재하지 않는 경로를 정직하게 알리는 404 페이지 (깨진 링크를 랜딩으로 숨기지 않는다)
import { LinkButton } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

export function NotFound() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden px-4 pb-24 pt-28 md:pt-32">
      <div aria-hidden className="orb -left-20 top-24 h-72 w-72 animate-float-orb" />

      <div className="relative mx-auto max-w-xl">
        <Card accent="brand" innerClassName="p-10 text-center md:p-14">
          <p className="font-display text-6xl font-bold tracking-tight text-brand tabular">404</p>
          <h1 className="mt-5 font-display text-2xl font-semibold text-ink">
            페이지를 찾을 수 없습니다
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            주소가 바뀌었거나 삭제된 페이지입니다.
          </p>
          <div className="mt-8 flex justify-center">
            <LinkButton to="/" withIcon>
              홈으로
            </LinkButton>
          </div>
        </Card>
      </div>
    </div>
  )
}
