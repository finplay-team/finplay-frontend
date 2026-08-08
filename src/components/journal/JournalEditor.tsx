// 투자일기 작성·수정 폼 — journalType + 체결 ID 로 매수/매도 경로를 골라 POST·PATCH 를 보낸다
import { useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { isApiErrorCode, toUserMessage } from '../../lib/errorMessages'
import { createJournal, updateJournal } from '../../services/journalService'
import type { JournalType, LocalDateTimeString } from '../../services/types'

/** 서버 @Size(max=5000) 는 Java String.length() 기준이라 JS 의 UTF-16 length 와 같은 단위다. */
const CONTENT_MAX = 5000

const textareaClass =
  'w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-sm leading-relaxed text-ink outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15'

export interface JournalSaved {
  content: string
  createdAt: LocalDateTimeString
  updatedAt: LocalDateTimeString
}

interface Props {
  journalType: JournalType
  /** journalType 에 대응하는 체결 ID — BUY 면 buyTradeId, SELL 이면 sellTradeId 다. */
  tradeId: number
  mode: 'create' | 'update'
  /** 수정 모드의 기존 본문. 작성 모드에서는 비운다. */
  initialContent?: string
  onSaved: (saved: JournalSaved) => void
  onCancel: () => void
  /**
   * 작성 도중 409 DUPLICATE_RESOURCE 를 받은 경우 — 이미 회고가 있으므로 수정 흐름으로 보내야 한다.
   * 없으면 안내 문구만 보여준다(임의로 PATCH 로 바꿔 기존 본문을 덮어쓰지 않는다).
   */
  onAlreadyExists?: () => void
}

export function JournalEditor({
  journalType,
  tradeId,
  mode,
  initialContent = '',
  onSaved,
  onCancel,
  onAlreadyExists,
}: Props) {
  const [content, setContent] = useState(initialContent)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // 상태 갱신은 다음 렌더에 반영되므로 연타 방어는 ref 로 한다.
  const busyRef = useRef(false)

  const trimmed = content.trim()
  const canSubmit = trimmed.length > 0 && trimmed.length <= CONTENT_MAX && !submitting

  const handleSubmit = async () => {
    if (busyRef.current) return
    // 서버는 트림하지 않는다. 공백만 있는 값은 @NotBlank 로 400 이므로 로컬에서 먼저 막는다.
    if (trimmed.length === 0) {
      setError('내용을 입력해 주세요.')
      return
    }
    busyRef.current = true
    setSubmitting(true)
    setError(null)
    try {
      if (mode === 'create') {
        const created = await createJournal(journalType, tradeId, { content: trimmed })
        // 작성 응답은 4필드라 updatedAt 이 없다. 미수정 상태이므로 createdAt 으로 채운다.
        onSaved({ content: created.content, createdAt: created.createdAt, updatedAt: created.createdAt })
      } else {
        const updated = await updateJournal(journalType, tradeId, { content: trimmed })
        onSaved({
          content: updated.content,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        })
      }
    } catch (e) {
      if (mode === 'create' && isApiErrorCode(e, 'DUPLICATE_RESOURCE')) {
        setError('이미 작성된 일기가 있습니다. 새로 쓰지 않고 수정해 주세요.')
        onAlreadyExists?.()
      } else {
        setError(
          toUserMessage(e, {
            VALIDATION_ERROR: `내용을 다시 확인해 주세요. 최대 ${CONTENT_MAX.toLocaleString('ko-KR')}자까지 쓸 수 있습니다.`,
            FORBIDDEN: '내 체결이 아니라 일기를 남길 수 없습니다.',
            // 체결 없음과 회고 미작성이 같은 404 라 어느 쪽인지 단정할 수 없다.
            NOT_FOUND:
              mode === 'create'
                ? '체결을 찾을 수 없습니다.'
                : '수정할 일기를 찾을 수 없습니다. 목록을 새로 불러와 주세요.',
          }),
        )
      }
    } finally {
      busyRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-ink">
          {mode === 'create' ? '투자일기 작성' : '투자일기 수정'}
        </span>
        <span className={`text-[11px] tabular ${trimmed.length > CONTENT_MAX ? 'text-loss' : 'text-muted'}`}>
          {content.length.toLocaleString('ko-KR')}/{CONTENT_MAX.toLocaleString('ko-KR')}
        </span>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={CONTENT_MAX}
        rows={6}
        placeholder="왜 사고 왜 팔았는지, 다음엔 무엇을 다르게 할지 적어 보세요"
        className={`${textareaClass} resize-y`}
      />

      {/* gain(=상승 적색) 은 시세용 토큰이다. 폼 오류는 다른 폼과 같은 rose 를 쓴다 */}
      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={!canSubmit} onClick={() => void handleSubmit()}>
          {submitting ? '저장 중…' : '저장'}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={submitting} onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  )
}
