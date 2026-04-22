import { useRef } from "react"

import { DAY_MS, dayOffset, normalizeTask, updateTaskInTree } from "../lib/gantt"
import type { GanttProject, GanttTask } from "../types/gantt"

interface Props {
  task: GanttTask
  timelineStart: Date
  dayWidth: number
  selected: boolean
  onSelect: (id: number) => void
  onCommit: (updater: (project: GanttProject) => GanttProject) => void
}

type DragType = "move" | "resize" | "resize-left"

interface DragState {
  type: DragType
  startX: number
  originalStartMs: number
  originalEndMs: number
  barEl: HTMLDivElement
  initialLeft: number
  initialWidth: number
}

export function GanttBar({ task, timelineStart, dayWidth, selected, onSelect, onCommit }: Props) {
  const dragRef = useRef<DragState | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)

  const leftDays = dayOffset(timelineStart, task.StartDate)
  const widthDays = Math.max(1, task.Duration)
  const leftPx = leftDays * dayWidth + 2
  const widthPx = widthDays * dayWidth - 4

  const commitDrag = (daysDelta: number, type: DragType) => {
    if (daysDelta === 0) return

    onCommit((current) => ({
      ...current,
      data: updateTaskInTree(current.data, task.TaskID, (t) => {
        if (type === "move") {
          const newStartMs = new Date(t.StartDate).getTime() + daysDelta * DAY_MS
          const newEndMs = new Date(t.EndDate).getTime() + daysDelta * DAY_MS
          return normalizeTask({
            ...t,
            StartDate: new Date(newStartMs).toISOString(),
            EndDate: new Date(newEndMs).toISOString(),
          })
        } else if (type === "resize") {
          const newEndMs = new Date(t.EndDate).getTime() + daysDelta * DAY_MS
          if (newEndMs <= new Date(t.StartDate).getTime()) return t
          return normalizeTask({
            ...t,
            EndDate: new Date(newEndMs).toISOString(),
          })
        } else {
          // resize-left
          const newStartMs = new Date(t.StartDate).getTime() + daysDelta * DAY_MS
          if (newStartMs >= new Date(t.EndDate).getTime()) return t
          return normalizeTask({
            ...t,
            StartDate: new Date(newStartMs).toISOString(),
          })
        }
      }),
    }))
  }

  const initDrag = (clientX: number, type: DragType) => {
    const barEl = barRef.current
    if (!barEl) return

    dragRef.current = {
      type,
      startX: clientX,
      originalStartMs: new Date(task.StartDate).getTime(),
      originalEndMs: new Date(task.EndDate).getTime(),
      barEl,
      initialLeft: leftPx,
      initialWidth: widthPx,
    }
  }

  const applyDragMove = (clientX: number) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = clientX - drag.startX
    const daysDelta = Math.round(dx / dayWidth)
    if (drag.type === "move") {
      drag.barEl.style.left = `${Math.max(2, drag.initialLeft + daysDelta * dayWidth)}px`
    } else if (drag.type === "resize") {
      drag.barEl.style.width = `${Math.max(dayWidth - 4, drag.initialWidth + daysDelta * dayWidth)}px`
    } else {
      const clampedDelta = Math.min(daysDelta, Math.floor((drag.initialWidth - (dayWidth - 4)) / dayWidth))
      drag.barEl.style.left = `${drag.initialLeft + clampedDelta * dayWidth}px`
      drag.barEl.style.width = `${drag.initialWidth - clampedDelta * dayWidth}px`
    }
  }

  const finishDrag = (clientX: number) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    const daysDelta = Math.round((clientX - drag.startX) / dayWidth)
    commitDrag(daysDelta, drag.type)
  }

  const startDrag = (e: React.MouseEvent<HTMLDivElement>, type: DragType) => {
    e.preventDefault()
    e.stopPropagation()
    initDrag(e.clientX, type)

    document.body.style.cursor = type === "move" ? "grabbing" : "ew-resize"
    document.body.style.userSelect = "none"

    const onMouseMove = (ev: MouseEvent) => applyDragMove(ev.clientX)
    const onMouseUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      finishDrag(ev.clientX)
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }

  const startTouchDrag = (e: React.TouchEvent<HTMLDivElement>, type: DragType) => {
    e.stopPropagation()
    const touch = e.touches[0]
    initDrag(touch.clientX, type)

    const onTouchMove = (ev: TouchEvent) => {
      ev.preventDefault()
      applyDragMove(ev.touches[0].clientX)
    }
    const onTouchEnd = (ev: TouchEvent) => {
      document.removeEventListener("touchmove", onTouchMove)
      document.removeEventListener("touchend", onTouchEnd)
      finishDrag(ev.changedTouches[0].clientX)
    }

    document.addEventListener("touchmove", onTouchMove, { passive: false })
    document.addEventListener("touchend", onTouchEnd)
  }

  return (
    <div
      ref={barRef}
      className={`absolute top-2 h-6 rounded-md cursor-grab select-none overflow-hidden transition-shadow ${
        selected
          ? "ring-2 ring-ring ring-offset-1 bg-primary/75"
          : "bg-primary/70 hover:bg-primary/80"
      }`}
      style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
      onMouseDown={(e) => {
        onSelect(task.TaskID)
        startDrag(e, "move")
        e.stopPropagation()
      }}
      onTouchStart={(e) => {
        onSelect(task.TaskID)
        startTouchDrag(e, "move")
      }}
      title={`${task.TaskName} — ${task.Duration}d (${task.Progress}%)`}
    >
      {/* progress fill */}
      <div
        className="h-full bg-primary pointer-events-none"
        style={{ width: `${task.Progress}%` }}
      />

      {/* progress label */}
      {task.Progress > 12 && (
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-primary-foreground pointer-events-none">
          {task.Progress}%
        </span>
      )}

      {/* resize handle left */}
      <div
        className="absolute left-0 top-0 h-full w-3 cursor-ew-resize hover:bg-white/30 rounded-l-md"
        onMouseDown={(e) => {
          onSelect(task.TaskID)
          startDrag(e, "resize-left")
        }}
        onTouchStart={(e) => {
          onSelect(task.TaskID)
          startTouchDrag(e, "resize-left")
        }}
      />

      {/* resize handle right */}
      <div
        className="absolute right-0 top-0 h-full w-3 cursor-ew-resize hover:bg-white/30 rounded-r-md"
        onMouseDown={(e) => {
          onSelect(task.TaskID)
          startDrag(e, "resize")
        }}
        onTouchStart={(e) => {
          onSelect(task.TaskID)
          startTouchDrag(e, "resize")
        }}
      />
    </div>
  )
}
