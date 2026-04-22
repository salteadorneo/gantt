import { useEffect, useMemo, useRef, useState } from "react"
import { Download, FileJson, Link2, Plus, Upload } from "lucide-react"

import { Badge } from "./components/ui/badge"
import { Button } from "./components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card"
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
    if (fromUrl) {
      return fromUrl
    }

    const fromLocal = getProjectFromLocalStorage()
    if (fromLocal) {
      return fromLocal
    }

    return createDefaultProject()
  })
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
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

  const updateSelectedTask = (updater: (task: GanttTask) => GanttTask) => {
    if (!selectedTaskId) {
      return
    }

    setProject((current) => ({
      ...current,
      data: updateTaskInTree(current.data, selectedTaskId, (task) => normalizeTask(updater(task))),
    }))
  }

  const handleNewTask = () => {
    const nextId = getNextTaskId(project)
    const today = new Date().toISOString()
    const newTask = createTask(nextId, `Tarea ${nextId}`, today)

    setProject((current) => ({
      ...current,
      data: addSiblingTask(current.data, newTask),
    }))
    setSelectedTaskId(nextId)
  }

  const handleNewSubtask = () => {
    if (!selectedTaskId) {
      return
    }

    const nextId = getNextTaskId(project)
    const start = selectedTask?.StartDate ?? new Date().toISOString()
    const child = createTask(nextId, `Subtarea ${nextId}`, start)

    setProject((current) => ({
      ...current,
      data: addSubtask(current.data, selectedTaskId, child),
    }))
    setSelectedTaskId(nextId)
  }

  const handleExport = () => {
    const payload = JSON.stringify(project, null, 2)
    const blob = new Blob([payload], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `gantt-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const raw = await file.text()
      const imported = projectFromImport(raw)
      const normalized: GanttProject = {
        ...imported,
        data: imported.data.map(normalizeTask),
      }
      setProject(normalized)
      setImportError("")
    } catch {
      setImportError("No se pudo importar. Verifica que el JSON sea compatible con OnlineGantt.")
    } finally {
      event.target.value = ""
    }
  }

  const handleCopyShareLink = async () => {
    const fallback = saveProjectToUrl(project)
    const current = shareUrl || fallback

    try {
      await navigator.clipboard.writeText(current)
    } catch {
      window.prompt("Copia este enlace:", current)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 md:p-6">
        <Card className="gap-4 py-4">
          <CardHeader className="px-4 md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xl tracking-tight">Gantt URL-first</CardTitle>
                <CardDescription>
                  Frontend puro, compatible con OnlineGantt, sesión persistente en URL y localStorage.
                </CardDescription>
              </div>
              <Badge variant="secondary">Sin backend</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 px-4 md:px-6">
            <Button onClick={handleNewTask}>
              <Plus />
              Nueva tarea
            </Button>
            <Button variant="secondary" onClick={handleNewSubtask}>
              <Plus />
              Nueva subtarea
            </Button>
            <Button variant="outline" onClick={handleImportClick}>
              <Upload />
              Importar JSON
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download />
              Exportar JSON
            </Button>
            <Button variant="outline" onClick={handleCopyShareLink}>
              <Link2 />
              Copiar enlace
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleImportFile}
            />
          </CardContent>
        </Card>

        {importError ? <p className="text-sm text-destructive">{importError}</p> : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          <Card className="gap-3 py-4">
            <CardHeader className="px-4 pb-2 md:px-6">
              <CardTitle>Lista de tareas</CardTitle>
              <CardDescription>Vista simple de estructura y edición rápida.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 px-4 md:px-6">
              <div className="max-h-[320px] overflow-auto rounded-md border">
                {flatTasks.map(({ task, level }) => (
                  <button
                    key={task.TaskID}
                    type="button"
                    onClick={() => setSelectedTaskId(task.TaskID)}
                    className={`flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 ${
                      selectedTaskId === task.TaskID ? "bg-accent" : "hover:bg-muted/50"
                    }`}
                  >
                    <span style={{ paddingLeft: `${level * 14}px` }} className="truncate">
                      {task.TaskName}
                    </span>
                    <Badge variant="outline">{task.Progress}%</Badge>
                  </button>
                ))}
              </div>

              <Separator />

              {selectedTask ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileJson className="size-4" />
                    TaskID {selectedTask.TaskID}
                  </div>
                  <Input
                    value={selectedTask.TaskName}
                    onChange={(event) =>
                      updateSelectedTask((task) => ({ ...task, TaskName: event.target.value }))
                    }
                    placeholder="Nombre"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={toDateInput(selectedTask.StartDate)}
                      onChange={(event) => {
                        const nextStart = fromDateInput(event.target.value)
                        updateSelectedTask((task) => ({ ...task, StartDate: nextStart }))
                      }}
                    />
                    <Input
                      type="date"
                      value={toDateInput(selectedTask.EndDate)}
                      onChange={(event) => {
                        const nextEnd = fromDateInput(event.target.value)
                        updateSelectedTask((task) => ({ ...task, EndDate: nextEnd }))
                      }}
                    />
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={selectedTask.Progress}
                    onChange={(event) => {
                      const raw = Number(event.target.value)
                      const safe = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0
                      updateSelectedTask((task) => ({ ...task, Progress: safe }))
                    }}
                    placeholder="Progreso"
                  />
                  <Input
                    value={selectedTask.Predecessor ?? ""}
                    onChange={(event) =>
                      updateSelectedTask((task) => ({ ...task, Predecessor: event.target.value }))
                    }
                    placeholder="Predecessor (ej: 2FS)"
                  />
                  <Textarea
                    value={selectedTask.info}
                    onChange={(event) =>
                      updateSelectedTask((task) => ({ ...task, info: event.target.value }))
                    }
                    placeholder="Info HTML"
                    rows={4}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Selecciona una tarea para editar.</p>
              )}
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader className="px-4 pb-2 md:px-6">
              <CardTitle>Timeline</CardTitle>
              <CardDescription>Arrastra para mover o redimensionar tareas. Comparte el enlace.</CardDescription>
            </CardHeader>
            <CardContent className="px-4 md:px-6">
              <GanttTimeline
                project={project}
                selectedTaskId={selectedTaskId}
                onSelect={setSelectedTaskId}
                onCommit={handleCommit}
                dayWidth={DAY_WIDTH}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default App
