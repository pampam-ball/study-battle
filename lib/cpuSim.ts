// CPU入退室・勉強/休憩シミュ（ローカル専用）
// ・10秒刻みで人数/時間が動く
// ・満員(CAPACITY=20)を超えない
// ・時間帯の混み具合の波は全ルーム共通（部屋依存なし）
// ・日付が変わったら0リセットではなく初期シードで再生成
// ・CPU名：一般＋推し/界隈っぽいタグでランダム生成

export type OccupantType = "you" | "cpu"
export type OccupantState = "studying" | "break" | "out"

export type Occupant = {
  id: string
  name: string
  type: OccupantType

  studyingMs: number
  state: OccupantState
  stateSince: number

  dailyTargetMs: number
}

export type RoomState = {
  roomId: string
  occupants: Occupant[]
  lastSimulatedAt: number
  dateKey: string // YYYY-MM-DD
}

const MS_HOUR = 60 * 60 * 1000

// ★10秒刻み
const STEP_MS = 10 * 1000
const STEPS_PER_MIN = 60_000 / STEP_MS // 6

// ★最大収容人数
const CAPACITY = 20

// ===== 名前生成（ランダム組み合わせ）=====
const CPU_ADJ = [
  "眠い",
  "静かな",
  "鬼集中",
  "爆速の",
  "まったり",
  "朝型な",
  "夜型",
  "理系",
  "文系",
  "暗記ゴリラ",
  "計算職人",
  "読書家",
  "ストイック",
  "ゆるふわ",
  "ガチ勢",
  "追い込み",
  "回復中",
  "無言の",
  "覚醒",
]

const CPU_NOUN = [
  "受験生",
  "浪人生",
  "院試勢",
  "英語マン",
  "数学オタ",
  "国語戦士",
  "理科勢",
  "情報強者",
  "タイマー職人",
  "ノート魔",
  "図書館民",
  "自習室の主",
  "深夜族",
  "朝活民",
  "集中マシン",
  "復習厨",
  "あの氏",
  "あのてゃ",
  "あのにます",
  "猫猫",
  "wimper",
  "よーじろー",
  "たけだ",
  "くわ",
  "腹ペコ",
  "歌と6弦と弟",
  "キャーキャーうるさい方",
  "ドラムと女声と姉",
]

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// CPU_FANDOM_TAGS を一切使わない版
function makeCpuName() {
  const tag = Math.floor(rand(1, 999)).toString().padStart(3, "0")
  const r = Math.random()

  // 70%：形容詞＋名詞（いちばん自然でバリエ多め）
  if (r < 0.7) {
    const adj = pick(CPU_ADJ)
    const noun = pick(CPU_NOUN)
    return `${adj}${noun}#${tag}`
  }

  // 30%：名詞だけ（短めの名前）
  const noun = pick(CPU_NOUN)
  return `${noun}#${tag}`
}

// ===== 日付キー =====
export function getDateKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// CPUの目標勉強時間（層分け）
function sampleDailyTargetMs(rank: "top" | "mid" | "low") {
  if (rank === "top") return rand(10.5, 13.5) * MS_HOUR
  if (rank === "mid") return rand(6, 9) * MS_HOUR
  return rand(1, 5) * MS_HOUR
}

function makeCpu(i: number, now: number, rank: "top" | "mid" | "low"): Occupant {
  return {
    id: `cpu-${i}`,
    name: makeCpuName(),
    type: "cpu",
    studyingMs: 0,
    state: "out",
    stateSince: now,
    dailyTargetMs: sampleDailyTargetMs(rank),
  }
}

// ★どの部屋でも同じ混み波（時間帯だけで決まる）
function desiredRange(_roomId: string, hour: number) {
  if (hour >= 7 && hour <= 11) return { min: 7, max: 14 } // 朝
  if (hour >= 12 && hour <= 18) return { min: 10, max: 18 } // 昼ピーク
  if (hour >= 19 && hour <= 23) return { min: 9, max: 17 } // 夜
  return { min: 4, max: 10 } // 深夜〜早朝
}

/**
 * ルーム状態を新規作成（初期入室シード＋初期勉強時間バラけ）
 */
export function createInitialRoomState(roomId: string): RoomState {
  const now = Date.now()
  const dateKey = getDateKey()

  // 初期CPU数
  const cpuCount = Math.floor(rand(8, 16))
  const topCount = cpuCount >= 2 ? 2 : 1

  const cpus: Occupant[] = []
  for (let i = 1; i <= cpuCount; i++) {
    const rank = i <= topCount ? "top" : i <= topCount + 5 ? "mid" : "low"
    const cpu = makeCpu(i, now, rank)

    // 初期シード：70%勉強中 / 10%休憩 / 20%外
    const r = Math.random()
    if (r < 0.7) cpu.state = "studying"
    else if (r < 0.8) cpu.state = "break"
    else cpu.state = "out"
    cpu.stateSince = now

    // ★開始直後から秒数が同じになりすぎないよう初期差分
    if (cpu.state === "studying" || cpu.state === "break") {
      const baseHours = rank === "top" ? rand(0.5, 2.5) : rank === "mid" ? rand(0.2, 1.5) : rand(0.0, 0.8)
      cpu.studyingMs = baseHours * MS_HOUR
    }

    cpus.push(cpu)
  }

  return {
    roomId,
    occupants: cpus,
    lastSimulatedAt: now,
    dateKey,
  }
}

