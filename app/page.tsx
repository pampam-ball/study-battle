// v0-check-1125
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

import { advanceRoomState, countStudying, createInitialRoomState, loadRoomState, saveRoomState } from "@/lib/cpuSim"

type RoomDef = {
  id: string
  name: string
  active: boolean
  capacity: number
}

const ROOM_DEFS: RoomDef[] = [
  { id: "room-1", name: "自習室1", active: true, capacity: 20 },
  { id: "room-2", name: "自習室2", active: true, capacity: 20 },
  { id: "room-3", name: "自習室3", active: true, capacity: 20 },
]

export default function HomePage() {
  const rooms = useMemo(() => ROOM_DEFS.filter((r) => r.active), [])
  const [studyingMap, setStudyingMap] = useState<Record<string, number>>({})

  useEffect(() => {
    // 初回&定期更新でCPU状態を進めて人数を反映
    const updateAllRooms = () => {
      const nextMap: Record<string, number> = {}

      for (const room of rooms) {
        let state
        try {
          state = loadRoomState(room.id)
        } catch {
          state = createInitialRoomState(room.id)
        }
        const advanced = advanceRoomState(state, Date.now())
        saveRoomState(advanced)

        nextMap[room.id] = countStudying(advanced)
      }

      setStudyingMap(nextMap)
    }

    updateAllRooms()
    const id = setInterval(updateAllRooms, 30 * 1000) // 30秒ごとにCPU進行
    return () => clearInterval(id)
  }, [rooms])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950">
      <header className="sticky top-0 z-10 border-b border-slate-200/50 dark:border-slate-700/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
              勉強時間対決
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Study Battle Mode</p>
          </div>
          <Badge variant="secondary" className="px-3 py-1 text-xs font-medium">
            ローカル版
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2">アクティブな自習室</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            部屋を選んで入室すると、勉強時間のカウントが始まります。最高の集中環境を見つけましょう！
          </p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {rooms.map((room) => {
            const studying = studyingMap[room.id] ?? 0
            const percentage = (studying / room.capacity) * 100

            return (
              <Card
                key={room.id}
                className="group relative overflow-hidden rounded-2xl border-0 shadow-lg hover:shadow-2xl transition-all duration-300 dark:bg-slate-800 bg-white"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 dark:from-blue-400/10 dark:to-indigo-400/10 pointer-events-none" />

                <CardHeader className="pb-3 relative z-10">
                  <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-50">{room.name}</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4 relative z-10">
                  <div className="space-y-2">
                    <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                      {studying}
                      <span className="text-lg text-slate-400 dark:text-slate-500 ml-2">/ {room.capacity}</span>
                    </div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      人が勉強中
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 ease-out"
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{Math.round(percentage)}% 満室</p>
                  </div>

                  <Button
                    asChild
                    className="w-full mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-2 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 dark:from-blue-500 dark:to-indigo-500 dark:hover:from-blue-600 dark:hover:to-indigo-600"
                  >
                    <Link href={`/room/${room.id}`} className="w-full">
                      入室する
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </main>
    </div>
  )
}

