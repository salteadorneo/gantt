import type { FlatTask, GanttProject, GanttTask } from "../types/gantt"
import { t } from "./i18n"

const URL_PARAM = "g"
const LOCAL_STORAGE_KEY = "gantt_session_v1"

export const DAY_MS = 24 * 60 * 60 * 1000

export function createDefaultProject(): GanttProject {
  return {
    data: [
      {
        TaskID: 1,
        TaskName: t("defaultProjectName"),
        StartDate: "2026-04-20T06:00:00.000Z",
        EndDate: "2026-04-24T15:00:00.000Z",
        Duration: 5,
        Predecessor: null,
        resources: [],
        Progress: 40,
        color: "",
        info: "",
        DurationUnit: "day",
        subtasks: [
          {
            TaskID: 2,
            TaskName: t("defaultBaseTask"),
            StartDate: "2026-04-20T06:00:00.000Z",
            EndDate: "2026-04-22T15:00:00.000Z",
            Duration: 3,
            Predecessor: "",
            resources: [],
            Progress: 60,
            color: "121",
            info: "",
            DurationUnit: "day",
          },
        ],
      },
    ],
    resources: [],
    projectStartDate: null,
    projectEndDate: null,
    advanced: {
      columns: [
        { name: "Task ID", width: "70", show: true },
        { name: "Task Name", width: "350", show: true },
        { name: "Start Date", width: "130", show: false },
        { name: "End Date", width: "130", show: false },
        { name: "Duration", width: "130", show: false },
        { name: "Progress %", width: "150", show: false },
        { name: "Dependency", width: "150", show: false },
        { name: "Resources", width: "200", show: false },
        { name: "Color", width: "100", show: false },
      ],
      zoomLevel: 0,
      timezone: "Europe/Madrid",
      timezoneOffset: -120,
      dependencyConflict: "Add Offset to Dependency",
      dateFormat: "yyyy-MM-dd",
      timeFormat: "HH:mm",
      firstDayOfWeek: 0,
      workWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      workTime: [
        { from: 8, to: 12 },
        { from: 13, to: 17 },
      ],
      holidays: [],
    },
  }
}

export function flattenTasks(tasks: GanttTask[], level = 0): FlatTask[] {
  return tasks.flatMap((task) => {
    const row: FlatTask = { task, level }
    const childRows = task.subtasks?.length ? flattenTasks(task.subtasks, level + 1) : []
    return [row, ...childRows]
  })
}

export function projectFromImport(raw: string): GanttProject {
  const parsed = JSON.parse(raw)

  if (!parsed || !Array.isArray(parsed.data) || !Array.isArray(parsed.resources) || !parsed.advanced) {
    throw new Error(t("importFormatError"))
  }

  return parsed as GanttProject
}

export function getNextTaskId(project: GanttProject): number {
  const all = flattenTasks(project.data)
  const maxId = all.reduce((acc, item) => Math.max(acc, item.task.TaskID), 0)
  return maxId + 1
}

export function toDateInput(iso: string): string {
  const date = new Date(iso)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function fromDateInput(value: string): string {
  return new Date(`${value}T08:00:00.000Z`).toISOString()
}

export function calculateDuration(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  return Math.max(0, Math.round((end - start) / DAY_MS) + 1)
}

export function normalizeTask(task: GanttTask): GanttTask {
  const duration = calculateDuration(task.StartDate, task.EndDate)
  return {
    ...task,
    Duration: duration,
    DurationUnit: "day",
    subtasks: task.subtasks?.map(normalizeTask),
  }
}

export function updateTaskInTree(
  tasks: GanttTask[],
  targetId: number,
  update: (task: GanttTask) => GanttTask,
): GanttTask[] {
  return tasks.map((task) => {
    if (task.TaskID === targetId) {
      return update(task)
    }

    if (task.subtasks?.length) {
      return {
        ...task,
        subtasks: updateTaskInTree(task.subtasks, targetId, update),
      }
    }

    return task
  })
}

export function removeTaskFromTree(tasks: GanttTask[], targetId: number): GanttTask[] {
  return tasks
    .filter((task) => task.TaskID !== targetId)
    .map((task) =>
      task.subtasks?.length
        ? { ...task, subtasks: removeTaskFromTree(task.subtasks, targetId) }
        : task,
    )
}

export function addSiblingTask(tasks: GanttTask[], newTask: GanttTask): GanttTask[] {
  return [...tasks, newTask]
}

export function reorderTasksInTree(
  tasks: GanttTask[],
  draggedId: number,
  targetId: number,
  position: "before" | "after",
): GanttTask[] {
  const draggedIdx = tasks.findIndex((t) => t.TaskID === draggedId)
  const targetIdx = tasks.findIndex((t) => t.TaskID === targetId)

  if (draggedIdx !== -1 && targetIdx !== -1) {
    const result = [...tasks]
    const [dragged] = result.splice(draggedIdx, 1)
    const adjustedTarget = targetIdx > draggedIdx ? targetIdx - 1 : targetIdx
    result.splice(position === "before" ? adjustedTarget : adjustedTarget + 1, 0, dragged)
    return result
  }

  return tasks.map((task) =>
    task.subtasks?.length
      ? { ...task, subtasks: reorderTasksInTree(task.subtasks, draggedId, targetId, position) }
      : task,
  )
}

export function addSubtask(tasks: GanttTask[], parentId: number, child: GanttTask): GanttTask[] {
  return tasks.map((task) => {
    if (task.TaskID === parentId) {
      return {
        ...task,
        subtasks: [...(task.subtasks ?? []), child],
      }
    }

    if (task.subtasks?.length) {
      return {
        ...task,
        subtasks: addSubtask(task.subtasks, parentId, child),
      }
    }

    return task
  })
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
  const normalized = padded + "===".slice((padded.length + 3) % 4)
  const binary = atob(normalized)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function getProjectFromUrl(): GanttProject | null {
  const url = new URL(window.location.href)
  const encoded = url.searchParams.get(URL_PARAM)
  if (!encoded) {
    return null
  }

  try {
    return projectFromImport(decodeBase64Url(encoded))
  } catch {
    return null
  }
}

export function saveProjectToUrl(project: GanttProject): string {
  const json = JSON.stringify(project)
  const encoded = encodeBase64Url(json)
  const url = new URL(window.location.href)
  url.searchParams.set(URL_PARAM, encoded)
  window.history.replaceState({}, "", url)
  return url.toString()
}

export function getProjectFromLocalStorage(): GanttProject | null {
  const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return projectFromImport(raw)
  } catch {
    return null
  }
}

export function saveProjectToLocalStorage(project: GanttProject): void {
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(project))
}

export function buildTimelineDays(project: GanttProject): Date[] {
  const flat = flattenTasks(project.data)
  if (!flat.length) {
    return []
  }

  const startMs = Math.min(...flat.map((item) => new Date(item.task.StartDate).getTime()))
  const endMs = Math.max(...flat.map((item) => new Date(item.task.EndDate).getTime()))

  const days: Date[] = []
  for (let cursor = startMs; cursor <= endMs; cursor += DAY_MS) {
    days.push(new Date(cursor))
  }

  return days
}

export function dayOffset(projectStart: Date, taskStartIso: string): number {
  return Math.max(0, Math.round((new Date(taskStartIso).getTime() - projectStart.getTime()) / DAY_MS))
}
