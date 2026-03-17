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

interface QuizSessionExport {
  format: "cfc-quiz-session-v1";
  exportedAt: string;
  tasks: QuizTask[];
  session: {
    activeIndex: number;
    taskStates: Record<string, QuizTaskSessionState>;
  };
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

const dropZone = document.querySelector<HTMLDivElement>("#drop-zone");
const pickFilesButton = document.querySelector<HTMLButtonElement>("#pick-files");
const pickFolderButton = document.querySelector<HTMLButtonElement>("#pick-folder");
const exportPdfButton = document.querySelector<HTMLButtonElement>("#export-pdf");
const printReport = document.querySelector<HTMLElement>("#print-report");
const fileInput = document.querySelector<HTMLInputElement>("#file-input");
const folderInput = document.querySelector<HTMLInputElement>("#folder-input");
const loadStatus = document.querySelector<HTMLParagraphElement>("#load-status");
const statFiles = document.querySelector<HTMLParagraphElement>("#stat-files");
const statAttempts = document.querySelector<HTMLParagraphElement>("#stat-attempts");
const statSuccess = document.querySelector<HTMLParagraphElement>("#stat-success");
const sessionSummarySection = document.querySelector<HTMLElement>("#session-summary-section");
const sessionSummaryBody = document.querySelector<HTMLTableSectionElement>("#session-summary-body");
const overviewSection = document.querySelector<HTMLElement>("#overview-section");
const overviewBody = document.querySelector<HTMLTableSectionElement>("#overview-body");
const failedChecksSection = document.querySelector<HTMLElement>("#failed-checks-section");
const failedChecksBody = document.querySelector<HTMLTableSectionElement>("#failed-checks-body");

if (
  !dropZone ||
  !pickFilesButton ||
  !pickFolderButton ||
  !exportPdfButton ||
  !printReport ||
  !fileInput ||
  !folderInput ||
  !loadStatus ||
  !statFiles ||
  !statAttempts ||
  !statSuccess ||
  !sessionSummarySection ||
  !sessionSummaryBody ||
  !overviewSection ||
  !overviewBody ||
  !failedChecksSection ||
  !failedChecksBody
) {
  throw new Error("UI-Elemente für Quiz-Auswertung fehlen.");
}

const loadedSessions: LoadedSession[] = [];
const SESSION_STORAGE_KEY = "quiz-auswertung:selected-session";
const LOADED_SESSIONS_STORAGE_KEY = "quiz-auswertung:loaded-sessions";

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null;
};

const toPercent = (part: number, total: number): string => {
  if (total <= 0) {
    return "0%";
  }
  return `${((part / total) * 100).toFixed(1)}%`;
};

const parseSessionExport = (raw: string): QuizSessionExport => {
  const parsed = JSON.parse(raw) as Partial<QuizSessionExport>;
  if (parsed.format !== "cfc-quiz-session-v1") {
    throw new Error("Unbekanntes Dateiformat (erwartet: cfc-quiz-session-v1).");
  }
  if (!Array.isArray(parsed.attempts)) {
    throw new Error("Datei enthält keine Versuche.");
  }

  const tasks = Array.isArray(parsed.tasks)
    ? parsed.tasks
      .map((task) => {
        const typed = task as Partial<QuizTask>;
        if (!typed || typeof typed.id !== "string") {
          return null;
        }
        return {
          id: typed.id,
          title: typeof typed.title === "string" ? typed.title : typed.id,
          description: typeof typed.description === "string" ? typed.description : "",
        };
      })
      .filter((task): task is QuizTask => task !== null)
    : [];

  const taskStatesRaw =
    parsed.session && typeof parsed.session === "object" && parsed.session.taskStates && typeof parsed.session.taskStates === "object"
      ? parsed.session.taskStates
      : {};

  const taskStates: Record<string, QuizTaskSessionState> = {};
  Object.entries(taskStatesRaw).forEach(([taskId, state]) => {
    const typed = state as Partial<QuizTaskSessionState>;
    taskStates[taskId] = {
      dataText: typeof typed.dataText === "string" ? typed.dataText : "",
      feedback: typeof typed.feedback === "string" ? typed.feedback : "",
      elapsedMs: typeof typed.elapsedMs === "number" ? typed.elapsedMs : undefined,
      isCompleted: typeof typed.isCompleted === "boolean" ? typed.isCompleted : undefined,
    };
  });

  return {
    format: "cfc-quiz-session-v1",
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "unbekannt",
    attempts: parsed.attempts as QuizAttemptRecord[],
    tasks,
    session:
      parsed.session && typeof parsed.session === "object"
        ? {
            activeIndex: typeof parsed.session.activeIndex === "number" ? parsed.session.activeIndex : 0,
          taskStates,
          }
        : {
            activeIndex: 0,
          taskStates,
          },
  };
};

