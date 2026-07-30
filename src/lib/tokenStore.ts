// 액세스·리프레시 토큰과 캐시된 회원 정보를 localStorage 와 함께 보관하는 모듈 스코프 스토어 (React·앱 코드 비의존)
import type { Member } from '../services/types'

const TOKEN_KEY = 'tradeclass.auth.v1'
const MEMBER_KEY = 'tradeclass.member.v1'

export interface Session {
  accessToken: string
  refreshToken: string
}

export interface StoreSnapshot {
  accessToken: string | null
  member: Member | null
}

function readSession(): Session | null {
  const raw = localStorage.getItem(TOKEN_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<Session>
    if (!parsed.accessToken || !parsed.refreshToken) return null
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken }
  } catch {
    return null
  }
}

function readMember(): Member | null {
  const raw = localStorage.getItem(MEMBER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Member
  } catch {
    return null
  }
}

// useSyncExternalStore 계약: getSnapshot 은 변경이 없으면 반드시 같은 참조를 돌려줘야 한다.
// 매 호출마다 새 객체 리터럴을 만들면 무한 렌더 루프가 된다.
let snapshot: StoreSnapshot = { accessToken: readSession()?.accessToken ?? null, member: readMember() }

const listeners = new Set<() => void>()

function emit() {
  snapshot = { accessToken: readSession()?.accessToken ?? null, member: readMember() }
  for (const listener of listeners) listener()
}

export function getAccessToken(): string | null {
  return readSession()?.accessToken ?? null
}

export function getRefreshToken(): string | null {
  return readSession()?.refreshToken ?? null
}

export function getCachedMember(): Member | null {
  return readMember()
}

export function setSession(session: Session): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(session))
  emit()
}

export function setCachedMember(member: Member | null): void {
  if (member) localStorage.setItem(MEMBER_KEY, JSON.stringify(member))
  else localStorage.removeItem(MEMBER_KEY)
  emit()
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(MEMBER_KEY)
  emit()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // 다른 탭에서 로그아웃하면 이 탭도 따라가야 한다.
  const onStorage = (e: StorageEvent) => {
    if (e.key === TOKEN_KEY || e.key === MEMBER_KEY || e.key === null) emit()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function getSnapshot(): StoreSnapshot {
  return snapshot
}
