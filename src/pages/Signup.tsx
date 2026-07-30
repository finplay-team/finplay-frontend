// TODO(4차): Signup 실연동 재작성 예정 (이메일 인증 → 6자리 코드 → 비밀번호·닉네임 3단계)
// 회원가입 페이지 자리표시자 — 실 API 3단계 가입 흐름으로 교체된다
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'

export function Signup() {
  return (
    <div className="min-h-[100dvh] px-4 pb-24 pt-32">
      <div className="mx-auto max-w-lg">
        <Card accent="brand" innerClassName="p-8 text-center">
          <div className="flex justify-center">
            <Eyebrow>회원가입</Eyebrow>
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold text-ink">준비 중입니다</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            실제 이메일 인증 기반 3단계 가입 화면으로 교체하는 중입니다.
          </p>
          <Link to="/login" className="mt-6 inline-block text-sm font-medium text-brand hover:underline">
            로그인으로 이동
          </Link>
        </Card>
      </div>
    </div>
  )
}