const persistLoadedSessions = (): void => {
  sessionStorage.setItem(LOADED_SESSIONS_STORAGE_KEY, JSON.stringify(loadedSessions));
};

const restoreLoadedSessions = (): void => {
  const raw = sessionStorage.getItem(LOADED_SESSIONS_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LoadedSession>[];
    if (!Array.isArray(parsed)) {
      return;
    }
    parsed.forEach((entry) => {
      if (!entry || typeof entry !== "object") {
        return;
      }
      if (typeof entry.id !== "string" || typeof entry.fileName !== "string" || !Array.isArray(entry.attempts)) {
        return;
      }

      loadedSessions.push({
        id: entry.id,
        fileName: entry.fileName,
        exportedAt: typeof entry.exportedAt === "string" ? entry.exportedAt : "unbekannt",
        quizName: typeof entry.quizName === "string" ? entry.quizName : "Quiz",
        personName: typeof entry.personName === "string" ? entry.personName : "unbekannt",
        tasks: Array.isArray(entry.tasks) ? entry.tasks as QuizTask[] : [],
        taskStates:
          entry.taskStates && typeof entry.taskStates === "object"
            ? entry.taskStates as Record<string, QuizTaskSessionState>
            : {},
        attempts: entry.attempts as QuizAttemptRecord[],
      });
    });
  } catch {
    sessionStorage.removeItem(LOADED_SESSIONS_STORAGE_KEY);
  }
};

const textCell = (value: string): HTMLTableCellElement => {
  const cell = document.createElement("td");
  cell.textContent = value;
  return cell;
};

const removeSessionById = (sessionId: string): void => {
  const index = loadedSessions.findIndex((session) => session.id === sessionId);
  if (index < 0) {
    return;
  }
  loadedSessions.splice(index, 1);
  persistLoadedSessions();
  loadStatus.textContent = `Eintrag entfernt. Verbleibende Dateien: ${loadedSessions.length}.`;
  render();
};

const parsePersonName = (fileName: string): string => {
  const noExt = fileName.replace(/\.json$/i, "");
  const match = noExt.match(/person-([a-z0-9_-]+)/i);
  return match?.[1] ?? "unbekannt";
};

const parseQuizName = (sessionExport: QuizSessionExport): string => {
  if (sessionExport.tasks.length > 0) {
    return `Quiz (${sessionExport.tasks.length} Aufgaben)`;
  }
  return "Quiz";
};

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "unbekannt";
  }
  return date.toLocaleString("de-DE");
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

const isJsonFile = (file: File): boolean => /\.json$/i.test(file.name);

const readFileEntry = (entry: FileSystemFileEntry): Promise<File> =>
  new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });

const readDirectoryBatch = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
  new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });

const readAllDirectoryEntries = async (entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> => {
  const reader = entry.createReader();
  const entries: FileSystemEntry[] = [];
  while (true) {
    const batch = await readDirectoryBatch(reader);
    if (batch.length === 0) {
      break;
    }
    entries.push(...batch);
  }
  return entries;
};

const collectFilesFromEntry = async (entry: FileSystemEntry): Promise<File[]> => {
  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntry);
    return [file];
  }
  if (!entry.isDirectory) {
    return [];
  }

  const children = await readAllDirectoryEntries(entry as FileSystemDirectoryEntry);
  const nestedFiles = await Promise.all(children.map((child) => collectFilesFromEntry(child)));
  return nestedFiles.flat();
};

