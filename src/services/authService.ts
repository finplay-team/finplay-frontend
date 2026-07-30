// 회원가입·로그인·세션 조회를 mock으로 처리하는 인증 서비스 (실 API로 교체 가능)
import { accounts, mockPasswords, SEED_AMOUNT, users } from './mockDb'
import type { Account, SessionUser, SignupPayload, User } from './types'

const SESSION_KEY = 'investory.session'

/** 네트워크 지연 시뮬레이션 */
const delay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms))

let seq = users.length

function persist(user: SessionUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

export const authService = {
  /** 현재 로그인 세션 조회 — 인메모리 DB에 없는 유저(새로고침으로 소실)는 세션 무효화 */
  getSession(): SessionUser | null {
    // DEV 전용: ?as=user|admin 쿼리로 데모 세션 자동 주입 (스크린샷·시연용)
    if (import.meta.env.DEV) {
      const as = new URLSearchParams(window.location.search).get('as')
      if (as === 'user' || as === 'admin') {
        const auto = users.find((u) => u.id === (as === 'admin' ? 'u_admin' : 'u_demo'))
        if (auto) {
          persist(auto)
          return auto
        }
      }
    }
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    try {
      const session = JSON.parse(raw) as SessionUser
      const live = users.find((u) => u.id === session.id)
      if (!live || live.status === 'SUSPENDED') {
        localStorage.removeItem(SESSION_KEY)
        return null
      }
      return live
    } catch {
      return null
    }
  },

  async login(email: string, password: string): Promise<SessionUser> {
    await delay()
    const user = users.find((u) => u.email === email.trim().toLowerCase())
    if (!user || mockPasswords[user.email] !== password) {
      throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.')
    }
    if (user.status === 'SUSPENDED') {
      throw new Error('정지된 계정입니다. 관리자에게 문의해 주세요.')
    }
    persist(user)
    return user
  },

  async signup(payload: SignupPayload): Promise<SessionUser> {
    await delay()
    const email = payload.email.trim().toLowerCase()
    if (users.some((u) => u.email === email)) {
      throw new Error('이미 가입된 이메일입니다.')
    }
    if (users.some((u) => u.nickname === payload.nickname.trim())) {
      throw new Error('이미 사용 중인 닉네임입니다.')
    }

    const user: User = {
      id: `u_${++seq}`,
      email,
      nickname: payload.nickname.trim(),
      role: 'USER',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    }
    users.push(user)
    mockPasswords[email] = payload.password

    // 가입 시 주식·코인 계좌를 각각 시드머니와 함께 자동 생성
    const newAccounts: Account[] = (['STOCK', 'CRYPTO'] as const).map((market) => ({
      id: `a_${user.id}_${market.toLowerCase()}`,
      userId: user.id,
      market,
      seedAmount: SEED_AMOUNT,
      bonusTotal: 0,
      cashBalance: SEED_AMOUNT,
      totalValue: SEED_AMOUNT,
      realizedPnl: 0,
      unrealizedPnl: 0,
    }))
    accounts.push(...newAccounts)

    persist(user)
    return user
  },

  logout() {
    localStorage.removeItem(SESSION_KEY)
  },
}
