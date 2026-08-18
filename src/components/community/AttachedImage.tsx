// 게시물 첨부 이미지를 인증 GET(blob)으로 받아 그리는 컴포넌트 — imageUrl 은 Bearer 가 필요해 <img src> 직결이 안 된다
import { useEffect, useState } from 'react'
import { getPostImageBlobUrl } from '../../services/communityService'

interface AttachedImageProps {
  imageId: number
  alt: string
  className?: string
}

/** 실패하면(삭제된 이미지 등) 조용히 아무 것도 그리지 않는다 — 게시물 본문은 이미지 없이도 온전하다. */
export function AttachedImage({ imageId, alt, className }: AttachedImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setBlobUrl(null)
    setFailed(false)
    getPostImageBlobUrl(imageId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        setBlobUrl(url)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [imageId])

  // blobUrl 이 바뀌거나(재조회) 컴포넌트가 사라질 때 이전 object URL 을 정리한다.
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [blobUrl])

  if (failed) return null
  if (!blobUrl) return <div className={`${className ?? ''} skeleton`} />
  return <img src={blobUrl} alt={alt} className={className} />
}
