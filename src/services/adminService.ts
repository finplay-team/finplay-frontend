// 관리자 페이지의 통계·회원·종목·미션·경제이벤트 관리를 mock으로 처리하는 서비스
import {
  accounts,
  economicEvents,
  instruments,
  missions,
  users,
} from './mockDb'
import type {
  AdminStats,
  EconomicEvent,
  EconomicEventType,
  Instrument,
  Market,
  Mission,
  User,
} from './types'

const delay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms))

let eventSeq = economicEvents.length
let missionSeq = missions.length

export const adminService = {
  async getStats(): Promise<AdminStats> {
    await delay()
    return {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.status === 'ACTIVE').length,
      totalAccounts: accounts.length,
      todayTradeVolume: 1_284_500_000,
      activeEvents: economicEvents.filter((e) => e.alertEnabled).length,
    }
  },

  async getUsers(): Promise<User[]> {
    await delay()
    return [...users]
  },

  async toggleUserStatus(userId: string): Promise<User> {
    await delay(200)
    const user = users.find((u) => u.id === userId)
    if (!user) throw new Error('사용자를 찾을 수 없습니다.')
    user.status = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    return user
  },

  async getInstruments(market: Market): Promise<Instrument[]> {
    await delay()
    return instruments.filter((i) => i.market === market)
  },

  async toggleInstrument(instrumentId: string): Promise<Instrument> {
    await delay(200)
    const inst = instruments.find((i) => i.id === instrumentId)
    if (!inst) throw new Error('종목을 찾을 수 없습니다.')
    inst.isTradable = !inst.isTradable
    return inst
  },

  async getMissions(): Promise<Mission[]> {
    await delay()
    return [...missions].sort((a, b) => a.order - b.order)
  },

  async toggleMission(missionId: string): Promise<Mission> {
    await delay(200)
    const mission = missions.find((m) => m.id === missionId)
    if (!mission) throw new Error('미션을 찾을 수 없습니다.')
    mission.isActive = !mission.isActive
    return mission
  },

  async getEvents(): Promise<EconomicEvent[]> {
    await delay()
    return [...economicEvents].sort(
      (a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime(),
    )
  },

  async createEvent(input: {
    title: string
    type: EconomicEventType
    eventAt: string
    description: string
  }): Promise<EconomicEvent> {
    await delay()
    const event: EconomicEvent = {
      id: `e_${++eventSeq}`,
      title: input.title,
      type: input.type,
      eventAt: input.eventAt,
      description: input.description,
      alertEnabled: true,
    }
    economicEvents.push(event)
    return event
  },

  async toggleEventAlert(eventId: string): Promise<EconomicEvent> {
    await delay(200)
    const event = economicEvents.find((e) => e.id === eventId)
    if (!event) throw new Error('이벤트를 찾을 수 없습니다.')
    event.alertEnabled = !event.alertEnabled
    return event
  },

  async createMission(input: {
    title: string
    description: string
    rewardLabel: string
  }): Promise<Mission> {
    await delay()
    const mission: Mission = {
      id: `m_${++missionSeq}`,
      title: input.title,
      description: input.description,
      rewardType: 'BADGE',
      rewardLabel: input.rewardLabel,
      order: missions.length + 1,
      isActive: true,
    }
    missions.push(mission)
    return mission
  },
}
