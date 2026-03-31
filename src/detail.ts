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
let attemptDetailSection = document.querySelector<HTMLElement>("#attempt-detail-section");
let attemptDetail = document.querySelector<HTMLElement>("#attempt-detail");
const taskDetails = document.querySelector<HTMLDivElement>("#task-details");
const summaryBody = document.querySelector<HTMLTableSectionElement>("#summary-body");
const kpiAvgAttempts = document.querySelector<HTMLParagraphElement>("#kpi-avg-attempts");
const kpiAvgTime = document.querySelector<HTMLParagraphElement>("#kpi-avg-time");
const kpiTotalTime = document.querySelector<HTMLParagraphElement>("#kpi-total-time");
const detailError = document.querySelector<HTMLParagraphElement>("#detail-error");

const revealLayout = (): void => {
  document.body.classList.remove("app-loading");
};

const ensureAttemptDetailElements = (): void => {
  if (attemptDetailSection && attemptDetail) {
    return;
  }
  if (!panelAblauf || !taskDetails) {
    return;
  }

  const section = document.createElement("section");
  section.id = "attempt-detail-section";
  section.hidden = true;

  const heading = document.createElement("h2");
  heading.textContent = "Ausgewählter Versuch";
  const article = document.createElement("article");
  article.id = "attempt-detail";
  article.className = "task-detail";

  section.append(heading, article);
  panelAblauf.insertBefore(section, taskDetails);

  attemptDetailSection = section;
  attemptDetail = article;
};

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
  revealLayout();
  throw new Error("Detailansicht konnte nicht initialisiert werden.");
}

ensureAttemptDetailElements();

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

const isKpiRelevantAttempt = (attempt: QuizAttemptRecord): boolean => attempt.taskKind !== "open";

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

const formatAttemptDuration = (milliseconds: number | undefined): string => {
  if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds) || milliseconds < 0) {
    return "-";
  }
  return formatDuration(milliseconds);
};

const buildAttemptDurationMap = (attempts: QuizAttemptRecord[]): Map<QuizAttemptRecord, number | undefined> => {
  const durations = new Map<QuizAttemptRecord, number | undefined>();
  const previousElapsedByTask = new Map<string, number>();

  attempts.forEach((attempt) => {
    if (typeof attempt.taskElapsedMs !== "number" || !Number.isFinite(attempt.taskElapsedMs) || attempt.taskElapsedMs < 0) {
      durations.set(attempt, undefined);
      return;
    }

    const previous = previousElapsedByTask.get(attempt.taskId);
    const delta = previous !== undefined && attempt.taskElapsedMs >= previous
      ? attempt.taskElapsedMs - previous
      : attempt.taskElapsedMs;

    previousElapsedByTask.set(attempt.taskId, attempt.taskElapsedMs);
    durations.set(attempt, delta);
  });

  return durations;
};

const clearSelectedTimelineRows = (rows: HTMLTableRowElement[]): void => {
  rows.forEach((row) => row.classList.remove("is-selected"));
};

const setSelectedTimelineRow = (rows: HTMLTableRowElement[], selected: HTMLTableRowElement): void => {
  clearSelectedTimelineRows(rows);
  selected.classList.add("is-selected");
};

const renderNoAttemptSelected = (): void => {
  if (!attemptDetailSection || !attemptDetail) {
    return;
  }
  attemptDetailSection.hidden = true;
  attemptDetail.innerHTML = "";
};

