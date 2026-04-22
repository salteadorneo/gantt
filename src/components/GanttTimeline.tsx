import { buildTimelineDays, dayOffset, flattenTasks } from "../lib/gantt"
import type { GanttProject } from "../types/gantt"
import { GanttBar } from "./GanttBar"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ui/context-menu"

interface Props {
  project: GanttProject
  selectedTaskId: number | null
  onSelect: (id: number) => void
  onOpenDetail: (id: number) => void
  onCommit: (updater: (project: GanttProject) => GanttProject) => void
  onDelete: (id: number) => void
  dayWidth?: number
}

const LABEL_WIDTH = 240

export function GanttTimeline({ project, selectedTaskId, onSelect, onOpenDetail, onCommit, onDelete, dayWidth = 44 }: Props) {
  const flatTasks = flattenTasks(project.data)
  const timelineDays = buildTimelineDays(project)
  const timelineStart = timelineDays[0]

  if (!timelineStart || !flatTasks.length) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No hay tareas para mostrar.
      </div>
    )
  }

  return (
    <div className="overflow-auto rounded-md border">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `${LABEL_WIDTH}px repeat(${timelineDays.length}, ${dayWidth}px)`,
          minWidth: `${LABEL_WIDTH + timelineDays.length * dayWidth}px`,
        }}
      >
        {/* Header row */}
        <div className="sticky left-0 z-20 border-b bg-card p-2 text-xs font-medium">
          Tarea
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
              {new Intl.DateTimeFormat("es-ES", {
                day: "2-digit",
                month: "2-digit",
              }).format(day)}
            </div>
          )
        })}

        {/* Task rows */}
        {flatTasks.map(({ task, level }) => {
          const left = dayOffset(timelineStart, task.StartDate)
          const isMilestone = task.Duration === 0

          return (
            <div key={task.TaskID} className="contents">
              {/* name cell */}
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onOpenDetail(task.TaskID)}
                    className={`sticky left-0 z-10 flex h-10 min-w-0 items-center border-b bg-card px-3 text-left text-sm ${
                      selectedTaskId === task.TaskID ? "bg-accent" : "hover:bg-muted/40"
                    }`}
                    style={{ paddingLeft: `${12 + level * 12}px` }}
                  >
                    <span className="truncate">{task.TaskName}</span>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    variant="destructive"
                    onSelect={() => onDelete(task.TaskID)}
                  >
                    Borrar tarea
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>

              {/* bar cell */}
              <div
                className="relative h-10 border-b"
                style={{ gridColumn: `2 / span ${timelineDays.length}` }}
              >
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
                  /* Diamond milestone */
                  <div
                    className="absolute top-1/2 -translate-y-1/2 size-4 rotate-45 rounded-sm bg-amber-500"
                    style={{ left: `${left * dayWidth + dayWidth / 2 - 8}px` }}
                    title={`${task.TaskName} (Hito)`}
                  />
                ) : (
                  <GanttBar
                    task={task}
                    timelineStart={timelineStart}
                    dayWidth={dayWidth}
                    selected={selectedTaskId === task.TaskID}
                    onSelect={onSelect}
                    onCommit={onCommit}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
