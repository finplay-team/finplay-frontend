// 로컬 개발에서 인증번호가 메일로 발송되지 않고 백엔드 콘솔에만 찍히는 사실을 알리는 DEV 전용 안내
export function DevCodeNotice() {
  if (!import.meta.env.DEV) return null

  return (
    <div className="rounded-2xl border border-brand/25 bg-brand-soft/50 px-4 py-3 text-xs leading-relaxed">
      <p className="font-medium text-brand">개발 환경 안내</p>
      <p className="mt-1 text-muted">
        로컬에서는 인증번호 메일이 실제로 발송되지 않습니다. 백엔드 서버 콘솔의{' '}
        <span className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-brand">
          [FakeEmailSender]
        </span>{' '}
        로그에서 <span className="font-mono text-ink">code=</span> 값을 확인해 입력하세요.
      </p>
    </div>
  )
}
