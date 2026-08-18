// 매도 체결 1건을 수익 인증 카드 이미지로 그려 커뮤니티 업로드 또는 기기 공유/저장으로 내보내는 모달
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { toUserMessage } from '../../lib/errorMessages'
import { drawShareCard } from '../../lib/drawShareCard'
import { toShareCardData, type ShareCardData } from '../../lib/shareCard'
import { uploadPostImage } from '../../services/communityService'
import { getPostSellFeedback } from '../../services/feedbackService'

interface Props {
  tradeId: number
  onClose: () => void
}

const CARD_MIME = 'image/png'
const CARD_FILE_NAME = 'finplay-profit-card.png'

/** canvas.toBlob 은 콜백 API 라 await 할 수 있게 Promise 로 감싼다. */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, CARD_MIME))
}

export function ProfitShareCardModal({ tradeId, onClose }: Props) {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [data, setData] = useState<ShareCardData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getPostSellFeedback(tradeId)
      .then((res) => {
        if (!cancelled) setData(toShareCardData(res))
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(
            toUserMessage(e, {
              VALIDATION_ERROR: '이 체결은 수익 인증 카드를 만들 수 없습니다.',
              FORBIDDEN: '다른 사람의 체결은 카드로 만들 수 없습니다.',
              NOT_FOUND: '존재하지 않는 체결입니다.',
            }),
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [tradeId])

  useEffect(() => {
    if (!data || !canvasRef.current) return
    // 웹폰트가 로딩되기 전에 그리면 시스템 폰트로 굳어버리므로 폰트 로딩을 기다렸다가 그린다.
    // CSS Font Loading API 가 없는 환경(구형 브라우저·테스트 jsdom)도 있어 없으면 바로 그린다.
    let cancelled = false
    const ready = document.fonts?.ready ?? Promise.resolve()
    void ready.finally(() => {
      if (!cancelled && canvasRef.current) drawShareCard(canvasRef.current, data)
    })
    return () => {
      cancelled = true
    }
  }, [data])

  const exportCanvas = async (): Promise<File> => {
    if (!canvasRef.current) throw new Error('CANVAS_NOT_READY')
    const blob = await canvasToBlob(canvasRef.current)
    if (!blob) throw new Error('CANVAS_EXPORT_FAILED')
    return new File([blob], CARD_FILE_NAME, { type: CARD_MIME })
  }

  const handlePostToCommunity = async () => {
    setBusy(true)
    setActionError(null)
    try {
      const file = await exportCanvas()
      const uploaded = await uploadPostImage(file)
      // 글쓰기 폼이 이 이미지를 이미 첨부한 상태로 열리도록 state 로 넘긴다(Community.tsx 가 읽는다).
      navigate('/community', { state: { attachedImageId: uploaded.imageId } })
    } catch (e: unknown) {
      setActionError(
        toUserMessage(e, { VALIDATION_ERROR: '카드 이미지를 올리지 못했어요. 다시 시도해 주세요.' }),
      )
    } finally {
      setBusy(false)
    }
  }

  const handleShareOrDownload = async () => {
    setBusy(true)
    setActionError(null)
    try {
      const file = await exportCanvas()
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '수익 인증 카드' })
        return
      }
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = CARD_FILE_NAME
      link.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      // 공유 시트를 취소한 경우(AbortError)는 실패가 아니다 — 조용히 넘어간다.
      if (e instanceof DOMException && e.name === 'AbortError') return
      setActionError('이미지를 저장하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <Card className="w-full max-w-sm" innerClassName="p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-ink">수익 인증 카드</h3>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            닫기
          </Button>
        </div>

        {loadError && <p className="mt-4 text-sm text-loss">{loadError}</p>}

        {!loadError && !data && <div className="mt-4 skeleton h-64 w-full" />}

        {data && (
          <>
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`${data.name} 수익 인증 카드 미리보기`}
              className="mt-4 w-full rounded-2xl border border-line"
            />
            <p className="mt-3 text-xs leading-relaxed text-muted">
              종목명·매수가·매도가·수익률·손익 금액이 담긴 카드예요. 커뮤니티에 바로 올리거나 사진으로
              저장해서 나눠 보세요.
            </p>

            {actionError && <p className="mt-2 text-sm text-loss">{actionError}</p>}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void handlePostToCommunity()}
              >
                커뮤니티에 바로 올리기
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void handleShareOrDownload()}
              >
                이미지로 저장/공유
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
