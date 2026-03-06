interface QuizAttemptRecord {
  timestamp: string;
  taskId: string;
  taskTitle: string;
  taskKind: "graph" | "open";
  question: string;
  dataModelOrAnswer: string;
  taskElapsedMs?: number;
  taskCompleted?: boolean;
  result: {
    success: boolean;
    message: string;
    failedChecks?: string[];
    passedChecks?: string[];
  };
}

export {};

interface LoadedSession {
  id: string;
  fileName: string;
  exportedAt: string;
  quizName: string;
  personName: string;
  tasks: QuizTask[];
  taskStates: Record<string, QuizTaskSessionState>;
  attempts: QuizAttemptRecord[];
}

interface QuizTask {
  id: string;
  title: string;
  description: string;
}

interface QuizTaskSessionState {
  dataText: string;
  feedback: string;
  elapsedMs?: number;
  isCompleted?: boolean;
}

const SESSION_STORAGE_KEY = "quiz-auswertung:selected-session";

const detailMeta = document.querySelector<HTMLParagraphElement>("#detail-meta");
const tabAblauf = document.querySelector<HTMLButtonElement>("#tab-ablauf");
const tabOverview = document.querySelector<HTMLButtonElement>("#tab-overview");
const panelAblauf = document.querySelector<HTMLElement>("#panel-ablauf");
const panelOverview = document.querySelector<HTMLElement>("#panel-overview");
const timelineBody = document.querySelector<HTMLTableSectionElement>("#timeline-body");
const taskDetails = document.querySelector<HTMLDivElement>("#task-details");
const summaryBody = document.querySelector<HTMLTableSectionElement>("#summary-body");
const kpiAvgAttempts = document.querySelector<HTMLParagraphElement>("#kpi-avg-attempts");
const kpiAvgTime = document.querySelector<HTMLParagraphElement>("#kpi-avg-time");
const kpiTotalTime = document.querySelector<HTMLParagraphElement>("#kpi-total-time");
const detailError = document.querySelector<HTMLParagraphElement>("#detail-error");

if (
  !detailMeta ||
  !tabAblauf ||
  !tabOverview ||
  !panelAblauf ||
  !panelOverview ||
  !timelineBody ||
  !taskDetails ||
  !summaryBody ||
  !kpiAvgAttempts ||
  !kpiAvgTime ||
  !kpiTotalTime ||
  !detailError
) {
  throw new Error("Detailansicht konnte nicht initialisiert werden.");
}

const textCell = (value: string): HTMLTableCellElement => {
  const cell = document.createElement("td");
  cell.textContent = value;
  return cell;
};

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "unbekannt";
  }
  return date.toLocaleString("de-DE");
};

const parseTimestamp = (iso: string): number | null => {
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : null;
};

const formatDuration = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "0s";
  }
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
};

const computeTaskStats = (attempts: QuizAttemptRecord[]) => {
  const byTask = new Map<string, QuizAttemptRecord[]>();
  attempts.forEach((attempt) => {
    const existing = byTask.get(attempt.taskId) ?? [];
    existing.push(attempt);
    byTask.set(attempt.taskId, existing);
  });

  return [...byTask.entries()].map(([taskId, taskAttempts]) => {
    const timestamps = taskAttempts
      .map((entry) => parseTimestamp(entry.timestamp))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    const first = timestamps[0] ?? 0;
    const last = timestamps[timestamps.length - 1] ?? first;
    const latest = taskAttempts[taskAttempts.length - 1]!;

    return {
      taskId,
      title: latest.taskTitle,
      question: latest.question,
      latest,
      attemptsCount: taskAttempts.length,
      finalSuccess: latest.result.success,
      durationMs: Math.max(0, last - first),
      attempts: taskAttempts,
      firstTimestamp: first,
      lastTimestamp: last,
    };
  });
};

const activateTab = (tab: "ablauf" | "overview") => {
  const isAblauf = tab === "ablauf";
  tabAblauf.classList.toggle("is-active", isAblauf);
  tabOverview.classList.toggle("is-active", !isAblauf);
  panelAblauf.hidden = !isAblauf;
  panelOverview.hidden = isAblauf;
};

