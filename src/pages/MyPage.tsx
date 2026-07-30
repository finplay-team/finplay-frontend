// TODO(4차): MyPage 실연동 재작성 예정 (계좌 요약 + 닉네임 변경 + 이메일 변경 2단계)
// 내정보 페이지 자리표시자 — accountService·authService 기반 화면으로 교체된다
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { useAuth } from '../auth/AuthContext'

export function MyPage() {
  const { member } = useAuth()

  return (
    <div className="min-h-[100dvh] px-4 pb-24 pt-32">
      <div className="mx-auto max-w-2xl">
        <Card accent="brand" innerClassName="p-8 text-center">
          <div className="flex justify-center">
            <Eyebrow>내정보</Eyebrow>
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold text-ink">
            {member?.nickname ?? '회원'}님
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            계좌 요약과 회원정보 변경 화면으로 교체하는 중입니다.
          </p>
        </Card>
      </div>
    </div>
  )
}