const extractDroppedFiles = async (dataTransfer: DataTransfer): Promise<File[]> => {
  const items = Array.from(dataTransfer.items ?? []);
  if (items.length === 0) {
    return Array.from(dataTransfer.files ?? []);
  }

  const entryItems = items
    .map((item) => (item as DataTransferItemWithEntry).webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (entryItems.length === 0) {
    return Array.from(dataTransfer.files ?? []);
  }

  const nestedFiles = await Promise.all(entryItems.map((entry) => collectFilesFromEntry(entry)));
  return nestedFiles.flat();
};

const parseTimestamp = (iso: string): number | null => {
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : null;
};

const computeTaskAttemptStats = (attempts: QuizAttemptRecord[]): Array<{ taskId: string; count: number; durationMs: number }> => {
  const byTask = new Map<string, QuizAttemptRecord[]>();
  attempts.forEach((attempt) => {
    const current = byTask.get(attempt.taskId) ?? [];
    current.push(attempt);
    byTask.set(attempt.taskId, current);
  });

  const stats: Array<{ taskId: string; count: number; durationMs: number }> = [];
  byTask.forEach((taskAttempts, taskId) => {
    const timestamps = taskAttempts
      .map((attempt) => parseTimestamp(attempt.timestamp))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    const first = timestamps[0] ?? 0;
    const last = timestamps[timestamps.length - 1] ?? first;
    stats.push({
      taskId,
      count: taskAttempts.length,
      durationMs: Math.max(0, last - first),
    });
  });

  return stats;
};

const exportPdf = (): void => {
  const statFilesValue = statFiles.textContent ?? "0";
  const statAttemptsValue = statAttempts.textContent ?? "0";
  const statSuccessValue = statSuccess.textContent ?? "0%";
  const generatedAt = new Date().toLocaleString("de-DE");

  const createPrintableSection = (section: HTMLElement, fallback: string): string => {
    if (section.hidden) {
      return `<p class="empty">${fallback}</p>`;
    }
    const clone = section.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".hint").forEach((element) => element.remove());
    clone.querySelectorAll(".session-remove-inline").forEach((element) => element.remove());
    return clone.innerHTML;
  };

  const sessionSummaryMarkup = createPrintableSection(
    sessionSummarySection,
    "Keine Quiz-Durchläufe vorhanden.",
  );
  const overviewMarkup = createPrintableSection(
    overviewSection,
    "Keine Aufgaben-Übersicht vorhanden.",
  );
  const failedChecksMarkup = createPrintableSection(
    failedChecksSection,
    "Keine Fehlchecks vorhanden.",
  );

  printReport.innerHTML = `
    <h1>Quiz-Auswertung</h1>
    <p class="meta">Erstellt am: ${generatedAt}</p>
    <div class="stats">
      <div class="stat"><h3>Dateien</h3><div class="value">${statFilesValue}</div></div>
      <div class="stat"><h3>Versuche</h3><div class="value">${statAttemptsValue}</div></div>
      <div class="stat"><h3>Erfolgsquote</h3><div class="value">${statSuccessValue}</div></div>
    </div>
    <section>
      ${sessionSummaryMarkup}
    </section>
    <section>
      ${overviewMarkup}
    </section>
    <section>
      ${failedChecksMarkup}
    </section>
  `;

  document.body.classList.add("printing-report");
  const onAfterPrint = (): void => {
    document.body.classList.remove("printing-report");
    window.removeEventListener("afterprint", onAfterPrint);
  };
  window.addEventListener("afterprint", onAfterPrint);

  window.setTimeout(() => {
    window.print();
  }, 120);
};