// ===== localStorage =====
export function roomStorageKey(roomId: string) {
  return `study-battle:room:${roomId}`
}

export function loadRoomState(roomId: string): RoomState {
  if (typeof window === "undefined") {
    return createInitialRoomState(roomId)
  }
  const raw = localStorage.getItem(roomStorageKey(roomId))
  if (!raw) return createInitialRoomState(roomId)
  try {
    return JSON.parse(raw) as RoomState
  } catch {
    return createInitialRoomState(roomId)
  }
}

export function saveRoomState(state: RoomState) {
  if (typeof window === "undefined") return
  localStorage.setItem(roomStorageKey(state.roomId), JSON.stringify(state))
}

/**
 * ★日付が変わったら初期シード付きで作り直す
 */
export function resetIfNewDay(state: RoomState, now = Date.now()): RoomState {
  const key = getDateKey(new Date(now))
  if (key === state.dateKey) return state

  const fresh = createInitialRoomState(state.roomId)
  return {
    ...fresh,
    roomId: state.roomId,
    dateKey: key,
    lastSimulatedAt: now,
  }
}

/**
 * ★10秒刻みで進める版＋満員制御＋波制御
 */
export function advanceRoomState(state: RoomState, now = Date.now()): RoomState {
  const next = resetIfNewDay(state, now)

  const deltaMs = now - next.lastSimulatedAt
  if (deltaMs <= 0) return next

  const steps = Math.min((24 * 60 * 60) / (STEP_MS / 1000), Math.floor(deltaMs / STEP_MS))

  let t = next.lastSimulatedAt
  const occupants = next.occupants.map((o) => ({ ...o }))

  const scale = (pPerMin: number) => pPerMin / STEPS_PER_MIN

  for (let s = 0; s < steps; s++) {
    t += STEP_MS

    const hour = new Date(t).getHours()
    const range = desiredRange(next.roomId, hour)

    let inRoom = occupants.filter((o) => o.state !== "out").length

    for (const o of occupants) {
      if (o.type !== "cpu") continue

      const targetReached = o.studyingMs >= o.dailyTargetMs
      const crowded = inRoom >= range.max
      const emptyish = inRoom <= range.min

      if (o.state === "out") {
        // 退出中 → 入室（満員なら入れない）
        if (inRoom < CAPACITY) {
          let pInPerMin = targetReached ? 0.02 : 0.08
          if (emptyish) pInPerMin *= 1.8
          if (crowded) pInPerMin *= 0.25

          if (Math.random() < scale(pInPerMin)) {
            o.state = "studying"
            o.stateSince = t
            inRoom += 1
          }
        }
      } else if (o.state === "studying") {
        o.studyingMs += STEP_MS

        const pBreakPerMin = 0.06
        let pOutPerMin = targetReached ? 0.08 : 0.03

        if (crowded) pOutPerMin *= 1.8

        const r = Math.random()
        if (r < scale(pOutPerMin)) {
          o.state = "out"
          o.stateSince = t
          inRoom = Math.max(0, inRoom - 1)
        } else if (r < scale(pOutPerMin) + scale(pBreakPerMin)) {
          o.state = "break"
          o.stateSince = t
        }
      } else if (o.state === "break") {
        const breakDurSec = (t - o.stateSince) / 1000

        const pBackPerMin = breakDurSec >= 50 ? 0.25 : 0.05
        let pOutPerMin = targetReached ? 0.05 : 0.02

        if (crowded) pOutPerMin *= 1.3

        const r = Math.random()
        if (r < scale(pOutPerMin)) {
          o.state = "out"
          o.stateSince = t
          inRoom = Math.max(0, inRoom - 1)
        } else if (r < scale(pOutPerMin) + scale(pBackPerMin)) {
          o.state = "studying"
          o.stateSince = t
        }
      }
    }
  }

  return {
    ...next,
    occupants,
    lastSimulatedAt: now,
  }
}

// ===== 集計 =====
export function countInRoom(state: RoomState) {
  return state.occupants.filter((o) => o.state !== "out").length
}

export function countStudying(state: RoomState) {
  return state.occupants.filter((o) => o.state === "studying").length
}

export function getRanking(state: RoomState, you?: Occupant) {
  const list = [...state.occupants]
  if (you) list.push(you)
  return list.slice().sort((a, b) => b.studyingMs - a.studyingMs)
}
