"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

import {
  advanceRoomState,
  getDateKey,
  loadRoomState,
  saveRoomState,
  type Occupant,
  type RoomState,
} from "@/lib/cpuSim"

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

const BREAK_LIMIT_MS = 30 * 60 * 1000 // 30分
const CPU_TICK_MS = 10 * 1000 // CPU更新間隔

export default function RoomPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const roomId = params?.id ?? "room"

  const roomName = useMemo(() => {
    if (roomId === "room-1") return "自習室1"
    if (roomId === "room-2") return "自習室2"
    if (roomId === "room-3") return "自習室3"
    return `自習室 ${roomId}`
  }, [roomId])

  const [isStudying, setIsStudying] = useState(true)
  const [elapsedMs, setElapsedMs] = useState(0)

  const [breakMs, setBreakMs] = useState(0)
  const [breakOver, setBreakOver] = useState(false)

  const isStudyingRef = useRef(true)
  const lastRef = useRef<number | null>(null)

  useEffect(() => {
    isStudyingRef.current = isStudying
  }, [isStudying])

  // あなたのストップウォッチ
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now()
      if (lastRef.current == null) {
        lastRef.current = now
        return
      }
      const delta = now - lastRef.current
      lastRef.current = now

      if (isStudyingRef.current) {
        setElapsedMs((e) => e + delta)
      } else {
        setBreakMs((b) => {
          const nb = b + delta
          if (nb >= BREAK_LIMIT_MS) {
            setIsStudying(true)
            setBreakOver(true)
            return BREAK_LIMIT_MS
          }
          return nb
        })
      }
    }, 200)
    return () => clearInterval(id)
  }, [])

  const startBreak = () => {
    setBreakOver(false)
    setBreakMs(0)
    setIsStudying(false)
  }
  const resumeStudy = () => setIsStudying(true)

  const resetAll = () => {
    setElapsedMs(0)
    setBreakMs(0)
    setBreakOver(false)
    setIsStudying(true)
  }

  const breakRemainMs = Math.max(0, BREAK_LIMIT_MS - breakMs)
  const breakProgress = Math.min(100, (breakMs / BREAK_LIMIT_MS) * 100)

  const [roomState, setRoomState] = useState<RoomState | null>(null)

  // 部屋状態ロード→即advance
  useEffect(() => {
    const s = loadRoomState(roomId)
    const adv = advanceRoomState(s, Date.now())
    saveRoomState(adv)
    setRoomState(adv)
  }, [roomId])

  // CPUを定期更新
  useEffect(() => {
    const id = setInterval(() => {
      setRoomState((prev) => {
        if (!prev) return prev
        const adv = advanceRoomState(prev, Date.now())
        saveRoomState(adv)
        return adv
      })
    }, CPU_TICK_MS)
    return () => clearInterval(id)
  }, [])

  // あなたのlocalStorageキー（日付・部屋別）
  const youKey = useMemo(() => {
    const dk = getDateKey()
    return `study-battle:you:${roomId}:${dk}`
  }, [roomId])

  // 復元
  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = localStorage.getItem(youKey)
    if (!raw) return
    try {
      const data = JSON.parse(raw) as {
        studyingMs: number
        lastStudying: boolean
      }
      setElapsedMs(data.studyingMs ?? 0)
      setIsStudying(data.lastStudying ?? true)
    } catch {}
  }, [youKey])

  // 保存
  useEffect(() => {
    if (typeof window === "undefined") return
    const id = setInterval(() => {
      localStorage.setItem(
        youKey,
        JSON.stringify({
          studyingMs: elapsedMs,
          lastStudying: isStudying,
        }),
      )
    }, 5000)
    return () => clearInterval(id)
  }, [youKey, elapsedMs, isStudying])

  // あなたのOccupant
  const youOcc: Occupant = useMemo(
    () => ({
      id: "you",
      name: "あなた",
      type: "you",
      studyingMs: elapsedMs,
      state: isStudying ? "studying" : "break",
      stateSince: Date.now(),
      dailyTargetMs: 0,
    }),
    [elapsedMs, isStudying],
  )

  // ✅ ランキング（必ず you を含める）
  const ranking = useMemo(() => {
    if (!roomState) return [youOcc]

    // CPUだけ（youが混ざってたら除外）
    const cpuList = roomState.occupants.filter(
      (o) => o.state !== "out" && o.id !== "you",
    )

    const merged = [...cpuList, youOcc]
    merged.sort((a, b) => b.studyingMs - a.studyingMs)
    return merged
  }, [roomState, youOcc])

  const youRank = useMemo(() => {
    const idx = ranking.findIndex((o) => o.id === "you")
    return idx >= 0 ? idx + 1 : null
  }, [ranking])

  const topStudyingMs = ranking.length ? ranking[0].studyingMs : 0
  const diffMs = Math.max(0, topStudyingMs - elapsedMs)
  const leading = ranking[0]?.id === "you"

  // ✅ 部屋にいる人リスト（必ず you を含める）
  const inRoomList = useMemo(() => {
    if (!roomState) return [youOcc]
    const cpuList = roomState.occupants.filter(
      (o) => o.state !== "out" && o.id !== "you",
    )
    return [...cpuList, youOcc]
  }, [roomState, youOcc])

  const inRoomCount = inRoomList.length
  const studyingCount = inRoomList.filter((o) => o.state === "studying").length

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              {roomName}
            </h1>
            <Badge className="bg-blue-100 text-blue-700 border-blue-300">
              ⚡ 対決中（在室{inRoomCount} / 勉強中{studyingCount}）
            </Badge>
          </div>
          <Button
            variant="outline"
            className="rounded-lg border-slate-300 text-slate-600 hover:bg-slate-100 bg-white"
            onClick={() => router.push("/")}
          >
            退出
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 grid gap-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 rounded-2xl bg-white border-slate-200 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-blue-600 text-lg">
                ⏱ あなたの勉強時間
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6">
              <div className="text-center w-full">
                <div className="text-7xl font-black tabular-nums bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                  {formatTime(elapsedMs)}
                </div>
                <div
                  className={`text-lg font-semibold px-4 py-2 rounded-lg inline-block ${
                    isStudying
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {isStudying ? "🔥 勉強中" : "☕ 休憩中"}
                </div>
              </div>

              {!isStudying && (
                <div className="w-full space-y-3">
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>休憩時間（最大30分）</span>
                    <span className="tabular-nums font-semibold text-blue-600">
                      残り {formatTime(breakRemainMs)}
                    </span>
                  </div>
                  <Progress value={breakProgress} className="h-2" />
                  {breakOver && (
                    <div className="text-sm text-amber-700 font-medium bg-amber-100 px-3 py-2 rounded-lg">
                      ⚠ 30分経過！自動で勉強に戻ります
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl bg-white border-slate-200 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-blue-600 text-lg">
                ⚔ 対決ステータス
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">順位</span>
                <span
                  className={`text-2xl font-bold ${
                    youRank === 1 ? "text-amber-600" : "text-blue-600"
                  }`}
                >
                  {youRank ? `${youRank}位` : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">状態</span>
                <span
                  className={`font-bold text-lg ${
                    leading ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {leading ? "🏆 勝利中" : "📉 敗北中"}
                </span>
              </div>
              {!leading && (
                <div className="text-xs text-amber-700 bg-amber-100 px-2 py-1.5 rounded">
                  1位との差: {formatTime(diffMs)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:gap-4">
          {isStudying ? (
            <Button
              onClick={startBreak}
              className="rounded-xl h-14 text-base font-bold bg-gradient-to-r from-slate-200 to-slate-300 hover:from-slate-300 hover:to-slate-400 text-slate-800 shadow-lg"
            >
              ☕ 休憩
            </Button>
          ) : (
            <Button
              onClick={resumeStudy}
              className="rounded-xl h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg"
            >
              🔥 再開
            </Button>
          )}

          <Button
            onClick={resetAll}
            className="rounded-xl h-14 text-base font-bold bg-gradient-to-r from-slate-400 to-slate-500 hover:from-slate-500 hover:to-slate-600 text-white shadow-lg"
          >
            ↻ リセット
          </Button>
        </div>

        <Card className="rounded-2xl bg-white border-slate-200 shadow-lg overflow-hidden">
          <CardHeader className="pb-3 bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardTitle className="text-blue-600 text-lg">
              🏅 今日のランキング
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {ranking.slice(0, 10).map((o, i) => {
              const isYou = o.id === "you"
              const is1st = i === 0
              return (
                <div
                  key={o.id}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 transition-all ${
                    isYou
                      ? "bg-gradient-to-r from-blue-100 to-indigo-100 border-2 border-blue-400 shadow-md font-semibold"
                      : is1st
                        ? "bg-gradient-to-r from-amber-100 to-yellow-100 border border-amber-300"
                        : "bg-slate-50 border border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span
                      className={`w-8 text-center font-bold ${
                        is1st
                          ? "text-amber-600 text-lg"
                          : isYou
                            ? "text-blue-600"
                            : "text-slate-500"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={`font-semibold truncate ${
                        isYou
                          ? "text-blue-700"
                          : is1st
                            ? "text-amber-700"
                            : "text-slate-700"
                      }`}
                    >
                      {o.name}
                    </span>
                    {isYou && (
                      <Badge className="bg-blue-600 text-white ml-auto mr-2 shrink-0">
                        YOU
                      </Badge>
                    )}
                    {o.state === "studying" && !isYou && (
                      <Badge className="bg-green-100 text-green-700 text-xs shrink-0">
                        勉強中
                      </Badge>
                    )}
                    {o.state === "break" && !isYou && (
                      <Badge
                        variant="outline"
                        className="text-xs border-slate-300 text-slate-600 shrink-0"
                      >
                        休憩
                      </Badge>
                    )}
                  </div>
                  <div
                    className={`tabular-nums font-bold text-right shrink-0 ${
                      isYou
                        ? "text-blue-600 text-lg"
                        : is1st
                          ? "text-amber-600"
                          : "text-slate-600"
                    }`}
                  >
                    {formatTime(o.studyingMs)}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="rounded-2xl bg-white border-slate-200 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-blue-600 text-lg">
              👥 いま部屋にいる人たち（{inRoomCount}人）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inRoomList.length === 0 ? (
              <div className="text-slate-500 text-center py-4">
                いまは誰もいません
              </div>
            ) : (
              inRoomList.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-50 border border-slate-200"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="font-medium text-slate-700 truncate">
                      {o.name}
                    </span>
                    {o.id === "you" && (
                      <Badge className="bg-blue-600 text-white text-xs shrink-0">
                        YOU
                      </Badge>
                    )}
                    {o.state === "studying" && o.id !== "you" && (
                      <Badge className="bg-green-100 text-green-700 text-xs shrink-0">
                        勉強中
                      </Badge>
                    )}
                    {o.state === "break" && o.id !== "you" && (
                      <Badge
                        variant="outline"
                        className="text-xs border-slate-300 text-slate-600 shrink-0"
                      >
                        休憩
                      </Badge>
                    )}
                  </div>
                  <div className="tabular-nums text-slate-600 font-semibold text-sm shrink-0">
                    {formatTime(o.studyingMs)}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="text-xs text-slate-500 text-center pt-4">
          Room ID: {roomId}
        </div>
      </main>
    </div>
  )
}
