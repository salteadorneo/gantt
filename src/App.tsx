import { useEffect, useMemo, useRef, useState } from "react"
import { Download, Link2, Upload, X } from "lucide-react"
import { version } from "../package.json"
import { Button } from "./components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "./components/ui/drawer"
import { Input } from "./components/ui/input"
import { Textarea } from "./components/ui/textarea"
import { GanttTimeline } from "./components/GanttTimeline"
import { t } from "./lib/i18n"
import {
  addSiblingTask,
  addSubtask,
  createDefaultProject,
  flattenTasks,
  fromDateInput,
  getNextTaskId,
  getProjectFromLocalStorage,
  getProjectFromUrl,
  normalizeTask,
  projectFromImport,
  removeTaskFromTree,
  reorderTasksInTree,
  saveProjectToLocalStorage,
  saveProjectToUrl,
  toDateInput,
  updateTaskInTree,
} from "./lib/gantt"
import type { GanttProject, GanttTask } from "./types/gantt"

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return isMobile
}

function createTask(taskId: number, label: string, startDateIso: string): GanttTask {
  return {
    TaskID: taskId,
    TaskName: label,
    StartDate: startDateIso,
    EndDate: startDateIso,
    Duration: 1,
    Predecessor: "",
    resources: [],
    Progress: 0,
    color: "",
    info: "",
    DurationUnit: "day",
  }
}

function normalizeExportFileName(value: string): string {
  const withoutAccents = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
  const normalized = withoutAccents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return normalized || "gantt"
}

