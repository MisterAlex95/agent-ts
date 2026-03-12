(function () {
  const TASK_KEY = "agent-last-task";
  const taskInput = document.getElementById("task");
  const maxStepsInput = document.getElementById("maxSteps");
  const goalTypeSelect = document.getElementById("goalType");
  const timeoutMsInput = document.getElementById("timeoutMs");
  const liveProgressCheck = document.getElementById("liveProgress");
  const verboseCheck = document.getElementById("verbose");
  const dryRunCheck = document.getElementById("dryRun");
  const runBtn = document.getElementById("runBtn");
  const stepsLive = document.getElementById("stepsLive");
  const stepsList = document.getElementById("stepsList");
  const indexBtn = document.getElementById("indexBtn");
  const indexStatus = document.getElementById("indexStatus");
  const statusPill = document.getElementById("statusPill");
  const resultCard = document.getElementById("resultCard");
  const answerEl = document.getElementById("answer");
  const metaEl = document.getElementById("meta");
  const traceEl = document.getElementById("trace");
  const memoryEl = document.getElementById("memory");
  const traceDetails = document.getElementById("traceDetails");
  const memoryDetails = document.getElementById("memoryDetails");
  const errorBox = document.getElementById("errorBox");
  const copyBtn = document.getElementById("copyBtn");
  const dryRunBlock = document.getElementById("dryRunBlock");
  const dryRunList = document.getElementById("dryRunList");

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  function hideError() {
    errorBox.hidden = true;
  }

  function setRunning(running) {
    runBtn.disabled = running;
    runBtn.textContent = running ? "" : "Run";
    if (running) {
      const span = document.createElement("span");
      span.className = "spinner";
      span.setAttribute("aria-hidden", "true");
      runBtn.prepend(span);
    } else {
      const s = runBtn.querySelector(".spinner");
      if (s) s.remove();
    }
  }

  function renderAnswer(raw) {
    if (!raw || typeof raw !== "string") return "";
    const escaped = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    return raw
      .replace(/\n/g, "<br>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, function (_, c) { return "<code>" + escaped(c) + "</code>"; });
  }

  function updateCopyButton(visible, text) {
    copyBtn.hidden = !visible;
    if (visible) {
      copyBtn.onclick = function () {
        navigator.clipboard.writeText(text).then(
          () => { copyBtn.textContent = "Copied"; setTimeout(() => { copyBtn.textContent = "Copy answer"; }, 1500); },
          () => {}
        );
      };
    }
  }

  async function checkHealth() {
    try {
      const res = await fetch("/health", { method: "GET" });
      const ok = res.ok;
      statusPill.className = "status-pill " + (ok ? "online" : "offline");
      statusPill.innerHTML = '<span class="dot"></span>' + (ok ? "Connected" : "Error");
      return ok;
    } catch {
      statusPill.className = "status-pill offline";
      statusPill.innerHTML = '<span class="dot"></span>Offline';
      return false;
    }
  }

  function loadSavedTask() {
    try {
      const s = localStorage.getItem(TASK_KEY);
      if (s && taskInput.value.trim() === "") taskInput.value = s;
    } catch (_) {}
  }

  function saveTask() {
    const t = taskInput.value.trim();
    if (!t) return;
    try {
      localStorage.setItem(TASK_KEY, t);
    } catch (_) {}
  }

  runBtn.addEventListener("click", runTask);
  taskInput.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runTask();
    }
  });
  taskInput.addEventListener("blur", saveTask);

  function addStepItem(step, tool, params, error) {
    const div = document.createElement("div");
    div.className = "step-item" + (error ? " error" : "");
    const paramsStr = params && typeof params === "object" ? JSON.stringify(params).slice(0, 60) : "";
    div.innerHTML = "<span class=\"step-num\">" + step + "</span><span class=\"step-tool\">" + (tool || "?") + "</span><span class=\"step-params\">" + (error || paramsStr) + "</span>";
    stepsList.appendChild(div);
    stepsLive.scrollTop = stepsLive.scrollHeight;
  }

  async function runTaskStream() {
    const task = taskInput.value.trim();
    const body = {
      task,
      maxSteps: Number(maxStepsInput.value) || 12,
      goalType: goalTypeSelect.value,
      verbose: verboseCheck.checked,
      dryRun: dryRunCheck.checked,
    };
    const timeoutVal = timeoutMsInput.value.trim();
    if (timeoutVal) body.timeoutMs = Number(timeoutVal) * 1000;

    const res = await fetch("/tasks/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showError(data.error || "HTTP " + res.status);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (let i = 0; i < parts.length; i++) {
        const line = parts[i].split("\n").find(function (l) { return l.startsWith("data: "); });
        if (!line) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "step") {
            addStepItem(data.step, data.tool, data.params, data.error);
          } else if (data.type === "done") {
            const answerRaw = data.answer ?? "(no answer)";
            answerEl.innerHTML = renderAnswer(answerRaw);
            answerEl.className = "answer-block";
            updateCopyButton(true, data.answer ?? "");
            metaEl.textContent = "Steps: " + (data.steps ?? 0);
            if (data.dryRunPlannedChanges?.length) {
              dryRunBlock.hidden = false;
              dryRunList.innerHTML = data.dryRunPlannedChanges
                .map(function (p) {
                  return "<li><code>" + (p.tool || "?") + "</code> " + (JSON.stringify(p.params) || "").slice(0, 80) + "</li>";
                })
                .join("");
            }
            if (data.trace?.length) {
              traceEl.textContent = JSON.stringify(data.trace, null, 2);
              traceDetails.hidden = false;
            } else traceDetails.hidden = true;
            if (data.memory?.actions?.length) {
              memoryEl.textContent = JSON.stringify(data.memory.actions, null, 2);
              memoryDetails.hidden = false;
            } else memoryDetails.hidden = true;
          } else if (data.type === "error") {
            showError(data.error || "Unknown error");
          }
        } catch (_) {}
      }
    }
  }

  async function runTask() {
    const task = taskInput.value.trim();
    if (!task) {
      showError("Enter a task.");
      return;
    }
    hideError();
    resultCard.hidden = false;
    answerEl.innerHTML = "Running…";
    answerEl.className = "answer-block";
    metaEl.textContent = "";
    metaEl.className = "meta-row";
    traceEl.textContent = "";
    memoryEl.textContent = "";
    dryRunBlock.hidden = true;
    dryRunList.innerHTML = "";
    traceDetails.open = false;
    memoryDetails.open = false;
    updateCopyButton(false);

    const useStream = liveProgressCheck.checked;
    if (useStream) {
      stepsLive.hidden = false;
      stepsList.innerHTML = "";
    } else {
      stepsLive.hidden = true;
    }

    setRunning(true);
    try {
      if (useStream) {
        await runTaskStream();
      } else {
        const body = {
          task,
          maxSteps: Number(maxStepsInput.value) || 12,
          goalType: goalTypeSelect.value,
          verbose: verboseCheck.checked,
          dryRun: dryRunCheck.checked,
        };
        const timeoutVal = timeoutMsInput.value.trim();
        if (timeoutVal) body.timeoutMs = Number(timeoutVal) * 1000;

        const res = await fetch("/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          showError(data.error || "HTTP " + res.status);
          answerEl.innerHTML = "";
          return;
        }

        const answerRaw = data.answer ?? "(no answer)";
        answerEl.innerHTML = renderAnswer(answerRaw);
        answerEl.className = "answer-block";
        updateCopyButton(true, data.answer ?? "");

        metaEl.textContent = "Steps: " + (data.steps ?? 0);
        if (data.dryRunPlannedChanges?.length) {
          dryRunBlock.hidden = false;
          dryRunList.innerHTML = data.dryRunPlannedChanges
            .map(function (p) {
              return "<li><code>" + (p.tool || "?") + "</code> " + (JSON.stringify(p.params) || "").slice(0, 80) + "</li>";
            })
            .join("");
        }

        if (data.trace?.length) {
          traceEl.textContent = JSON.stringify(data.trace, null, 2);
          traceDetails.hidden = false;
        } else {
          traceDetails.hidden = true;
        }
        if (data.memory?.actions?.length) {
          memoryEl.textContent = JSON.stringify(data.memory.actions, null, 2);
          memoryDetails.hidden = false;
        } else {
          memoryDetails.hidden = true;
        }
      }
    } catch (err) {
      showError(err.message || "Request failed");
      answerEl.innerHTML = "";
    } finally {
      setRunning(false);
    }
  }

  indexBtn.addEventListener("click", async function () {
    indexStatus.textContent = "";
    indexStatus.className = "index-status";
    indexBtn.disabled = true;
    try {
      const res = await fetch("/index", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        indexStatus.textContent = "Error: " + (data.error || res.status);
        indexStatus.className = "index-status err";
        return;
      }
      indexStatus.textContent = "Indexed " + (data.indexedFiles ?? 0) + " files, " + (data.indexedChunks ?? 0) + " chunks";
      indexStatus.className = "index-status ok";
    } catch (err) {
      indexStatus.textContent = err.message || "Failed";
      indexStatus.className = "index-status err";
    } finally {
      indexBtn.disabled = false;
    }
  });

  checkHealth();
  loadSavedTask();
})();
