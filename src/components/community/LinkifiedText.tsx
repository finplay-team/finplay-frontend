// 게시글 본문 속 URL을 새 탭으로 여는 실제 하이퍼링크로 바꿔 그린다
import { linkifyContent } from '../../lib/linkPreview'

interface Props {
  text: string
  className?: string
}

export function LinkifiedText({ text, className }: Props) {
  const parts = linkifyContent(text)
  return (
    <p className={className}>
      {parts.map((part, i) =>
        part.url ? (
          <a
            key={i}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            // 클릭이 카드 전체 Link 로 튀지 않게 막는다 — 목록 카드 안에서 쓰일 때를 대비한 방어.
            onClick={(e) => e.stopPropagation()}
            className="text-brand underline underline-offset-2 hover:text-brand/80"
          >
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  )
}