function App() {
  const isMobile = useIsMobile()
  const DAY_WIDTH = isMobile ? 32 : 44
  const sharedProject = useMemo(() => getProjectFromUrl(), [])
  const isSharedReadOnly = sharedProject !== null

  const [project, setProject] = useState<GanttProject>(() => {
    if (sharedProject) return sharedProject
    const fromLocal = getProjectFromLocalStorage()
    if (fromLocal) return fromLocal
    return createDefaultProject()
  })
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [toastError, setToastError] = useState("")
  const [importError, setImportError] = useState("")
  const [projectName, setProjectName] = useState(project.name ?? "")
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragCounterRef = useRef(0)

  const handleNameChange = (value: string) => {
    if (isSharedReadOnly) return
    setProjectName(value)
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current)
    nameTimerRef.current = setTimeout(() => {
      setProject((p) => ({ ...p, name: value }))
    }, 400)
  }

  const flatTasks = useMemo(() => flattenTasks(project.data), [project])

  const selectedTask = useMemo(
    () => flatTasks.find((row) => row.task.TaskID === selectedTaskId)?.task ?? null,
    [flatTasks, selectedTaskId],
  )

  useEffect(() => {
    if (!flatTasks.length) {
      setSelectedTaskId(null)
      return
    }
    if (!selectedTaskId || !flatTasks.some((row) => row.task.TaskID === selectedTaskId)) {
      setSelectedTaskId(flatTasks[0].task.TaskID)
    }
  }, [flatTasks, selectedTaskId])

  useEffect(() => {
    if (isSharedReadOnly) return
    saveProjectToLocalStorage(project)
  }, [project, isSharedReadOnly])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const showImportToastError = (message: string) => {
    setToastError(message)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setToastError("")
    }, 3000)
  }

  const importGanttFile = async (file: File): Promise<boolean> => {
    if (isSharedReadOnly) {
      showImportToastError(t("readOnlyView"))
      return false
    }
    const isValidExtension = file.name.toLowerCase().endsWith(".gantt")
    if (!isValidExtension) {
      showImportToastError(t("invalidGanttFile"))
      return false
    }

    try {
      const raw = await file.text()
      const imported = projectFromImport(raw)
      setProject({ ...imported, data: imported.data.map(normalizeTask) })
      setProjectName(imported.name ?? "")
      setImportError("")
      return true
    } catch {
      showImportToastError(t("importError"))
      return false
    }
  }

  const handleCommit = (updater: (p: GanttProject) => GanttProject) => {
    if (isSharedReadOnly) return
    setProject(updater)
  }

  const handleDelete = (id: number) => {
    if (isSharedReadOnly) return
    setProject((current) => ({
      ...current,
      data: removeTaskFromTree(current.data, id),
    }))
    if (selectedTaskId === id) {
      setSelectedTaskId(null)
      setDrawerOpen(false)
    }
  }

  const updateSelectedTask = (updater: (task: GanttTask) => GanttTask) => {
    if (isSharedReadOnly) return
    if (!selectedTaskId) return
    setProject((current) => ({
      ...current,
      data: updateTaskInTree(current.data, selectedTaskId, (task) => normalizeTask(updater(task))),
    }))
  }

  const handleReorder = (draggedId: number, targetId: number, position: "before" | "after") => {
    if (isSharedReadOnly) return
    setProject((current) => ({
      ...current,
      data: reorderTasksInTree(current.data, draggedId, targetId, position),
    }))
  }

  const handleSelect = (id: number) => {
    setSelectedTaskId(id)
    setDrawerOpen(true)
  }

  const handleNewTask = () => {
    if (isSharedReadOnly) return
    const nextId = getNextTaskId(project)
    const today = new Date().toISOString()
    const newTask = createTask(nextId, `${t("defaultTaskName")} ${nextId}`, today)
    setProject((current) => ({ ...current, data: addSiblingTask(current.data, newTask) }))
    setSelectedTaskId(nextId)
  }

  const handleNewSubtaskFor = (parentId: number) => {
    if (isSharedReadOnly) return
    const nextId = getNextTaskId(project)
    const parent = flatTasks.find((row) => row.task.TaskID === parentId)?.task
    const start = parent?.StartDate ?? new Date().toISOString()
    const child = createTask(nextId, `${t("defaultSubtaskName")} ${nextId}`, start)
    setProject((current) => ({ ...current, data: addSubtask(current.data, parentId, child) }))
    setSelectedTaskId(nextId)
  }

  const handleExport = () => {
    const payload = JSON.stringify(project, null, 2)
    const blob = new Blob([payload], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const exportName = normalizeExportFileName(projectName || project.name || t("appTitle"))
    const a = document.createElement("a")
    a.href = url
    a.download = `${exportName}.gantt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportClick = () => fileInputRef.current?.click()

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const imported = await importGanttFile(file)
    if (!imported) {
      setImportError(t("importError"))
    }
    event.target.value = ""
  }

  const handleShare = async () => {
    const url = saveProjectToUrl(project)
    if (navigator.share) {
      try {
        await navigator.share({ url, title: project.name })
      } catch {
        // user cancelled — do nothing
      }
    } else {
      try {
        await navigator.clipboard.writeText(url)
      } catch {
        window.prompt(t("sharePrompt"), url)
      }
    }
  }

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    dragCounterRef.current += 1
    setIsDraggingFile(true)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) {
      setIsDraggingFile(false)
    }
  }

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    dragCounterRef.current = 0
    setIsDraggingFile(false)

    const file = event.dataTransfer.files?.[0]
    if (!file) return
    await importGanttFile(file)
  }

  return (
    <div
      className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFile && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
          <div className="rounded-lg border border-primary/40 bg-card px-6 py-4 text-sm font-medium text-foreground shadow-lg">
            {t("dropToImport")}
          </div>
        </div>
      )}

      {toastError && (
        <div className="pointer-events-none absolute bottom-4 right-4 z-50 max-w-sm rounded-md border border-destructive/30 bg-card px-4 py-3 text-sm text-destructive shadow-lg">
          {toastError}
        </div>
      )}

      {/* Toolbar */}
      <header className="flex shrink-0 items-center gap-1.5 border-b bg-card px-3 py-2 sm:gap-2 sm:px-4">
        <div className="relative mr-1 sm:mr-2 shrink-0">
          <span aria-hidden className="invisible block whitespace-pre text-base sm:text-lg font-semibold tracking-tight px-1 min-w-10">
            {projectName || t("appTitle")}
          </span>
          <input
            type="text"
            value={projectName}
            placeholder={t("appTitle")}
            onChange={(e) => handleNameChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            readOnly={isSharedReadOnly}
            className="absolute inset-0 w-full bg-transparent text-base sm:text-lg font-semibold tracking-tight rounded-sm px-1 border-0 outline-none shadow-none hover:bg-muted/50 focus:bg-accent/40 transition-colors cursor-default focus:cursor-text placeholder:text-foreground"
          />
        </div>
        {isSharedReadOnly && (
          <span className="text-xs rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-700">
            {t("readOnlySharedView")}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Button size="sm" variant="outline" onClick={handleImportClick} disabled={isSharedReadOnly}>
            <Upload />
            <span className="hidden sm:inline">{t("import")}</span>
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download />
            <span className="hidden sm:inline">{t("export")}</span>
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={handleShare}
            className="border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"
          >
            <Link2 />
            <span className="hidden sm:inline">{t("share")}</span>
          </Button>
        </div>
        <input ref={fileInputRef} type="file" accept=".gantt" className="hidden" onChange={handleImportFile} />
        {importError && <span className="text-xs text-destructive">{importError}</span>}
      </header>

      {/* Timeline full-screen */}
      <main className="min-h-0 flex-1 overflow-hidden">
        <GanttTimeline
          project={project}
          readOnly={isSharedReadOnly}
          selectedTaskId={selectedTaskId}
          onSelect={setSelectedTaskId}
          onOpenDetail={handleSelect}
          onCreateTask={handleNewTask}
          onCreateSubtask={handleNewSubtaskFor}
          onCommit={handleCommit}
          onDelete={handleDelete}
          onReorder={handleReorder}
          dayWidth={DAY_WIDTH}
        />
      </main>

      {/* Drawer de detalles */}
      <span className="pointer-events-none fixed bottom-2 right-3 z-40 text-[10px] text-muted-foreground/50 select-none">
        v{version}
      </span>

      <Drawer direction={isMobile ? "bottom" : "right"} open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader className="border-b">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <DrawerTitle className="truncate">
                  {t("drawerTitle")}
                </DrawerTitle>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <X />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          {selectedTask ? (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("labelName")}</label>
                  <Input
                    value={selectedTask.TaskName}
                    disabled={isSharedReadOnly}
                    onChange={(e) => updateSelectedTask((t) => ({ ...t, TaskName: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t("labelStart")}</label>
                    <Input
                      type="date"
                      value={toDateInput(selectedTask.StartDate)}
                      disabled={isSharedReadOnly}
                      onChange={(e) =>
                        updateSelectedTask((t) => ({ ...t, StartDate: fromDateInput(e.target.value) }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t("labelEnd")}</label>
                    <Input
                      type="date"
                      value={toDateInput(selectedTask.EndDate)}
                      disabled={isSharedReadOnly}
                      onChange={(e) =>
                        updateSelectedTask((t) => ({ ...t, EndDate: fromDateInput(e.target.value) }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("labelProgress")} — {selectedTask.Progress}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={selectedTask.Progress}
                    disabled={isSharedReadOnly}
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onMouseDownCapture={(e) => e.stopPropagation()}
                    onTouchStartCapture={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const safe = Math.max(0, Math.min(100, Number(e.target.value)))
                      updateSelectedTask((t) => ({ ...t, Progress: safe }))
                    }}
                    className="w-full accent-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("labelNotes")}</label>
                  <Textarea
                    value={selectedTask.info}
                    disabled={isSharedReadOnly}
                    onChange={(e) => updateSelectedTask((t) => ({ ...t, info: e.target.value }))}
                    rows={5}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              {t("selectTaskToEdit")}
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  )
}

export default App