const render = (): void => {
  const allAttempts = loadedSessions.flatMap((session) => session.attempts);
  const successCount = allAttempts.filter((attempt) => attempt.result.success).length;

  statFiles.textContent = String(loadedSessions.length);
  statAttempts.textContent = String(allAttempts.length);
  statSuccess.textContent = toPercent(successCount, allAttempts.length);

  sessionSummaryBody.innerHTML = "";
  loadedSessions.forEach((session) => {
    const total = session.attempts.length;
    const success = session.attempts.filter((attempt) => attempt.result.success).length;
    const answeredTaskIds = new Set(session.attempts.map((attempt) => attempt.taskId));
    const totalTaskCount = session.tasks.length > 0 ? session.tasks.length : answeredTaskIds.size;
    const answeredRatio = `${answeredTaskIds.size}/${Math.max(1, totalTaskCount)}`;
    const row = document.createElement("tr");
    row.classList.add("is-clickable");
    const fileCell = document.createElement("td");
    fileCell.className = "file-col";
    const fileNameSpan = document.createElement("span");
    fileNameSpan.textContent = session.fileName;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "session-remove-inline";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Bericht ${session.fileName} entfernen`);
    removeButton.title = "Bericht entfernen";
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      removeSessionById(session.id);
    });
    fileCell.append(fileNameSpan, removeButton);
    row.append(
      fileCell,
      textCell(answeredRatio),
      textCell(session.personName),
      textCell(formatDate(session.exportedAt)),
      textCell(String(total)),
      textCell(toPercent(success, total)),
    );
    row.addEventListener("click", () => {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      window.location.href = "./detail.html";
    });
    sessionSummaryBody.append(row);
  });
  sessionSummarySection.hidden = loadedSessions.length === 0;

  overviewBody.innerHTML = "";
  const overviewMap = new Map<string, {
    title: string;
    attempts: number;
    success: number;
    totalDurationMs: number;
  }>();

  loadedSessions.forEach((session) => {
    const taskStats = computeTaskAttemptStats(session.attempts);
    const taskStatsByTaskId = new Map(taskStats.map((entry) => [entry.taskId, entry]));
    const titleByTaskId = new Map(session.tasks.map((task) => [task.id, task.title]));

    const successByTaskId = new Map<string, number>();
    session.attempts.forEach((attempt) => {
      if (!titleByTaskId.has(attempt.taskId)) {
        titleByTaskId.set(attempt.taskId, attempt.taskTitle);
      }
      if (attempt.result.success) {
        successByTaskId.set(attempt.taskId, (successByTaskId.get(attempt.taskId) ?? 0) + 1);
      }
    });

    const taskIds = new Set<string>([
      ...session.tasks.map((task) => task.id),
      ...taskStatsByTaskId.keys(),
    ]);

    taskIds.forEach((taskId) => {
      const taskStat = taskStatsByTaskId.get(taskId);
      const answeredAttempts = taskStat?.count ?? 0;
      const durationMsFromState = session.taskStates?.[taskId]?.elapsedMs;
      const totalDurationMsForTask = typeof durationMsFromState === "number"
        ? durationMsFromState
        : taskStat?.durationMs ?? 0;
      const current = overviewMap.get(taskId) ?? {
        title: titleByTaskId.get(taskId) ?? taskId,
        attempts: 0,
        success: 0,
        totalDurationMs: 0,
      };

      current.attempts += answeredAttempts;
      current.success += successByTaskId.get(taskId) ?? 0;
      current.totalDurationMs += totalDurationMsForTask;

      overviewMap.set(taskId, current);
    });
  });

  overviewMap.forEach((entry, taskId) => {
    const averageDurationMs = entry.attempts > 0 ? entry.totalDurationMs / entry.attempts : 0;
    const row = document.createElement("tr");
    row.append(
      textCell(`${entry.title} (${taskId})`),
      textCell(String(entry.attempts)),
      textCell(String(entry.success)),
      textCell(toPercent(entry.success, entry.attempts)),
      textCell(formatDuration(averageDurationMs)),
    );
    overviewBody.append(row);
  });
  overviewSection.hidden = overviewMap.size === 0;

  failedChecksBody.innerHTML = "";
  const failedMap = new Map<string, number>();
  allAttempts.forEach((attempt) => {
    (attempt.result.failedChecks ?? []).forEach((check) => {
      failedMap.set(check, (failedMap.get(check) ?? 0) + 1);
    });
  });
  [...failedMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([check, count]) => {
      const row = document.createElement("tr");
      row.append(textCell(check), textCell(String(count)));
      failedChecksBody.append(row);
    });
  failedChecksSection.hidden = failedMap.size === 0;
};

const loadFiles = async (files: FileList | File[]): Promise<void> => {
  const fileList = Array.from(files);
  if (fileList.length === 0) {
    return;
  }

  const jsonFiles = fileList.filter((file) => isJsonFile(file));
  const ignored = fileList.length - jsonFiles.length;
  if (jsonFiles.length === 0) {
    loadStatus.textContent = `Keine JSON-Dateien gefunden. Ignoriert: ${ignored}.`;
    return;
  }

  let loaded = 0;
  let failed = 0;

  for (const file of jsonFiles) {
    try {
      const text = await file.text();
      const parsed = parseSessionExport(text);
      loadedSessions.push({
        id: crypto.randomUUID(),
        fileName: file.name,
        exportedAt: parsed.exportedAt,
        quizName: parseQuizName(parsed),
        personName: parsePersonName(file.name),
        tasks: parsed.tasks,
        taskStates: parsed.session.taskStates,
        attempts: parsed.attempts,
      });
      loaded += 1;
    } catch {
      failed += 1;
    }
  }

  loadStatus.textContent = `Geladen: ${loaded}. Fehler: ${failed}. Ignoriert: ${ignored}. Gesamte Dateien: ${loadedSessions.length}.`;
  persistLoadedSessions();
  render();
};

pickFilesButton.addEventListener("click", () => fileInput.click());
pickFolderButton.addEventListener("click", () => folderInput.click());
exportPdfButton.addEventListener("click", exportPdf);
fileInput.addEventListener("change", () => {
  if (!fileInput.files) {
    return;
  }
  void loadFiles(fileInput.files).finally(() => {
    fileInput.value = "";
  });
});
folderInput.addEventListener("change", () => {
  if (!folderInput.files) {
    return;
  }
  void loadFiles(folderInput.files).finally(() => {
    folderInput.value = "";
  });
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("is-dragover");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragover");
  const transfer = event.dataTransfer;
  if (!transfer) {
    return;
  }
  void extractDroppedFiles(transfer).then((files) => loadFiles(files));
});

restoreLoadedSessions();
if (loadedSessions.length > 0) {
  loadStatus.textContent = `Wiederhergestellt: ${loadedSessions.length} Datei(en) aus vorheriger Ansicht.`;
}
render();

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.body.classList.remove("app-loading");
  });
});
