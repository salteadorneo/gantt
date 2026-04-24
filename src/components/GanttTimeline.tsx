import { useEffect, useMemo, useRef, useState } from "react"
import { GripVertical, Plus, X } from "lucide-react"

import { DAY_MS, buildTimelineDays, dayOffset, flattenTasks } from "../lib/gantt"
import { t } from "../lib/i18n"
import type { GanttProject } from "../types/gantt"
import { GanttBar } from "./GanttBar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog"

interface DragState {
  draggedId: number
  dragOverId: number | null
  dropPosition: "before" | "after"
}

interface Props {
  project: GanttProject
  readOnly?: boolean
  selectedTaskId: number | null
  onSelect: (id: number) => void
  onOpenDetail: (id: number) => void
  onCreateTask: () => void
  onCreateSubtask: (parentId: number) => void
  onCommit: (updater: (project: GanttProject) => GanttProject) => void
  onDelete: (id: number) => void
  onReorder: (draggedId: number, targetId: number, position: "before" | "after") => void
  dayWidth?: number
}

export function GanttTimeline({
  project,
  readOnly = false,
  selectedTaskId,
  onSelect,
  onOpenDetail,
  onCreateTask,
  onCreateSubtask,
  onCommit,
  onDelete,
  onReorder,
  dayWidth = 44,
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const LABEL_WIDTH = viewportWidth > 0 && viewportWidth < 640 ? 120 : 240

  useEffect(() => {
    const viewportEl = viewportRef.current
    if (!viewportEl) return

    const updateViewportWidth = () => setViewportWidth(viewportEl.clientWidth)
    updateViewportWidth()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewportWidth)
      return () => window.removeEventListener("resize", updateViewportWidth)
    }

    const resizeObserver = new ResizeObserver(updateViewportWidth)
    resizeObserver.observe(viewportEl)

    return () => resizeObserver.disconnect()
  }, [])

  // Global drag listeners — only attached while dragging
  useEffect(() => {
    if (readOnly) return
    if (!dragState) return

    document.body.style.cursor = "grabbing"
    document.body.style.userSelect = "none"

    const getDropTarget = (clientY: number): { dragOverId: number | null; dropPosition: "before" | "after" } => {
      for (const [id, el] of rowRefs.current) {
        const rect = el.getBoundingClientRect()
        if (clientY >= rect.top && clientY <= rect.bottom) {
          return {
            dragOverId: id,
            dropPosition: clientY < rect.top + rect.height / 2 ? "before" : "after",
          }
        }
      }
      return { dragOverId: null, dropPosition: "after" }
    }

    const applyMove = (clientY: number) => {
      const { dragOverId, dropPosition } = getDropTarget(clientY)
      if (dragRef.current) {
        dragRef.current = { ...dragRef.current, dragOverId, dropPosition }
      }
      setDragState((prev) => (prev ? { ...prev, dragOverId, dropPosition } : null))
    }

    const commitDrop = () => {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      const state = dragRef.current
      if (state?.dragOverId != null && state.dragOverId !== state.draggedId) {
        onReorder(state.draggedId, state.dragOverId, state.dropPosition)
      }
      setDragState(null)
      dragRef.current = null
    }

    const onMouseMove = (e: MouseEvent) => applyMove(e.clientY)
    const onMouseUp = () => commitDrop()
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      applyMove(e.touches[0].clientY)
    }
    const onTouchEnd = () => commitDrop()

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
    document.addEventListener("touchmove", onTouchMove, { passive: false })
    document.addEventListener("touchend", onTouchEnd)
    return () => {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
      document.removeEventListener("touchmove", onTouchMove)
      document.removeEventListener("touchend", onTouchEnd)
    }
  }, [dragState?.draggedId, onReorder, readOnly])

  const flatTasks = flattenTasks(project.data)
  const timelineDays = useMemo(() => {
    const baseTimelineDays = buildTimelineDays(project)
    if (!baseTimelineDays.length) return []

    const visibleTimelineWidth = Math.max(0, viewportWidth - LABEL_WIDTH)
    const halfRange = Math.max(10, Math.floor(Math.floor(visibleTimelineWidth / dayWidth) / 2))

    // Anchor to today so the timeline doesn't shift when a task is moved
    const today = new Date()
    const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    const stableStartMs = todayMs - halfRange * DAY_MS
    const stableEndMs = todayMs + halfRange * DAY_MS

    const firstTaskMs = baseTimelineDays[0].getTime()
    const lastTaskMs = baseTimelineDays[baseTimelineDays.length - 1].getTime()

    const startMs = Math.min(stableStartMs, firstTaskMs)
    const endMs = Math.max(stableEndMs, lastTaskMs)

    const days: Date[] = []
    for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
      days.push(new Date(ms))
    }
    return days
  }, [project, dayWidth, viewportWidth])
  const timelineStart = timelineDays[0]

  if (!timelineStart || !flatTasks.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
        <span>{t("noTasksToShow")}</span>
        {!readOnly && (
          <button
            type="button"
            onClick={onCreateTask}
            className="inline-flex items-center gap-1 rounded-sm border px-3 py-1.5 text-sm text-foreground hover:bg-muted/60"
          >
            <Plus size={14} />
            <span>{t("emptyCreateFirstTask")}</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <div ref={viewportRef} className="h-full overflow-auto">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `${LABEL_WIDTH}px repeat(${timelineDays.length}, ${dayWidth}px)`,
          minWidth: `${LABEL_WIDTH + timelineDays.length * dayWidth}px`,
        }}
      >
        {/* Header row */}
        <div className="sticky left-0 z-20 border-b bg-card p-2 text-xs font-medium">
          {t("taskColumnHeader")}
        </div>
        {timelineDays.map((day) => {
          const isMonday = day.getUTCDay() === 1
          const isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6
          return (
            <div
              key={day.toISOString()}
              className={`border-b border-l p-1 text-center text-[10px] text-muted-foreground ${
                isWeekend ? "bg-muted/60 font-medium" : isMonday ? "bg-muted/40 font-medium" : ""
              }`}
            >
              {viewportWidth < 640
                ? day.getUTCDate()
                : new Intl.DateTimeFormat(t("dateLocale"), { day: "2-digit", month: "2-digit" }).format(day)}
            </div>
          )
        })}

        {/* Task rows */}
        {flatTasks.map(({ task, level }) => {
          const left = dayOffset(timelineStart, task.StartDate)
          const isMilestone = task.Duration === 0
          const isDragged = dragState?.draggedId === task.TaskID
          const isDropTarget = dragState?.dragOverId === task.TaskID && !isDragged

          return (
            <div key={task.TaskID} className="contents">
              {/* name cell */}
              <div
                ref={(el) => {
                  if (el) rowRefs.current.set(task.TaskID, el)
                  else rowRefs.current.delete(task.TaskID)
                }}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!dragRef.current) onOpenDetail(task.TaskID)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    if (!dragRef.current) onOpenDetail(task.TaskID)
                  }
                }}
                className={`group sticky left-0 z-10 flex h-10 min-w-0 items-center gap-1 border-b bg-card text-left text-sm transition-opacity ${
                  selectedTaskId === task.TaskID ? "bg-accent" : "hover:bg-muted/40"
                } ${isDragged ? "opacity-40" : ""}`}
                style={{ paddingLeft: `${8 + level * 12}px`, paddingRight: "52px" }}
              >
                {/* drop indicators */}
                {isDropTarget && dragState.dropPosition === "before" && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-50 pointer-events-none" />
                )}
                {isDropTarget && dragState.dropPosition === "after" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary z-50 pointer-events-none" />
                )}

                {/* grip handle */}
                {!readOnly && (
                  <div
                    className="flex shrink-0 items-center text-muted-foreground/30 hover:text-muted-foreground/70 cursor-grab"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      const state: DragState = { draggedId: task.TaskID, dragOverId: null, dropPosition: "after" }
                      dragRef.current = state
                      setDragState(state)
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation()
                      const state: DragState = { draggedId: task.TaskID, dragOverId: null, dropPosition: "after" }
                      dragRef.current = state
                      setDragState(state)
                    }}
                  >
                    <GripVertical size={13} />
                  </div>
                )}

                <span className="truncate">{task.TaskName}</span>

                {!readOnly && (
                  <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                    <button
                      type="button"
                      aria-label={t("subtask")}
                      title={t("subtask")}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onCreateSubtask(task.TaskID)
                      }}
                    >
                      <Plus size={14} />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          aria-label={t("deleteTask")}
                          title={t("deleteTask")}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <X size={14} />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("confirmDeleteTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("confirmDeleteDescription")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(task.TaskID)}>
                            {t("confirm")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>

              {/* bar cell */}
              <div
                className="relative h-10 border-b"
                style={{ gridColumn: `2 / span ${timelineDays.length}` }}
              >
                {/* drop indicators (spanning the bar area) */}
                {isDropTarget && dragState.dropPosition === "before" && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-50 pointer-events-none" />
                )}
                {isDropTarget && dragState.dropPosition === "after" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary z-50 pointer-events-none" />
                )}

                {/* weekend shading */}
                {timelineDays.map((day, i) => {
                  const isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6
                  if (!isWeekend) return null
                  return (
                    <div
                      key={i}
                      className="absolute top-0 h-full bg-muted/40 pointer-events-none"
                      style={{ left: `${i * dayWidth}px`, width: `${dayWidth}px` }}
                    />
                  )
                })}

                {/* today line */}
                {(() => {
                  const todayOffset = dayOffset(timelineStart, new Date().toISOString())
                  return (
                    <div
                      className="absolute top-0 h-full w-px bg-red-400/50 pointer-events-none z-10"
                      style={{ left: `${todayOffset * dayWidth + dayWidth / 2}px` }}
                    />
                  )
                })()}

                {isMilestone ? (
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 size-4 rotate-45 rounded-sm bg-amber-500 ${isDragged ? "opacity-40" : ""}`}
                    style={{ left: `${left * dayWidth + dayWidth / 2 - 8}px` }}
                    title={`${task.TaskName} (${t("milestone")})`}
                  />
                ) : (
                  <div className={isDragged ? "opacity-40" : ""}>
                    <GanttBar
                      task={task}
                      timelineStart={timelineStart}
                      dayWidth={dayWidth}
                      selected={selectedTaskId === task.TaskID}
                      readOnly={readOnly}
                      onSelect={onSelect}
                      onCommit={onCommit}
                    />
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Add task row */}
        {!readOnly && (
          <div className="contents">
            <button
              type="button"
              onClick={onCreateTask}
              className="sticky left-0 z-10 flex h-10 min-w-0 items-center gap-1 border-b bg-card px-2 text-left text-sm text-muted-foreground hover:bg-muted/40"
            >
              <Plus size={13} className="shrink-0" />
              <span>{t("newTask")}</span>
            </button>
            <div
              className="h-10 border-b"
              style={{ gridColumn: `2 / span ${timelineDays.length}` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
