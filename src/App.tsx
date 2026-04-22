import { useEffect, useMemo, useRef, useState } from "react"
import { Download, Link2, Plus, Upload, X } from "lucide-react"

import { Button } from "./components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "./components/ui/drawer"
import { Input } from "./components/ui/input"
import { Separator } from "./components/ui/separator"
import { Textarea } from "./components/ui/textarea"
import { GanttTimeline } from "./components/GanttTimeline"
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
  saveProjectToLocalStorage,
  saveProjectToUrl,
  toDateInput,
  updateTaskInTree,
} from "./lib/gantt"
import type { GanttProject, GanttTask } from "./types/gantt"

const DAY_WIDTH = 44

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
    info: "<p><br></p>",
    DurationUnit: "day",
  }
}

function App() {
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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

  const handleSelect = (id: number) => {
    setSelectedTaskId(id)
    setDrawerOpen(true)
  }

  const handleNewTask = () => {
    const nextId = getNextTaskId(project)
    const today = new Date().toISOString()
    const newTask = createTask(nextId, `Tarea ${nextId}`, today)
    setProject((current) => ({ ...current, data: addSiblingTask(current.data, newTask) }))
    setSelectedTaskId(nextId)
    setDrawerOpen(true)
  }

  const handleNewSubtask = () => {
    if (!selectedTaskId) return
    const nextId = getNextTaskId(project)
    const start = selectedTask?.StartDate ?? new Date().toISOString()
    const child = createTask(nextId, `Subtarea ${nextId}`, start)
    setProject((current) => ({ ...current, data: addSubtask(current.data, selectedTaskId, child) }))
    setSelectedTaskId(nextId)
    setDrawerOpen(true)
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
      setImportError("")
    } catch {
      setImportError("No se pudo importar. Verifica que el JSON sea compatible con OnlineGantt.")
    } finally {
      event.target.value = ""
    }
  }

  const handleCopyShareLink = async () => {
    const current = shareUrl || saveProjectToUrl(project)
    try {
      await navigator.clipboard.writeText(current)
    } catch {
      window.prompt("Copia este enlace:", current)
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Toolbar */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-4 py-2">
        <span className="mr-2 text-sm font-semibold tracking-tight">Gantt</span>
        <Separator orientation="vertical" className="h-5" />
        <Button size="sm" onClick={handleNewTask}>
          <Plus />
          Nueva tarea
        </Button>
        <Button size="sm" variant="secondary" onClick={handleNewSubtask} disabled={!selectedTaskId}>
          <Plus />
          Subtarea
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <Button size="sm" variant="outline" onClick={handleImportClick}>
          <Upload />
          Importar
        </Button>
        <Button size="sm" variant="outline" onClick={handleExport}>
          <Download />
          Exportar
        </Button>
        <Button size="sm" variant="outline" onClick={handleCopyShareLink}>
          <Link2 />
          Compartir
        </Button>
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
          onCommit={handleCommit}
          onDelete={handleDelete}
          dayWidth={DAY_WIDTH}
        />
      </main>

      {/* Drawer de detalles por la derecha */}
      <Drawer direction="right" open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader className="border-b">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <DrawerTitle className="truncate">
                  Tarea
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
                  <label className="text-xs font-medium text-muted-foreground">Nombre</label>
                  <Input
                    value={selectedTask.TaskName}
                    onChange={(e) => updateSelectedTask((t) => ({ ...t, TaskName: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Inicio</label>
                    <Input
                      type="date"
                      value={toDateInput(selectedTask.StartDate)}
                      onChange={(e) =>
                        updateSelectedTask((t) => ({ ...t, StartDate: fromDateInput(e.target.value) }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Fin</label>
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
                    Progreso — {selectedTask.Progress}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={selectedTask.Progress}
                    onChange={(e) => {
                      const safe = Math.max(0, Math.min(100, Number(e.target.value)))
                      updateSelectedTask((t) => ({ ...t, Progress: safe }))
                    }}
                    className="w-full accent-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Duración (días)</label>
                  <Input
                    type="number"
                    min={0}
                    value={selectedTask.Duration}
                    readOnly
                    className="bg-muted/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Predecesor</label>
                  <Input
                    value={selectedTask.Predecessor ?? ""}
                    onChange={(e) =>
                      updateSelectedTask((t) => ({ ...t, Predecessor: e.target.value }))
                    }
                    placeholder="ej: 2FS"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Notas</label>
                  <Textarea
                    value={selectedTask.info}
                    onChange={(e) => updateSelectedTask((t) => ({ ...t, info: e.target.value }))}
                    rows={5}
                    placeholder="Notas (HTML)"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              Selecciona una tarea para editar.
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  )
}

export default App
