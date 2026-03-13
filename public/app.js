(function () {
  const TASK_KEY = "agent-last-task";
  const TASK_HISTORY_KEY = "agent-task-history";
  const TASK_HISTORY_MAX = 8;
  const MAX_HISTORY = 10;
  let conversationHistory = [];


  const taskInput = document.getElementById("task");
  const modeSelect = document.getElementById("mode");
  const maxStepsInput = document.getElementById("maxSteps");
  const goalTypeSelect = document.getElementById("goalType");
  const timeoutMsInput = document.getElementById("timeoutMs");
  const liveProgressCheck = document.getElementById("liveProgress");
  const verboseCheck = document.getElementById("verbose");
  const dryRunCheck = document.getElementById("dryRun");
  const runBtn = document.getElementById("runBtn");
  const newConvBtn = document.getElementById("newConvBtn");
  const historyHint = document.getElementById("historyHint");
  const stepsLive = document.getElementById("stepsLive");
  const stepsList = document.getElementById("stepsList");
  const planningLive = document.getElementById("planningLive");
  const planningStream = document.getElementById("planningStream");
  const planningCursor = document.getElementById("planningCursor");
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
  const toastContainer = document.getElementById("toastContainer");
  const savedBadge = document.getElementById("savedBadge");
  const optionsToggle = document.getElementById("optionsToggle");
  const optionsPanel = document.getElementById("optionsPanel");
  const taskHistoryList = document.getElementById("taskHistoryList");

  function toast(message, type) {
    if (!toastContainer) return;
    const el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0";
      el.style.transform = "translateY(-4px)";
      setTimeout(function () { el.remove(); }, 200);
    }, 2200);
  }

  function showSavedBadge() {
    if (!savedBadge) return;
    savedBadge.classList.add("visible");
    clearTimeout(showSavedBadge._t);
    showSavedBadge._t = setTimeout(function () {
      savedBadge.classList.remove("visible");
    }, 1500);
  }

  function getTaskHistory() {
    try {
      const s = localStorage.getItem(TASK_HISTORY_KEY);
      return s ? JSON.parse(s) : [];
    } catch (_) { return []; }
  }

  function saveToTaskHistory(task) {
    const t = String(task).trim();
    if (!t) return;
    let list = getTaskHistory();
    list = list.filter(function (x) { return x !== t; });
    list.unshift(t);
    list = list.slice(0, TASK_HISTORY_MAX);
    try {
      localStorage.setItem(TASK_HISTORY_KEY, JSON.stringify(list));
    } catch (_) {}
    renderTaskHistory();
  }

  function renderTaskHistory() {
    if (!taskHistoryList) return;
    const list = getTaskHistory();
    if (!list.length) {
      taskHistoryList.innerHTML = "<li class=\"hint\">No recent tasks</li>";
      return;
    }
    taskHistoryList.innerHTML = list
      .map(function (task, i) {
        const short = task.length > 52 ? task.slice(0, 52) + "…" : task;
        return "<li data-index=\"" + i + "\" title=\"" + escapeHtml(task.slice(0, 200)) + "\">" + escapeHtml(short) + "</li>";
      })
      .join("");
  }

  function pushToHistory(userMsg, assistantMsg) {
    conversationHistory.push({ role: "user", content: userMsg });
    conversationHistory.push({ role: "assistant", content: assistantMsg });
    if (conversationHistory.length > MAX_HISTORY) {
      conversationHistory = conversationHistory.slice(-MAX_HISTORY);
    }
    if (historyHint) {
      historyHint.textContent = conversationHistory.length ? "Context: " + conversationHistory.length + " messages" : "";
      historyHint.hidden = !conversationHistory.length;
    }
  }

  function clearHistory() {
    conversationHistory = [];
    if (historyHint) {
      historyHint.textContent = "";
      historyHint.hidden = true;
    }
  }

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

  function escapeHtml(s) {
    if (s == null || s === "") return "";
    const t = String(s);
    return t
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function summarizeParams(input) {
    if (input == null || typeof input !== "object") return "";
    const o = input;
    const parts = [];
    if (o.path != null) parts.push("path: " + escapeHtml(String(o.path).slice(0, 60)));
    if (o.query != null) parts.push("query: " + escapeHtml(String(o.query).slice(0, 50)));
    if (o.command != null) parts.push("cmd: " + escapeHtml(String(o.command).slice(0, 50)));
    if (o.pattern != null) parts.push("pattern: " + escapeHtml(String(o.pattern).slice(0, 40)));
    if (o.namePattern != null) parts.push("name: " + escapeHtml(String(o.namePattern)));
    if (parts.length) return parts.join(" · ");
    const j = JSON.stringify(o);
    return escapeHtml(j.length > 80 ? j.slice(0, 80) + "…" : j);
  }

  function summarizeOutput(output) {
    if (output == null) return "";
    if (typeof output === "object" && output.error) return escapeHtml(String(output.error));
    const s = typeof output === "string" ? output : JSON.stringify(output);
    return escapeHtml(s.length > 220 ? s.slice(0, 220) + "…" : s);
  }

  function renderMemory(actions) {
    if (!Array.isArray(actions) || !actions.length) return "";
    return actions
      .map(function (a, i) {
        const tool = escapeHtml(a.tool || "?");
        const params = summarizeParams(a.input);
        const outStr = typeof a.output === "string" ? a.output : JSON.stringify(a.output);
        const hasError = a.output && typeof a.output === "object" && "error" in a.output;
        const truncated = outStr.length > 220;
        const outputPreview = summarizeOutput(a.output);
        const outputFull = escapeHtml(outStr.length > 500 ? outStr.slice(0, 500) + "…" : outStr);
        const cls = hasError ? "memory-item has-error" : "memory-item";
        return (
          '<div class="' + cls + '" data-step="' + (i + 1) + '">' +
            '<div class="memory-header">' +
              '<span class="memory-tool">' + tool + '</span>' +
              (params ? '<span class="memory-params">' + params + '</span>' : '') +
            '</div>' +
            '<div class="memory-output' + (truncated ? ' truncated" title="' + outputFull + '"' : '"') + '>' +
              outputPreview +
            '</div>' +
            (truncated ? '<details class="memory-output-full"><summary>Show full output</summary><pre>' + outputFull + '</pre></details>' : '') +
          '</div>'
        );
      })
      .join("");
  }

  function updateCopyButton(visible, text) {
    copyBtn.hidden = !visible;
    if (visible) {
      copyBtn.textContent = "Copy answer";
      copyBtn.onclick = function () {
        navigator.clipboard.writeText(text).then(
          function () { toast("Copied to clipboard", "success"); },
          function () {}
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
      showSavedBadge();
    } catch (_) {}
  }

  if (optionsToggle && optionsPanel) {
    optionsToggle.addEventListener("click", function () {
      const open = optionsPanel.classList.toggle("collapsed");
      optionsToggle.classList.toggle("expanded", !open);
      optionsToggle.setAttribute("aria-expanded", !open);
    });
  }

  taskHistoryList?.addEventListener("click", function (e) {
    const li = e.target.closest("li[data-index]");
    if (!li) return;
    const list = getTaskHistory();
    const idx = parseInt(li.getAttribute("data-index"), 10);
    if (list[idx] != null) {
      taskInput.value = list[idx];
      taskInput.focus();
    }
  });

  runBtn.addEventListener("click", runTask);
  taskInput.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runTask();
    }
  });
  taskInput.addEventListener("blur", saveTask);

  var planningBuffer = "";
  var planningFlushTimer = null;
  var PLANNING_FLUSH_MS = 60;

  function planningBufferToSummary(buf) {
    var parts = [];
    var i = 0;
    while (i < buf.length) {
      var start = buf.indexOf("{\"tool\":", i);
      if (start === -1) start = buf.indexOf('{"tool":', i);
      if (start === -1) break;
      var depth = 0;
      var inStr = false;
      var escape = false;
      var j = start;
      while (j < buf.length) {
        var ch = buf[j];
        if (inStr) {
          if (escape) { escape = false; j++; continue; }
          if (ch === "\\") { escape = true; j++; continue; }
          if (ch === "\"") { inStr = false; j++; continue; }
          j++;
          continue;
        }
        if (ch === "\"") { inStr = true; j++; continue; }
        if (ch === "{") depth++;
        if (ch === "}") depth--;
        if (depth === 0 && j > start) {
          var block = buf.slice(start, j + 1);
          try {
            var obj = JSON.parse(block);
            var tool = obj && obj.tool;
            if (tool === "DONE") parts.push("DONE");
            else if (tool && obj.params) {
              var path = obj.params.path;
              parts.push(path ? tool + " " + path : tool);
            }
          } catch (_) {}
          i = j + 1;
          break;
        }
        j++;
      }
      if (j >= buf.length) break;
    }
    return parts.length ? parts.join(" \u00b7 ") : null;
  }

  function flushPlanningBuffer() {
    planningFlushTimer = null;
    if (!planningStream) return;
    var summary = planningBufferToSummary(planningBuffer);
    var toShow = summary !== null ? summary : (planningBuffer ? "\u2026" : "");
    planningStream.textContent = toShow;
    if (stepsLive) stepsLive.scrollTop = stepsLive.scrollHeight;
  }

  function addStepItem(step, tool, params, error) {
    if (planningFlushTimer) {
      clearTimeout(planningFlushTimer);
      planningFlushTimer = null;
    }
    planningBuffer += "";
    flushPlanningBuffer();
    if (planningLive) {
      planningLive.hidden = true;
      if (planningStream) planningStream.textContent = "";
    }
    planningBuffer = "";
    const div = document.createElement("div");
    div.className = "step-item" + (error ? " error" : "");
    const paramsStr = params && typeof params === "object" ? JSON.stringify(params).slice(0, 60) : "";
    div.innerHTML = "<span class=\"step-num\">" + step + "</span><span class=\"step-tool\">" + (tool || "?") + "</span><span class=\"step-params\">" + (error || paramsStr) + "</span>";
    stepsList.insertBefore(div, stepsList.firstChild);
    stepsLive.scrollTop = 0;
  }

  function showPlanningStreamAndAppend(delta) {
    if (typeof delta !== "string") return;
    if (planningLive && planningLive.hidden) {
      planningLive.hidden = false;
      if (planningStream) planningStream.textContent = "";
    }
    planningBuffer += delta;
    if (!planningFlushTimer) {
      planningFlushTimer = setTimeout(function () {
        flushPlanningBuffer();
      }, PLANNING_FLUSH_MS);
    }
  }

  function hidePlanningStream() {
    if (planningLive) planningLive.hidden = true;
    if (planningStream) planningStream.textContent = "";
    planningBuffer = "";
  }

  async function runTaskStream() {
    const task = taskInput.value.trim();
    const body = {
      task,
      mode: modeSelect.value || "Agent",
      maxSteps: Number(maxStepsInput.value) || 12,
      verbose: verboseCheck.checked,
      dryRun: dryRunCheck.checked,
    };
    if (conversationHistory.length) body.history = conversationHistory.slice(-MAX_HISTORY);
    const gt = goalTypeSelect.value;
    if (gt && gt !== "auto") body.goalType = gt;
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
    planningBuffer = "";
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
          if (data.type === "planner_delta") {
            showPlanningStreamAndAppend(data.delta || "");
          } else if (data.type === "step") {
            addStepItem(data.step, data.tool, data.params, data.error);
          } else if (data.type === "done") {
            hidePlanningStream();
            const answerRaw = data.answer ?? "(no answer)";
            answerEl.innerHTML = renderAnswer(answerRaw);
            answerEl.className = "answer-block";
            updateCopyButton(true, data.answer ?? "");
            pushToHistory(task, data.answer ?? "");
            saveToTaskHistory(task);
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
              memoryEl.innerHTML = renderMemory(data.memory.actions);
              memoryDetails.hidden = false;
            } else {
              memoryEl.innerHTML = "";
              memoryDetails.hidden = true;
            }
          } else if (data.type === "error") {
            hidePlanningStream();
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
    resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    answerEl.innerHTML = "Running…";
    answerEl.className = "answer-block";
    metaEl.textContent = "";
    metaEl.className = "meta-row";
    traceEl.textContent = "";
    memoryEl.innerHTML = "";
    dryRunBlock.hidden = true;
    dryRunList.innerHTML = "";
    traceDetails.open = false;
    memoryDetails.open = false;
    updateCopyButton(false);

    const useStream = liveProgressCheck.checked;
    if (useStream) {
      stepsLive.hidden = false;
      stepsList.innerHTML = "";
      hidePlanningStream();
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
          mode: modeSelect.value || "Agent",
          maxSteps: Number(maxStepsInput.value) || 12,
          verbose: verboseCheck.checked,
          dryRun: dryRunCheck.checked,
        };
        if (conversationHistory.length) body.history = conversationHistory.slice(-MAX_HISTORY);
        const gt = goalTypeSelect.value;
        if (gt && gt !== "auto") body.goalType = gt;
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
        pushToHistory(task, data.answer ?? "");
        saveToTaskHistory(task);

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
          memoryEl.innerHTML = renderMemory(data.memory.actions);
          memoryDetails.hidden = false;
        } else {
          memoryEl.innerHTML = "";
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

  if (newConvBtn) newConvBtn.addEventListener("click", clearHistory);

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
  setInterval(checkHealth, 30000);
  loadSavedTask();
  renderTaskHistory();
})();