const renderAttemptDetail = (attempt: QuizAttemptRecord, attemptDurationMs: number | undefined): void => {
  if (!attemptDetailSection || !attemptDetail) {
    return;
  }
  attemptDetailSection.hidden = false;
  attemptDetail.innerHTML = "";

  const meta = document.createElement("p");
  meta.textContent = `${formatDate(attempt.timestamp)} | ${attempt.taskTitle} (${attempt.taskId})`;

  const result = document.createElement("p");
  result.textContent = `Ergebnis: ${attempt.result.success ? "✅ erfüllt" : `${attempt.result.message}`}`;

  const duration = document.createElement("p");
  duration.textContent = `Dauer dieses Versuchs: ${formatAttemptDuration(attemptDurationMs)}`;

  const answerTitle = document.createElement("p");
  answerTitle.textContent = "Antwort:";

  const pre = document.createElement("pre");
  pre.textContent = attempt.dataModelOrAnswer || "(leer)";

  attemptDetail.append(meta, result, duration, answerTitle, pre);

  const failedChecks = attempt.result.failedChecks ?? [];
  if (failedChecks.length > 0) {
    const failed = document.createElement("p");
    failed.textContent = `Fehlchecks: ${failedChecks.join(" | ")}`;
    attemptDetail.append(failed);
  }

  const passedChecks = attempt.result.passedChecks ?? [];
  if (passedChecks.length > 0) {
    const passed = document.createElement("p");
    passed.textContent = `Bestandene Checks: ${passedChecks.join(" | ")}`;
    attemptDetail.append(passed);
  }
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
const showDetailError = (message: string): void => {
  detailError.textContent = message;
  detailError.hidden = false;
  panelAblauf.hidden = true;
  panelOverview.hidden = true;
};

try {
  if (!raw) {
    showDetailError("Kein Durchlauf ausgewählt.");
  } else {
    const session = JSON.parse(raw) as LoadedSession;
  detailMeta.textContent = `${session.fileName} | Quiz: ${session.quizName} | Person: ${session.personName} | Export: ${formatDate(session.exportedAt)}`;

  const attemptsSorted = [...session.attempts].sort((a, b) => {
    const aTime = parseTimestamp(a.timestamp) ?? 0;
    const bTime = parseTimestamp(b.timestamp) ?? 0;
    return aTime - bTime;
  });
  const attemptDurationByAttempt = buildAttemptDurationMap(attemptsSorted);

  timelineBody.innerHTML = "";
  const timelineRows: HTMLTableRowElement[] = [];
  attemptsSorted.forEach((attempt, index) => {
    const row = document.createElement("tr");
    row.classList.add("is-clickable");
    row.tabIndex = 0;
    row.append(
      textCell(String(index + 1)),
      textCell(formatDate(attempt.timestamp)),
      textCell(`${attempt.taskTitle} (${attempt.taskId})`),
      textCell(attempt.result.success ? "✅ erfüllt" : `${attempt.result.message}`),
      textCell(formatAttemptDuration(attemptDurationByAttempt.get(attempt))),
    );
    row.addEventListener("click", () => {
      try {
        if (row.classList.contains("is-selected")) {
          clearSelectedTimelineRows(timelineRows);
          renderNoAttemptSelected();
          return;
        }
        setSelectedTimelineRow(timelineRows, row);
        renderAttemptDetail(attempt, attemptDurationByAttempt.get(attempt));
      } catch {
        renderNoAttemptSelected();
      }
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      if (row.classList.contains("is-selected")) {
        clearSelectedTimelineRows(timelineRows);
        renderNoAttemptSelected();
        return;
      }
      setSelectedTimelineRow(timelineRows, row);
      renderAttemptDetail(attempt, attemptDurationByAttempt.get(attempt));
    });
    timelineRows.push(row);
    timelineBody.append(row);
  });

  if (attemptsSorted.length > 0) {
    renderNoAttemptSelected();
  } else {
    renderNoAttemptSelected();
  }

  const taskStats = computeTaskStats(attemptsSorted);
  const taskStatById = new Map(taskStats.map((entry) => [entry.taskId, entry]));

  const tasksForDisplay = (session.tasks.length > 0
    ? [...session.tasks]
    : [...taskStats].map((entry) => ({ id: entry.taskId, title: entry.title, description: entry.question })))

  const taskDurationsMsByTaskId = new Map<string, number>();
  tasksForDisplay.forEach((task) => {
    const stat = taskStatById.get(task.id);
    const taskState = session.taskStates?.[task.id];
    const durationMs = typeof taskState?.elapsedMs === "number" ? taskState.elapsedMs : stat?.durationMs ?? 0;
    taskDurationsMsByTaskId.set(task.id, durationMs);
  });

  const attemptedTaskIds = new Set(taskStats.filter((stat) => stat.attemptsCount > 0).map((stat) => stat.taskId));
  const attemptedTaskDurationsMs = [...attemptedTaskIds].map((taskId) => taskDurationsMsByTaskId.get(taskId) ?? 0);
  const attemptedTasksForDetail = tasksForDisplay.filter((task) => attemptedTaskIds.has(task.id));

  taskDetails.innerHTML = "";
  attemptedTasksForDetail.forEach((task, displayIndex) => {
    const stat = taskStatById.get(task.id);
    const taskState = session.taskStates?.[task.id];
    const finalAnswer = stat?.latest.dataModelOrAnswer ?? taskState?.dataText ?? "";
    const attemptCount = stat?.attemptsCount ?? 0;
    const durationMs = taskDurationsMsByTaskId.get(task.id) ?? 0;
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

  if (attemptedTasksForDetail.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status";
    empty.textContent = "Keine abgegebenen Versuche vorhanden.";
    taskDetails.append(empty);
  }

  summaryBody.innerHTML = "";
  tasksForDisplay.forEach((task) => {
    const stat = taskStatById.get(task.id);
    const taskState = session.taskStates?.[task.id];
    const finalAnswer = stat?.latest.dataModelOrAnswer ?? taskState?.dataText ?? "";
    const durationMs = taskDurationsMsByTaskId.get(task.id) ?? 0;
    const row = document.createElement("tr");
    const answerCell = document.createElement("td");
    const answerDetails = document.createElement("details");
    answerDetails.className = "answer-details";
    const answerSummary = document.createElement("summary");
    answerSummary.textContent = "Antwort anzeigen";
    const answerPre = document.createElement("pre");
    answerPre.textContent = finalAnswer || "(leer)";
    answerDetails.append(answerSummary, answerPre);
    answerCell.append(answerDetails);
    row.append(
      textCell(`${task.title} (${task.id})`),
      textCell(String(stat?.attemptsCount ?? 0)),
      textCell(stat?.finalSuccess ? "✅" : "❌"),
      textCell(formatDuration(durationMs)),
      answerCell,
    );
    summaryBody.append(row);
  });

  const kpiAttemptsSorted = attemptsSorted.filter(isKpiRelevantAttempt);
  const kpiTaskStats = computeTaskStats(kpiAttemptsSorted);
  const kpiTaskIds = new Set(kpiTaskStats.map((stat) => stat.taskId));
  const kpiTaskDurationsMs = [...kpiTaskIds].map((taskId) => taskDurationsMsByTaskId.get(taskId) ?? 0);

  const avgAttempts = kpiTaskStats.length > 0
    ? kpiTaskStats.reduce((sum, stat) => sum + stat.attemptsCount, 0) / kpiTaskStats.length
    : 0;
  const avgTime = kpiTaskDurationsMs.length > 0
    ? kpiTaskDurationsMs.reduce((sum, value) => sum + value, 0) / kpiTaskDurationsMs.length
    : 0;
  const totalDuration = kpiTaskDurationsMs.reduce((sum, value) => sum + value, 0);

  kpiAvgAttempts.textContent = avgAttempts.toFixed(2);
  kpiAvgTime.textContent = formatDuration(avgTime);
  kpiTotalTime.textContent = formatDuration(totalDuration);
}
} catch {
  showDetailError("Detailansicht konnte nicht geladen werden.");
}

tabAblauf.addEventListener("click", () => activateTab("ablauf"));
tabOverview.addEventListener("click", () => activateTab("overview"));
activateTab("ablauf");

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    revealLayout();
  });
});
