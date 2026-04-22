export type DurationUnit = "day"

export interface Resource {
  resourceId: string
  resourceName: string
  unit?: number
}

export interface GanttTask {
  TaskID: number
  TaskName: string
  StartDate: string
  EndDate: string
  Duration: number
  Predecessor: string | null
  resources: Resource[]
  Progress: number
  color: string
  info: string
  DurationUnit: DurationUnit
  subtasks?: GanttTask[]
}

export interface AdvancedColumn {
  name: string
  width: string
  show: boolean
}

export interface AdvancedSettings {
  columns: AdvancedColumn[]
  zoomLevel: number
  timezone: string
  timezoneOffset: number
  dependencyConflict: string
  dateFormat: string
  timeFormat: string
  firstDayOfWeek: number
  workWeek: string[]
  workTime: Array<{ from: number; to: number }>
  holidays: string[]
}

export interface GanttProject {
  data: GanttTask[]
  resources: Resource[]
  projectStartDate: string | null
  projectEndDate: string | null
  advanced: AdvancedSettings
}

export interface FlatTask {
  task: GanttTask
  level: number
}
