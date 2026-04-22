import { useEffect, useMemo, useRef, useState } from "react"
import { Download, Link2, Upload, X } from "lucide-react"
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

function App() {
  const isMobile = useIsMobile()
  const DAY_WIDTH = isMobile ? 32 : 44

  const [project, setProject] = useState<GanttProject>(() => {
    const fromUrl = getProjectFromUrl()
    if (fromUrl) return fromUrl
    const fromLocal = getProjectFromLocalStorage()
    if (fromLocal) return fromLocal
    return createDefaultProject()
  })
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState("")
  const [importError, setImportError] = useState("")
  const [projectName, setProjectName] = useState(project.name ?? "")
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleNameChange = (value: string) => {
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
    saveProjectToLocalStorage(project)
    setShareUrl(saveProjectToUrl(project))
  }, [project])

  const handleCommit = (updater: (p: GanttProject) => GanttProject) => {
    setProject(updater)
  }

  const handleDelete = (id: number) => {
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
    if (!selectedTaskId) return
    setProject((current) => ({
      ...current,
      data: updateTaskInTree(current.data, selectedTaskId, (task) => normalizeTask(updater(task))),
    }))
  }

  const handleReorder = (draggedId: number, targetId: number, position: "before" | "after") => {
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
    const nextId = getNextTaskId(project)
    const today = new Date().toISOString()
    const newTask = createTask(nextId, `${t("defaultTaskName")} ${nextId}`, today)
    setProject((current) => ({ ...current, data: addSiblingTask(current.data, newTask) }))
    setSelectedTaskId(nextId)
  }

  const handleNewSubtaskFor = (parentId: number) => {
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
    const a = document.createElement("a")
    a.href = url
    a.download = `gantt-${Date.now()}.gantt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportClick = () => fileInputRef.current?.click()

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const raw = await file.text()
      const imported = projectFromImport(raw)
      setProject({ ...imported, data: imported.data.map(normalizeTask) })
      setProjectName(imported.name ?? "")
      setImportError("")
    } catch {
      setImportError(t("importError"))
    } finally {
      event.target.value = ""
    }
  }

  const handleCopyShareLink = async () => {
    const current = shareUrl || saveProjectToUrl(project)
    try {
      await navigator.clipboard.writeText(current)
    } catch {
      window.prompt(t("sharePrompt"), current)
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
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
            className="absolute inset-0 w-full bg-transparent text-base sm:text-lg font-semibold tracking-tight rounded-sm px-1 border-0 outline-none shadow-none hover:bg-muted/50 focus:bg-accent/40 transition-colors cursor-default focus:cursor-text placeholder:text-foreground"
          />
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Button size="sm" variant="outline" onClick={handleImportClick}>
            <Upload />
            <span className="hidden sm:inline">{t("import")}</span>
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download />
            <span className="hidden sm:inline">{t("export")}</span>
          </Button>
          <Button size="sm" variant="outline" onClick={handleCopyShareLink}>
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
                    onChange={(e) => updateSelectedTask((t) => ({ ...t, TaskName: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t("labelStart")}</label>
                    <Input
                      type="date"
                      value={toDateInput(selectedTask.StartDate)}
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
                  <label className="text-xs font-medium text-muted-foreground">{t("labelDuration")}</label>
                  <Input
                    type="number"
                    min={0}
                    value={selectedTask.Duration}
                    readOnly
                    className="bg-muted/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("labelPredecessor")}</label>
                  <Input
                    value={selectedTask.Predecessor ?? ""}
                    onChange={(e) =>
                      updateSelectedTask((t) => ({ ...t, Predecessor: e.target.value }))
                    }
                    placeholder={t("placeholderPredecessor")}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("labelNotes")}</label>
                  <Textarea
                    value={selectedTask.info}
                    onChange={(e) => updateSelectedTask((t) => ({ ...t, info: e.target.value }))}
                    rows={5}
                    placeholder={t("placeholderNotes")}
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
