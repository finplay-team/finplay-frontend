// 관리자 페이지 — 통계 대시보드 + 회원/종목/미션/경제이벤트 관리
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Tabs } from '../components/ui/Tabs'
import { Button } from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import { Users, Chart, Flag, Calendar } from '../components/ui/icons'
import { adminService } from '../services/adminService'
import type {
  AdminStats,
  EconomicEvent,
  EconomicEventType,
  Instrument,
  Market,
  Mission,
  User,
} from '../services/types'
import { formatKRW, formatDate } from '../lib/format'

type Menu = 'users' | 'instruments' | 'missions' | 'events'

export function Admin() {
  const [menu, setMenu] = useState<Menu>('users')
  const [stats, setStats] = useState<AdminStats | null>(null)

  useEffect(() => {
    adminService.getStats().then(setStats)
  }, [])

  const refreshStats = () => adminService.getStats().then(setStats)

  return (
    <div className="min-h-[100dvh] px-4 pb-24 pt-28 md:pt-32">
      <div className="mx-auto max-w-6xl">
        <Eyebrow>운영 콘솔</Eyebrow>
        <h1 className="mt-5 font-display text-4xl font-bold tracking-tight md:text-5xl">
          관리자 대시보드
        </h1>
        <p className="mt-3 text-sm text-muted">
          회원·종목·미션·경제 이벤트를 관리합니다. (mock 데이터 — 실 API 연동 대비 구조)
        </p>

        {/* 통계 카드 */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={<Users width={20} height={20} />} label="전체 회원" value={stats ? `${stats.totalUsers}명` : '—'} sub={stats ? `활성 ${stats.activeUsers}명` : ''} />
          <StatCard icon={<Chart width={20} height={20} />} label="개설 계좌" value={stats ? `${stats.totalAccounts}개` : '—'} sub="주식 + 코인" />
          <StatCard icon={<Flag width={20} height={20} />} label="오늘 거래대금" value={stats ? formatKRW(stats.todayTradeVolume) : '—'} sub="24시간 누적" />
          <StatCard icon={<Calendar width={20} height={20} />} label="활성 이벤트" value={stats ? `${stats.activeEvents}건` : '—'} sub="알림 on" />
        </div>

        {/* 관리 메뉴 */}
        <div className="mt-10 flex justify-center sm:justify-start">
          <Tabs
            items={[
              { value: 'users', label: '회원' },
              { value: 'instruments', label: '종목' },
              { value: 'missions', label: '미션' },
              { value: 'events', label: '경제 이벤트' },
            ]}
            value={menu}
            onChange={(v) => setMenu(v as Menu)}
          />
        </div>

        <div className="mt-6">
          {menu === 'users' && <UsersPanel onChange={refreshStats} />}
          {menu === 'instruments' && <InstrumentsPanel />}
          {menu === 'missions' && <MissionsPanel />}
          {menu === 'events' && <EventsPanel onChange={refreshStats} />}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode
  label: string
  value: string
  sub: string
}) {
  return (
    <Card>
      <div className="p-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          {icon}
        </span>
        <p className="mt-4 text-xs text-muted">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold tabular">{value}</p>
        <p className="mt-1 text-xs text-muted">{sub}</p>
      </div>
    </Card>
  )
}

/* ---------- 회원 관리 ---------- */
function UsersPanel({ onChange }: { onChange: () => void }) {
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    adminService.getUsers().then(setUsers)
  }, [])

  const toggle = async (id: string) => {
    const updated = await adminService.toggleUserStatus(id)
    setUsers((list) => list.map((u) => (u.id === id ? updated : u)))
    onChange()
  }

  return (
    <Card>
      <div className="divide-y divide-line">
        <PanelHead cols={['닉네임', '이메일', '가입일', '상태', '']} />
        {users.map((u) => (
          <div key={u.id} className="grid grid-cols-2 items-center gap-3 px-6 py-4 sm:grid-cols-5">
            <span className="font-medium">
              {u.nickname}
              {u.role === 'ADMIN' && (
                <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-[10px] text-white">
                  관리자
                </span>
              )}
            </span>
            <span className="hidden text-sm text-muted sm:block">{u.email}</span>
            <span className="hidden text-sm text-muted sm:block">
              {formatDate(u.createdAt)}
            </span>
            <span>
              <StatusPill active={u.status === 'ACTIVE'} labels={['활성', '정지']} />
            </span>
            <span className="text-right">
              {u.role !== 'ADMIN' && (
                <button
                  onClick={() => toggle(u.id)}
                  className="rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-black/[0.06] transition-all hover:ring-brand/40"
                >
                  {u.status === 'ACTIVE' ? '정지' : '활성화'}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ---------- 종목 관리 ---------- */
function InstrumentsPanel() {
  const [market, setMarket] = useState<Market>('STOCK')
  const [list, setList] = useState<Instrument[]>([])

  useEffect(() => {
    let alive = true
    adminService.getInstruments(market).then((data) => {
      if (alive) setList(data)
    })
    return () => {
      alive = false
    }
  }, [market])

  const toggle = async (id: string) => {
    const updated = await adminService.toggleInstrument(id)
    setList((items) => items.map((i) => (i.id === id ? updated : i)))
  }

  return (
    <div>
      <Tabs
        className="mb-5"
        items={[
          { value: 'STOCK', label: '주식' },
          { value: 'CRYPTO', label: '코인' },
        ]}
        value={market}
        onChange={(v) => setMarket(v as Market)}
      />
      <Card>
        <div className="divide-y divide-line">
          <PanelHead cols={['종목', '심볼', '호가단위', '거래', '']} />
          {list.map((inst) => (
            <div key={inst.id} className="grid grid-cols-2 items-center gap-3 px-6 py-4 sm:grid-cols-5">
              <span className="font-medium">{inst.name}</span>
              <span className="hidden text-sm text-muted sm:block">{inst.symbol}</span>
              <span className="hidden text-sm text-muted tabular sm:block">
                {inst.tickSize.toLocaleString('ko-KR')}원
              </span>
              <span>
                <StatusPill active={inst.isTradable} labels={['거래중', '중지']} />
              </span>
              <span className="text-right">
                <button
                  onClick={() => toggle(inst.id)}
                  className="rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-black/[0.06] transition-all hover:ring-brand/40"
                >
                  {inst.isTradable ? '거래 중지' : '거래 허용'}
                </button>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* ---------- 미션 관리 ---------- */
function MissionsPanel() {
  const [missions, setMissions] = useState<Mission[]>([])
  const [form, setForm] = useState({ title: '', description: '', rewardLabel: '' })

  useEffect(() => {
    adminService.getMissions().then(setMissions)
  }, [])

  const toggle = async (id: string) => {
    const updated = await adminService.toggleMission(id)
    setMissions((list) => list.map((m) => (m.id === id ? updated : m)))
  }

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    const created = await adminService.createMission({
      title: form.title,
      description: form.description,
      rewardLabel: form.rewardLabel || '신규 뱃지',
    })
    setMissions((list) => [...list, created])
    setForm({ title: '', description: '', rewardLabel: '' })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <div className="divide-y divide-line">
          {missions.map((m) => (
            <div key={m.id} className="flex items-center gap-4 px-6 py-4">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-soft font-display text-sm font-semibold text-brand">
                {m.order}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{m.title}</p>
                <p className="truncate text-sm text-muted">{m.description}</p>
              </div>
              <span className="hidden rounded-full bg-black/[0.04] px-3 py-1 text-xs text-muted sm:inline">
                {m.rewardLabel}
              </span>
              <button
                onClick={() => toggle(m.id)}
                className="flex-none rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-black/[0.06] transition-all hover:ring-brand/40"
              >
                {m.isActive ? '노출 중' : '숨김'}
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <form onSubmit={create} className="space-y-3 p-6">
          <h3 className="font-semibold">미션 추가</h3>
          <Field
            label="제목"
            name="title"
            placeholder="예: 첫 매도 체결"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <Field
            label="설명"
            name="description"
            placeholder="미션 안내 문구"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <Field
            label="보상 라벨"
            name="rewardLabel"
            placeholder="예: 첫 매도 뱃지"
            value={form.rewardLabel}
            onChange={(e) => setForm((f) => ({ ...f, rewardLabel: e.target.value }))}
          />
          <Button type="submit" className="w-full">
            미션 생성
          </Button>
        </form>
      </Card>
    </div>
  )
}

/* ---------- 경제 이벤트 관리 ---------- */
const eventTypeLabels: Record<EconomicEventType, string> = {
  RATE: '금리',
  CPI: '물가',
  EARNINGS: '실적',
  ETC: '기타',
}

function EventsPanel({ onChange }: { onChange: () => void }) {
  const [events, setEvents] = useState<EconomicEvent[]>([])
  const [form, setForm] = useState({
    title: '',
    type: 'RATE' as EconomicEventType,
    eventAt: '',
    description: '',
  })

  useEffect(() => {
    adminService.getEvents().then(setEvents)
  }, [])

  const toggleAlert = async (id: string) => {
    const updated = await adminService.toggleEventAlert(id)
    setEvents((list) => list.map((e) => (e.id === id ? updated : e)))
    onChange()
  }

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.eventAt) return
    const created = await adminService.createEvent({
      title: form.title,
      type: form.type,
      eventAt: new Date(form.eventAt).toISOString(),
      description: form.description,
    })
    setEvents((list) => [created, ...list])
    setForm({ title: '', type: 'RATE', eventAt: '', description: '' })
    onChange()
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <div className="divide-y divide-line">
          {events.map((ev) => (
            <div key={ev.id} className="flex items-center gap-4 px-6 py-4">
              <span className="flex-none rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
                {eventTypeLabels[ev.type]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{ev.title}</p>
                <p className="truncate text-sm text-muted">{formatDate(ev.eventAt)} · {ev.description}</p>
              </div>
              <button
                onClick={() => toggleAlert(ev.id)}
                className={`flex-none rounded-full px-3 py-1.5 text-xs transition-all ${
                  ev.alertEnabled
                    ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
                    : 'bg-white text-muted ring-1 ring-black/[0.06]'
                }`}
              >
                알림 {ev.alertEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <form onSubmit={create} className="space-y-3 p-6">
          <h3 className="font-semibold">이벤트 등록</h3>
          <Field
            label="제목"
            name="ev-title"
            placeholder="예: FOMC 금리 결정"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">유형</span>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as EconomicEventType }))}
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
            >
              {(Object.keys(eventTypeLabels) as EconomicEventType[]).map((t) => (
                <option key={t} value={t}>
                  {eventTypeLabels[t]}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="일시"
            name="ev-at"
            type="datetime-local"
            value={form.eventAt}
            onChange={(e) => setForm((f) => ({ ...f, eventAt: e.target.value }))}
          />
          <Field
            label="설명"
            name="ev-desc"
            placeholder="이벤트 요약"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <Button type="submit" className="w-full">
            등록 + 알림 켜기
          </Button>
        </form>
      </Card>
    </div>
  )
}

/* ---------- 공용 소품 ---------- */
function PanelHead({ cols }: { cols: string[] }) {
  return (
    <div className="hidden grid-cols-5 gap-3 px-6 py-4 text-xs font-medium uppercase tracking-eyebrow text-muted sm:grid">
      {cols.map((c, i) => (
        <span key={i} className={i === cols.length - 1 ? 'text-right' : ''}>
          {c}
        </span>
      ))}
    </div>
  )
}

function StatusPill({ active, labels }: { active: boolean; labels: [string, string] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
        active ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-rose-400'}`} />
      {active ? labels[0] : labels[1]}
    </span>
  )
}