const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
if (!raw) {
  detailError.hidden = false;
  panelAblauf.hidden = true;
  panelOverview.hidden = true;
} else {
  const session = JSON.parse(raw) as LoadedSession;
  detailMeta.textContent = `${session.fileName} | Quiz: ${session.quizName} | Person: ${session.personName} | Export: ${formatDate(session.exportedAt)}`;

  const attemptsSorted = [...session.attempts].sort((a, b) => {
    const aTime = parseTimestamp(a.timestamp) ?? 0;
    const bTime = parseTimestamp(b.timestamp) ?? 0;
    return aTime - bTime;
  });

  timelineBody.innerHTML = "";
  attemptsSorted.forEach((attempt, index) => {
    const row = document.createElement("tr");
    row.append(
      textCell(String(index + 1)),
      textCell(formatDate(attempt.timestamp)),
      textCell(`${attempt.taskTitle} (${attempt.taskId})`),
      textCell(attempt.result.success ? "✅ erfüllt" : `${attempt.result.message}`),
    );
    timelineBody.append(row);
  });

  const taskStats = computeTaskStats(attemptsSorted);
  const taskStatById = new Map(taskStats.map((entry) => [entry.taskId, entry]));

  const tasksForDisplay = (session.tasks.length > 0
    ? [...session.tasks]
    : [...taskStats].map((entry) => ({ id: entry.taskId, title: entry.title, description: entry.question })))

  const taskDurationsMs = tasksForDisplay.map((task) => {
    const stat = taskStatById.get(task.id);
    const taskState = session.taskStates?.[task.id];
    return typeof taskState?.elapsedMs === "number" ? taskState.elapsedMs : stat?.durationMs ?? 0;
  });

  taskDetails.innerHTML = "";
  tasksForDisplay.forEach((task, displayIndex) => {
    const stat = taskStatById.get(task.id);
    const taskState = session.taskStates?.[task.id];
    const finalAnswer = stat?.latest.dataModelOrAnswer ?? taskState?.dataText ?? "";
    const attemptCount = stat?.attemptsCount ?? 0;
    const durationMs = typeof taskState?.elapsedMs === "number" ? taskState.elapsedMs : stat?.durationMs ?? 0;
    const finalSuccess = stat?.finalSuccess ?? false;
    const finalMessage = stat?.latest.result.message ?? taskState?.feedback ?? "Keine Bewertung gespeichert.";

    const wrapper = document.createElement("article");
    wrapper.className = "task-detail";

    const title = document.createElement("h4");
    title.textContent = `${displayIndex + 1}. Aufgabe: ${task.title} (${task.id})`;
    wrapper.append(title);

    const p1 = document.createElement("p");
    p1.textContent = `1) Aufgabenstellung: ${task.description || stat?.question || "(keine Beschreibung)"}`;
    wrapper.append(p1);

    const p2 = document.createElement("p");
    p2.textContent = "2) Antwort:";
    wrapper.append(p2);

    const pre = document.createElement("pre");
    pre.textContent = finalAnswer || "(leer)";
    wrapper.append(pre);

    const p3 = document.createElement("p");
    p3.textContent = `3) Ergebnis: ${finalSuccess ? "✅ erfüllt" : `❌ ${finalMessage}`}`;
    wrapper.append(p3);

    const p4 = document.createElement("p");
    p4.textContent = `4) Anzahl der Versuche: ${attemptCount}`;
    wrapper.append(p4);

    const p5 = document.createElement("p");
    p5.textContent = `5) Benötigte Zeit für diese Aufgabe: ${formatDuration(durationMs)}`;
    wrapper.append(p5);

    const failedChecks = stat?.attempts.flatMap((entry) => entry.result.failedChecks ?? []) ?? [];
    if (failedChecks.length > 0) {
      const p6 = document.createElement("p");
      p6.textContent = `Fehlchecks: ${failedChecks.join(" | ")}`;
      wrapper.append(p6);
    }

    taskDetails.append(wrapper);
  });

  summaryBody.innerHTML = "";
  tasksForDisplay.forEach((task) => {
    const stat = taskStatById.get(task.id);
    const taskState = session.taskStates?.[task.id];
    const finalAnswer = stat?.latest.dataModelOrAnswer ?? taskState?.dataText ?? "";
    const compactAnswer = finalAnswer.replace(/\s+/g, " ").slice(0, 120);
    const durationMs = typeof taskState?.elapsedMs === "number" ? taskState.elapsedMs : stat?.durationMs ?? 0;
    const row = document.createElement("tr");
    row.append(
      textCell(`${task.title} (${task.id})`),
      textCell(String(stat?.attemptsCount ?? 0)),
      textCell(stat?.finalSuccess ? "✅" : "❌"),
      textCell(formatDuration(durationMs)),
      textCell(compactAnswer.length > 0 ? compactAnswer : "(leer)"),
    );
    summaryBody.append(row);
  });

  const avgAttempts = taskStats.length > 0
    ? taskStats.reduce((sum, stat) => sum + stat.attemptsCount, 0) / taskStats.length
    : 0;
  const avgTime = taskDurationsMs.length > 0
    ? taskDurationsMs.reduce((sum, value) => sum + value, 0) / taskDurationsMs.length
    : 0;

  const allTimes = attemptsSorted
    .map((entry) => parseTimestamp(entry.timestamp))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const totalDuration = allTimes.length > 0 ? Math.max(0, allTimes[allTimes.length - 1]! - allTimes[0]!) : 0;

  kpiAvgAttempts.textContent = avgAttempts.toFixed(2);
  kpiAvgTime.textContent = formatDuration(avgTime);
  kpiTotalTime.textContent = formatDuration(totalDuration);
}

tabAblauf.addEventListener("click", () => activateTab("ablauf"));
tabOverview.addEventListener("click", () => activateTab("overview"));
activateTab("ablauf");

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.body.classList.remove("app-loading");
  });
});
