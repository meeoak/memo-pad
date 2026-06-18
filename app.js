const STORAGE_KEY = "planner-v2";
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DOW_MINI = ["M", "T", "W", "T", "F", "S", "S"];
const TAG_ROWS_MIN = 5;
const TAG_ROWS_MAX = 12;
const HABIT_ROWS_MIN = 5;
const HABIT_ROWS_MAX = 12;
const PLAN_START_HOUR = 4;
const PLAN_SLOT_COUNT = 21;
const THEME_KEY = "planner-theme";

let state = {
  currentDate: startOfDay(new Date()),
  data: loadData(),
};

const MOBILE_MQ = window.matchMedia("(max-width: 768px)");

const els = {
  toolbarTitle: document.getElementById("toolbarTitle"),
  btnPrev: document.getElementById("btnPrev"),
  btnNext: document.getElementById("btnNext"),
  btnToday: document.getElementById("btnToday"),
  currentLabel: document.getElementById("currentLabel"),
  workList: document.getElementById("workList"),
  lifeList: document.getElementById("lifeList"),
  habitTracker: document.getElementById("habitTracker"),
  sidebarCal: document.getElementById("sidebarCal"),
  weeklyColumns: document.getElementById("weeklyColumns"),
  progressLabel: document.getElementById("progressLabel"),
  progressFill: document.getElementById("progressFill"),
  saveStatus: document.getElementById("saveStatus"),
  btnCarryToday: document.getElementById("btnCarryToday"),
  btnCarryWeek: document.getElementById("btnCarryWeek"),
  btnAddWork: document.getElementById("btnAddWork"),
  btnAddLife: document.getElementById("btnAddLife"),
  deferredPanel: document.getElementById("deferredPanel"),
  deferredList: document.getElementById("deferredList"),
  themeSelect: document.getElementById("themeSelect"),
};

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekKey(date) {
  return dateKey(getWeekStart(date));
}

function parseDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    return migrateFromV1() || emptyStore();
  } catch {
    return emptyStore();
  }
}

function migrateFromV1() {
  try {
    const old = localStorage.getItem("paper-diary-v1");
    if (!old) return null;
    const parsed = JSON.parse(old);
    const store = emptyStore();
    for (const [key, val] of Object.entries(parsed)) {
      if (key === "weeks") {
        for (const [wk, note] of Object.entries(val)) {
          if (typeof note === "string") store.weeks[wk] = { work: emptyWork(), life: emptyLife(), habits: emptyHabits(), note };
        }
      } else if (val && val.plan) {
        store.days[key] = {
          plan: val.plan.map((p) => ({ text: p.text || "", done: !!p.done, highlight: false, defer: null })),
          do: migrateDo(val.do),
          see: {
            missed: "",
            grateful: "",
            summary: typeof val.see === "string" ? val.see : "",
          },
        };
      }
    }
    return store;
  } catch {
    return null;
  }
}

function migrateDo(oldDo) {
  const slots = getHourSlots();
  const result = {};
  for (const s of slots) {
    const cells = oldDo?.[s.key] || ["", "", "", ""];
    const hasText = cells.some((c) => c.trim());
    result[s.key] = { cells: [...cells], tone: hasText ? "active" : "none" };
  }
  return result;
}

function emptyStore() {
  return { days: {}, weeks: {} };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  showSaveStatus();
}

function showSaveStatus() {
  if (!els.saveStatus) return;
  els.saveStatus.textContent = "방금 저장됨";
  els.saveStatus.className = "save-status save-status-just";
  clearTimeout(showSaveStatus.settleTimer);
  showSaveStatus.settleTimer = setTimeout(() => {
    els.saveStatus.textContent = "저장됨";
    els.saveStatus.className = "save-status save-status-saved";
  }, 2000);
}

function getWeekProgress(weekDays) {
  let done = 0;
  let total = 0;

  for (const d of weekDays) {
    for (const p of getDayData(d).plan) {
      if (!p.text.trim()) continue;
      total++;
      if (p.done) done++;
    }
  }

  const week = getWeekData(state.currentDate);
  for (const item of [...week.work, ...week.life]) {
    if (!item.text.trim()) continue;
    total++;
    if (item.done) done++;
  }

  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

function updateWeekProgress(weekDays = getWeekDays(state.currentDate)) {
  const { done, total, percent } = getWeekProgress(weekDays);
  if (els.progressLabel) els.progressLabel.textContent = `${done}/${total} · ${percent}%`;
  if (els.progressFill) els.progressFill.style.width = `${percent}%`;
}

function findEmptyPlanSlot(dayData, preferredIndex) {
  if (!dayData.plan[preferredIndex]?.text.trim()) return preferredIndex;
  return dayData.plan.findIndex((p) => !p.text.trim());
}

function carryDayIncompleteToTomorrow(date) {
  const fromData = getDayData(date);
  const toData = getDayData(addDays(date, 1));
  let moved = 0;

  for (let i = 0; i < fromData.plan.length; i++) {
    const item = normalizePlanItem(fromData.plan[i]);
    if (!item.text.trim() || item.done) continue;

    const targetIndex = findEmptyPlanSlot(toData, i);
    if (targetIndex < 0) continue;

    toData.plan[targetIndex] = {
      text: item.text,
      done: false,
      highlight: item.highlight,
      defer: "tomorrow",
      deferFrom: { date: dateKey(date), index: i },
    };
    fromData.plan[i] = emptyPlanItem();
    moved++;
  }

  if (moved) saveData();
  return moved;
}

function carryWeekIncompleteToNextWeek(weekDays) {
  let moved = 0;

  for (const date of weekDays) {
    const fromData = getDayData(date);
    const toData = getDayData(addDays(date, 7));

    for (let i = 0; i < fromData.plan.length; i++) {
      const item = normalizePlanItem(fromData.plan[i]);
      if (!item.text.trim() || item.done) continue;

      const targetIndex = findEmptyPlanSlot(toData, i);
      if (targetIndex < 0) continue;

      toData.plan[targetIndex] = {
        text: item.text,
        done: false,
        highlight: item.highlight,
        defer: "tomorrow",
        deferFrom: { date: dateKey(date), index: i },
      };
      fromData.plan[i] = emptyPlanItem();
      moved++;
    }
  }

  const week = getWeekData(state.currentDate);
  const nextWeek = getWeekData(addDays(weekDays[0], 7));
  for (const [src, dest] of [[week.work, nextWeek.work], [week.life, nextWeek.life]]) {
    for (let i = 0; i < src.length; i++) {
      const item = src[i];
      if (!item.text.trim() || item.done) continue;
      const emptyIdx = dest.findIndex((d) => !d.text.trim());
      if (emptyIdx < 0) continue;
      dest[emptyIdx] = { text: item.text, done: false };
      src[i] = { text: "", done: false };
      moved++;
    }
  }

  if (moved) saveData();
  return moved;
}

function getHourSlots() {
  return Array.from({ length: PLAN_SLOT_COUNT }, (_, i) => {
    const hour24 = (PLAN_START_HOUR + i) % 24;
    return formatHourDisplay(hour24);
  });
}

function formatHourDisplay(hour24) {
  const num = hour24 % 12 || 12;
  const showPeriod = hour24 === PLAN_START_HOUR || hour24 === 12 || hour24 === 0;
  const period = hour24 === 12 ? "pm" : "am";
  return { key: String(hour24), num, period, showPeriod, hour24 };
}

function oldPlanIndexForHour(hour24) {
  return (hour24 - 3 + 24) % 24;
}

function migratePlanArray(plan) {
  const slots = getHourSlots();
  if (plan.length === slots.length) return plan.map(normalizePlanItem);

  if (plan.length === 24) {
    return slots.map((s) => normalizePlanItem(plan[oldPlanIndexForHour(s.hour24)]));
  }

  return Array.from({ length: slots.length }, (_, i) => normalizePlanItem(plan[i]));
}

function emptyDayData() {
  const slots = getHourSlots();
  return {
    plan: slots.map(() => emptyPlanItem()),
    do: Object.fromEntries(slots.map((s) => [s.key, { cells: ["", "", "", ""], tone: "none" }])),
    see: { missed: "", grateful: "", summary: "" },
  };
}

function emptyWork() {
  return Array.from({ length: TAG_ROWS_MIN }, () => ({ text: "", done: false }));
}

function emptyLife() {
  return Array.from({ length: TAG_ROWS_MIN }, () => ({ text: "", done: false }));
}

function emptyHabits() {
  return Array.from({ length: HABIT_ROWS_MIN }, () => ({
    text: "",
    days: Array(7).fill(false),
  }));
}

function normalizeTagList(list) {
  const items = Array.isArray(list)
    ? list.map((item) => ({ text: item?.text || "", done: !!item?.done }))
    : [];
  while (items.length < TAG_ROWS_MIN) items.push({ text: "", done: false });
  return items;
}

function normalizeHabits(list) {
  const items = Array.isArray(list)
    ? list.map((item) => ({
        text: item?.text || "",
        days: Array.from({ length: 7 }, (_, d) => !!item?.days?.[d]),
      }))
    : [];
  while (items.length < HABIT_ROWS_MIN) {
    items.push({ text: "", days: Array(7).fill(false) });
  }
  return items;
}

function addTagRow(type) {
  const week = getWeekData(state.currentDate);
  const list = type === "work" ? week.work : week.life;
  if (list.length >= TAG_ROWS_MAX) return;
  list.push({ text: "", done: false });
  saveData();
  if (type === "work") {
    renderTagList(els.workList, week.work, "work");
    if (els.btnAddWork) els.btnAddWork.disabled = week.work.length >= TAG_ROWS_MAX;
  } else {
    renderTagList(els.lifeList, week.life, "life");
    if (els.btnAddLife) els.btnAddLife.disabled = week.life.length >= TAG_ROWS_MAX;
  }
  updateWeekProgress();
}

function addHabitRow() {
  const week = getWeekData(state.currentDate);
  if (week.habits.length >= HABIT_ROWS_MAX) return;
  week.habits.push({ text: "", days: Array(7).fill(false) });
  saveData();
  renderHabitTracker(getWeekDays(state.currentDate), week.habits);
}

function getDayData(date) {
  const key = dateKey(date);
  if (!state.data.days[key]) state.data.days[key] = emptyDayData();
  state.data.days[key].plan = migratePlanArray(state.data.days[key].plan);
  return state.data.days[key];
}

function getWeekData(date) {
  const key = weekKey(date);
  if (!state.data.weeks[key]) {
    state.data.weeks[key] = { work: emptyWork(), life: emptyLife(), habits: emptyHabits(), note: "" };
  }
  const week = state.data.weeks[key];
  week.work = normalizeTagList(week.work);
  week.life = normalizeTagList(week.life);
  week.habits = normalizeHabits(week.habits);
  return week;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return startOfDay(d);
}

function isToday(date) {
  return dateKey(date) === dateKey(new Date());
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return startOfDay(d);
}

function getWeekDays(date) {
  const start = getWeekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function isMobileView() {
  return MOBILE_MQ.matches;
}

function navStepDays() {
  return isMobileView() ? 1 : 7;
}

function getVisibleDays(date = state.currentDate) {
  return isMobileView() ? [startOfDay(date)] : getWeekDays(date);
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const persist = debounce(saveData, 250);

function updateLabel() {
  if (isMobileView()) {
    const d = state.currentDate;
    const di = d.getDay();
    els.currentLabel.textContent =
      `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 · ${DAY_NAMES[di]}`;
    if (els.toolbarTitle) els.toolbarTitle.textContent = "DAILY";
    if (els.btnPrev) els.btnPrev.setAttribute("aria-label", "이전 날");
    if (els.btnNext) els.btnNext.setAttribute("aria-label", "다음 날");
    return;
  }

  const ws = getWeekDays(state.currentDate);
  els.currentLabel.textContent =
    `${ws[0].getFullYear()}년 ${ws[0].getMonth() + 1}/${ws[0].getDate()} – ${ws[6].getMonth() + 1}/${ws[6].getDate()}`;
  if (els.toolbarTitle) els.toolbarTitle.textContent = "WEEKLY";
  if (els.btnPrev) els.btnPrev.setAttribute("aria-label", "이전 주");
  if (els.btnNext) els.btnNext.setAttribute("aria-label", "다음 주");
}

function buildWeekColumnHTML(date) {
  const data = getDayData(date);
  const di = date.getDay();
  const slots = getHourSlots();
  const headCls = ["week-col-head", di === 6 ? "sat" : "", di === 0 ? "sun" : "", isToday(date) ? "today" : ""].filter(Boolean).join(" ");

  const rows = slots.map((s, i) => {
    const plan = normalizePlanItem(data.plan[i]);
    const rowCls = planRowClasses(plan);
    const periodHtml = s.showPeriod ? `<span class="time-period">${s.period}</span>` : `<span class="time-period"></span>`;
    const timeCell = plan.text.trim()
      ? `<div class="cell-time drag-handle" draggable="true" title="드래그하여 이동"><span class="time-num">${s.num}</span>${periodHtml}</div>`
      : `<div class="cell-time"><span class="time-num">${s.num}</span>${periodHtml}</div>`;

    return `
      <div class="${rowCls}" data-index="${i}" data-hour="${s.key}">
        ${timeCell}
        <div class="cell-plan">
          <button type="button" class="plan-check${plan.done ? " is-done" : ""}" aria-label="완료" title="완료">✓</button>
          <input type="text" class="plan-input" value="${escapeAttr(plan.text)}" title="더블클릭: 강조">
          <div class="plan-defer${plan.text?.trim() ? " has-plan" : ""}">
            <button type="button" class="defer-btn defer-tomorrow" aria-label="내일로 이동" title="내일로 이동">→</button>
            <button type="button" class="defer-btn defer-later" aria-label="한 시간 미루기" title="한 시간 미루기">↓</button>
          </div>
        </div>
      </div>`;
  }).join("");

  return `
    <article class="week-col" data-date="${dateKey(date)}">
      <header class="${headCls}">
        <span class="col-head-label">${DAY_NAMES[di]} ${date.getDate()}</span>
        <button type="button" class="col-carry-btn" data-carry-date="${dateKey(date)}" title="이 날 미완료 → 내일">→</button>
      </header>
      <div class="week-col-labels"><span class="lbl-spacer"></span><span class="lbl-plan">PLAN</span></div>
      <div class="week-col-rows">${rows}</div>
      <footer class="week-col-see">
        <span class="lbl-see">SEE</span>
        <div class="see-fields">
          <label class="see-field"><span class="see-num">1</span><input type="text" class="see-missed" value="${escapeAttr(data.see.missed || "")}" placeholder="오늘 못한 것"></label>
          <label class="see-field"><span class="see-num">2</span><input type="text" class="see-grateful" value="${escapeAttr(data.see.grateful || "")}" placeholder="감사한 일"></label>
          <label class="see-field"><span class="see-num">3</span><input type="text" class="see-summary" value="${escapeAttr(data.see.summary || "")}" placeholder="오늘의 하루"></label>
        </div>
      </footer>
    </article>`;
}

function renderWeekly() {
  const visibleDays = getVisibleDays(state.currentDate);
  const weekDays = getWeekDays(state.currentDate);
  const week = getWeekData(state.currentDate);

  document.body.classList.toggle("mobile-daily", isMobileView());

  renderTagList(els.workList, week.work, "work");
  renderTagList(els.lifeList, week.life, "life");
  if (els.btnAddWork) {
    els.btnAddWork.disabled = week.work.length >= TAG_ROWS_MAX;
    els.btnAddWork.onclick = () => addTagRow("work");
  }
  if (els.btnAddLife) {
    els.btnAddLife.disabled = week.life.length >= TAG_ROWS_MAX;
    els.btnAddLife.onclick = () => addTagRow("life");
  }
  renderHabitTracker(weekDays, week.habits);
  renderSidebarCal(weekDays);
  renderDeferredPanel(weekDays);

  els.weeklyColumns.innerHTML = visibleDays.map(buildWeekColumnHTML).join("");

  els.weeklyColumns.querySelectorAll(".week-col").forEach((col) => {
    bindDayEvents(col, parseDate(col.dataset.date));
  });

  bindPlanDragDrop(els.weeklyColumns);

  els.weeklyColumns.querySelectorAll(".col-carry-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const moved = carryDayIncompleteToTomorrow(parseDate(btn.dataset.carryDate));
      if (moved) renderWeekly();
      else alert("넘길 미완료 항목이 없거나 내일 칸이 부족합니다.");
    });
  });

  updateWeekProgress(weekDays);
  updateLabel();
}

function bindEnterToNextRow(container, inputSelector) {
  if (!container) return;
  container.querySelectorAll(inputSelector).forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const row = input.closest("li, .see-field");
      const nextInput = row?.nextElementSibling?.querySelector(inputSelector);
      if (nextInput) {
        nextInput.focus();
        if (nextInput.select) nextInput.select();
      }
    });
  });
}

function renderTagList(container, items, type) {
  container.innerHTML = items.map((item, i) => `
    <li class="tag-item">
      <input type="checkbox" data-type="${type}" data-i="${i}" ${item.done ? "checked" : ""}>
      <input type="text" data-type="${type}" data-i="${i}" value="${escapeAttr(item.text)}">
    </li>`).join("");

  container.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("change", onTagChange);
    inp.addEventListener("input", onTagChange);
  });
  bindEnterToNextRow(container, 'input[type="text"]');
}

function onTagChange(e) {
  const week = getWeekData(state.currentDate);
  const type = e.target.dataset.type;
  const i = Number(e.target.dataset.i);
  const list = type === "work" ? week.work : week.life;
  if (e.target.type === "checkbox") list[i].done = e.target.checked;
  else list[i].text = e.target.value;
  persist();
  updateWeekProgress();
}

function renderHabitTracker(weekDays, habits) {
  if (!els.habitTracker) return;

  const dayHeaders = weekDays.map((date, di) => {
    const cls = ["habit-wd"];
    if (di === 5) cls.push("sat");
    if (di === 6) cls.push("sun");
    if (isToday(date)) cls.push("today");
    return `<span class="${cls.join(" ")}" title="${date.getMonth() + 1}/${date.getDate()}">${DOW_MINI[di]}</span>`;
  }).join("");

  const rows = habits.map((habit, hi) => {
    const checks = habit.days.map((done, di) => {
      const cls = ["habit-day"];
      if (di === 5) cls.push("sat");
      if (di === 6) cls.push("sun");
      if (isToday(weekDays[di])) cls.push("today");
      return `<label class="${cls.join(" ")}"><input type="checkbox" data-habit="${hi}" data-day="${di}" ${done ? "checked" : ""}></label>`;
    }).join("");

    return `
      <li class="habit-row">
        <input type="text" class="habit-name" data-habit="${hi}" value="${escapeAttr(habit.text)}" placeholder="습관 ${hi + 1}">
        <div class="habit-days">${checks}</div>
      </li>`;
  }).join("");

  els.habitTracker.innerHTML = `
    <h3 class="tag-head">습관 트래커</h3>
    <div class="habit-grid">
      <div class="habit-grid-head">
        <span class="habit-label-spacer"></span>
        <div class="habit-days-head">${dayHeaders}</div>
      </div>
      <ul class="habit-list">${rows}</ul>
      <button type="button" class="tag-add-btn habit-add-btn" id="btnAddHabit">+ 행 추가</button>
    </div>`;

  els.habitTracker.querySelectorAll(".habit-name").forEach((inp) => {
    inp.addEventListener("input", () => {
      const week = getWeekData(state.currentDate);
      week.habits[Number(inp.dataset.habit)].text = inp.value;
      persist();
    });
  });

  bindEnterToNextRow(els.habitTracker.querySelector(".habit-list"), ".habit-name");

  els.habitTracker.querySelectorAll(".habit-days input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const week = getWeekData(state.currentDate);
      const hi = Number(cb.dataset.habit);
      const di = Number(cb.dataset.day);
      week.habits[hi].days[di] = cb.checked;
      persist();
    });
  });

  const habitAddBtn = els.habitTracker.querySelector(".habit-add-btn");
  if (habitAddBtn) {
    habitAddBtn.disabled = habits.length >= HABIT_ROWS_MAX;
    habitAddBtn.onclick = addHabitRow;
  }
}

function emptyPlanItem() {
  return { text: "", done: false, highlight: false, defer: null, deferFrom: null };
}

function normalizePlanItem(item) {
  if (!item) return emptyPlanItem();
  const defer = item.defer === "later" || item.defer === "tomorrow" ? item.defer : null;
  const deferFrom = item.deferFrom?.date && Number.isInteger(item.deferFrom?.index)
    ? { date: item.deferFrom.date, index: item.deferFrom.index }
    : null;
  return {
    text: item.text || "",
    done: !!item.done,
    highlight: !!item.highlight,
    defer: item.done ? null : defer,
    deferFrom: item.done || !defer ? null : deferFrom,
  };
}

function formatSlotLabel(dateKeyStr, index) {
  const date = parseDate(dateKeyStr);
  const slot = getHourSlots()[index];
  if (!slot) return dateKeyStr;
  const periodText = slot.showPeriod ? ` ${slot.period}` : "";
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()} · ${slot.num}${periodText}`;
}

function collectDeferredTasks(weekDays) {
  const items = [];
  for (const date of weekDays) {
    const key = dateKey(date);
    getDayData(date).plan.forEach((raw, index) => {
      const plan = normalizePlanItem(raw);
      if (!plan.text.trim() || !plan.defer || !plan.deferFrom) return;
      items.push({
        text: plan.text,
        defer: plan.defer,
        toDate: key,
        toIndex: index,
        fromLabel: formatSlotLabel(plan.deferFrom.date, plan.deferFrom.index),
        toLabel: formatSlotLabel(key, index),
      });
    });
  }
  return items;
}

function focusPlanSlot(date, index) {
  if (isMobileView()) {
    state.currentDate = startOfDay(date);
  } else {
    const weekStart = getWeekStart(state.currentDate);
    const weekEnd = addDays(weekStart, 6);
    if (date < weekStart || date > weekEnd) state.currentDate = startOfDay(date);
  }

  renderWeekly();
  requestAnimationFrame(() => {
    const row = document.querySelector(
      `.week-col[data-date="${dateKey(date)}"] .week-hour-row[data-index="${index}"]`,
    );
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
    row?.classList.add("flash-focus");
    row?.querySelector(".plan-input")?.focus();
    setTimeout(() => row?.classList.remove("flash-focus"), 1200);
  });
}

function renderDeferredPanel(weekDays) {
  if (!els.deferredPanel || !els.deferredList) return;
  const items = collectDeferredTasks(weekDays);
  els.deferredPanel.hidden = items.length === 0;
  if (!items.length) {
    els.deferredList.innerHTML = "";
    return;
  }

  els.deferredList.innerHTML = items.map((item) => `
    <li class="deferred-item defer-${item.defer}" data-date="${item.toDate}" data-index="${item.toIndex}" role="button" tabindex="0">
      <span class="defer-route">${escapeAttr(item.fromLabel)} → ${escapeAttr(item.toLabel)}</span>
      <span class="defer-text">${escapeAttr(item.text)}</span>
    </li>`).join("");

  els.deferredList.querySelectorAll(".deferred-item").forEach((el) => {
    const go = () => focusPlanSlot(parseDate(el.dataset.date), Number(el.dataset.index));
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  });
}

function planRowClasses(plan) {
  const p = normalizePlanItem(plan);
  return [
    "week-hour-row",
    p.text.trim() ? "has-plan" : "",
    p.done ? "plan-done" : "",
    !p.done && p.defer === "later" ? "plan-defer-later" : "",
    !p.done && p.defer === "tomorrow" ? "plan-defer-tomorrow" : "",
    p.highlight && !p.done && !p.defer ? "plan-highlight" : "",
  ].filter(Boolean).join(" ");
}

function syncPlanRowClasses(row, plan) {
  const p = normalizePlanItem(plan);
  row.classList.toggle("has-plan", !!p.text.trim());
  row.classList.toggle("plan-done", p.done);
  row.classList.toggle("plan-defer-later", !p.done && p.defer === "later");
  row.classList.toggle("plan-defer-tomorrow", !p.done && p.defer === "tomorrow");
  row.classList.toggle("plan-highlight", p.highlight && !p.done && !p.defer);
}

function movePlanItem(fromDate, fromIndex, toDate, toIndex, deferStatus = null) {
  const fromData = getDayData(fromDate);
  const item = fromData.plan[fromIndex];
  if (!item?.text?.trim()) return false;

  const toData = getDayData(toDate);
  const target = toData.plan[toIndex];
  const moving = {
    text: item.text,
    done: false,
    highlight: item.highlight,
    defer: deferStatus,
    deferFrom: deferStatus ? { date: dateKey(fromDate), index: fromIndex } : null,
  };

  if (target.text.trim()) {
    fromData.plan[fromIndex] = normalizePlanItem(target);
  } else {
    fromData.plan[fromIndex] = emptyPlanItem();
  }

  toData.plan[toIndex] = moving;
  saveData();
  return true;
}

function deferPlanToTomorrow(date, index) {
  return movePlanItem(date, index, addDays(date, 1), index, "tomorrow");
}

function deferPlanToday(date, index) {
  if (index >= getHourSlots().length - 1) return false;
  return movePlanItem(date, index, date, index + 1, "later");
}

function dayDiff(fromDate, toDate) {
  return Math.round((startOfDay(toDate) - startOfDay(fromDate)) / 86400000);
}

function getDragDeferStatus(fromDate, fromIndex, toDate, toIndex) {
  if (dateKey(fromDate) === dateKey(toDate)) {
    return toIndex > fromIndex ? "later" : null;
  }
  return dayDiff(fromDate, toDate) === 1 ? "tomorrow" : null;
}

function bindPlanDragDrop(container) {
  if (container.dataset.dragBound) return;
  container.dataset.dragBound = "1";

  let dragSource = null;

  container.addEventListener("dragstart", (e) => {
    const handle = e.target.closest(".drag-handle");
    if (!handle) return;
    const row = handle.closest(".week-hour-row");
    const col = row?.closest(".week-col");
    if (!row || !col) return;

    dragSource = {
      fromDate: col.dataset.date,
      fromIndex: Number(row.dataset.index),
    };
    e.dataTransfer.setData("text/plain", `${dragSource.fromDate}:${dragSource.fromIndex}`);
    e.dataTransfer.effectAllowed = "move";
    row.classList.add("dragging");
  });

  container.addEventListener("dragend", (e) => {
    e.target.closest(".week-hour-row")?.classList.remove("dragging");
    container.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
    dragSource = null;
  });

  container.addEventListener("dragover", (e) => {
    const row = e.target.closest(".week-hour-row");
    if (!row || !dragSource) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    container.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
    row.classList.add("drop-target");
  });

  container.addEventListener("dragleave", (e) => {
    const row = e.target.closest(".week-hour-row");
    if (row && !row.contains(e.relatedTarget)) row.classList.remove("drop-target");
  });

  container.addEventListener("drop", (e) => {
    const row = e.target.closest(".week-hour-row");
    const col = row?.closest(".week-col");
    if (!row || !col) return;
    e.preventDefault();
    row.classList.remove("drop-target");

    let fromDateKey;
    let fromIndex;
    const raw = e.dataTransfer.getData("text/plain");
    if (raw.includes(":")) {
      [fromDateKey, fromIndex] = raw.split(":");
      fromIndex = Number(fromIndex);
    } else if (dragSource) {
      fromDateKey = dragSource.fromDate;
      fromIndex = dragSource.fromIndex;
    } else {
      return;
    }

    const toDateKey = col.dataset.date;
    const toIndex = Number(row.dataset.index);
    if (fromDateKey === toDateKey && fromIndex === toIndex) return;

    const fromDate = parseDate(fromDateKey);
    const toDate = parseDate(toDateKey);
    const deferStatus = getDragDeferStatus(fromDate, fromIndex, toDate, toIndex);
    if (movePlanItem(fromDate, fromIndex, toDate, toIndex, deferStatus)) renderWeekly();
  });
}

function bindDayEvents(col, date) {
  const data = getDayData(date);

  col.querySelectorAll(".week-hour-row").forEach((row) => {
    const i = Number(row.dataset.index);
    const check = row.querySelector(".plan-check");
    const input = row.querySelector(".plan-input");
    const defer = row.querySelector(".plan-defer");
    const btnTomorrow = row.querySelector(".defer-tomorrow");
    const btnLater = row.querySelector(".defer-later");

    const syncActions = () => {
      const hasText = !!input.value.trim();
      row.classList.toggle("has-plan", hasText);
      defer.classList.toggle("has-plan", hasText);
      btnTomorrow.disabled = !hasText;
      btnLater.disabled = !hasText || i >= getHourSlots().length - 1;
    };

    check.addEventListener("click", () => {
      if (!input.value.trim()) return;
      data.plan[i].done = !data.plan[i].done;
      if (data.plan[i].done) {
        data.plan[i].defer = null;
        data.plan[i].deferFrom = null;
      }
      check.classList.toggle("is-done", data.plan[i].done);
      syncPlanRowClasses(row, data.plan[i]);
      persist();
      updateWeekProgress();
      renderDeferredPanel(getWeekDays(state.currentDate));
    });

    input.addEventListener("input", () => {
      data.plan[i].text = input.value;
      if (!input.value.trim()) {
        data.plan[i].done = false;
        data.plan[i].defer = null;
        data.plan[i].deferFrom = null;
        data.plan[i].highlight = false;
        check.classList.remove("is-done");
      }
      syncPlanRowClasses(row, data.plan[i]);
      syncActions();
      persist();
      renderDeferredPanel(getWeekDays(state.currentDate));
    });

    input.addEventListener("dblclick", () => {
      if (data.plan[i].done || data.plan[i].defer) return;
      data.plan[i].highlight = !data.plan[i].highlight;
      syncPlanRowClasses(row, data.plan[i]);
      persist();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        const nextRow = row.nextElementSibling;
        const nextInput = nextRow?.classList.contains("week-hour-row")
          ? nextRow.querySelector(".plan-input")
          : null;
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
        return;
      }
      if (!input.value.trim()) return;
      if (e.key === "ArrowRight" && e.altKey) {
        e.preventDefault();
        if (deferPlanToTomorrow(date, i)) renderWeekly();
      } else if (e.key === "ArrowDown" && e.altKey) {
        e.preventDefault();
        if (deferPlanToday(date, i)) renderWeekly();
      }
    });

    btnTomorrow.addEventListener("click", () => {
      if (deferPlanToTomorrow(date, i)) renderWeekly();
    });

    btnLater.addEventListener("click", () => {
      if (deferPlanToday(date, i)) renderWeekly();
    });

    syncActions();
  });

  const bindSee = (sel, field) => {
    const el = col.querySelector(sel);
    el.addEventListener("input", () => {
      data.see[field] = el.value;
      persist();
    });
  };
  bindSee(".see-missed", "missed");
  bindSee(".see-grateful", "grateful");
  bindSee(".see-summary", "summary");
  bindEnterToNextRow(col.querySelector(".see-fields"), "input[type=text]");
}

function renderSidebarCal(weekDays) {
  const day1 = weekDays[0];
  const year = day1.getFullYear();
  const month = day1.getMonth();
  const weekKeys = new Set(weekDays.map(dateKey));

  els.sidebarCal.innerHTML = buildMiniMonth(year, month, {
    highlightWeek: weekKeys,
    onClick: true,
  });

  els.sidebarCal.querySelectorAll("[data-date]").forEach((el) => {
    const go = () => {
      state.currentDate = parseDate(el.dataset.date);
      renderWeekly();
    };
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  });
}

MOBILE_MQ.addEventListener("change", () => renderWeekly());

function buildMiniMonth(year, month, opts = {}) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const offset = (first.getDay() + 6) % 7;
  const prevLast = new Date(year, month, 0).getDate();
  const cells = [];

  for (let i = 0; i < offset; i++) {
    cells.push({ day: prevLast - offset + i + 1, other: true, date: new Date(year, month - 1, prevLast - offset + i + 1) });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    cells.push({ day: d, other: false, date: new Date(year, month, d) });
  }
  while (cells.length % 7) {
    const d = cells.length - offset - last.getDate() + 1;
    cells.push({ day: d, other: true, date: new Date(year, month + 1, d) });
  }

  const title = `<div class="mini-month-title">${month + 1} ${MONTH_ABBR[month]}</div>`;
  const wd = DOW_MINI.map((w, i) => `<span class="wd${i === 6 ? " sun" : ""}">${w}</span>`).join("");
  const days = cells.map(({ day, other, date: dt }) => {
    const cls = ["d"];
    if (other) cls.push("other");
    if (dt.getDay() === 0 && !other) cls.push("sun");
    if (opts.highlightWeek?.has(dateKey(dt)) && !other) cls.push("current-week");
    if (isToday(dt)) cls.push("is-today");
    const clickable = opts.onClick && !other ? `data-date="${dateKey(dt)}" role="button" tabindex="0"` : "";
    return `<span class="${cls.join(" ")}" ${clickable}>${day}</span>`;
  }).join("");

  return `${title}<div class="mini-month-grid">${wd}${days}</div>`;
}

function escapeAttr(text) {
  return String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

els.btnPrev.addEventListener("click", () => {
  state.currentDate = addDays(state.currentDate, -navStepDays());
  renderWeekly();
});

els.btnNext.addEventListener("click", () => {
  state.currentDate = addDays(state.currentDate, navStepDays());
  renderWeekly();
});

els.btnToday.addEventListener("click", () => {
  state.currentDate = startOfDay(new Date());
  renderWeekly();
});

els.btnCarryToday.addEventListener("click", () => {
  const moved = carryDayIncompleteToTomorrow(startOfDay(new Date()));
  if (moved) renderWeekly();
  else alert("오늘 넘길 미완료 항목이 없거나 내일 칸이 부족합니다.");
});

els.btnCarryWeek.addEventListener("click", () => {
  const weekDays = getWeekDays(state.currentDate);
  const moved = carryWeekIncompleteToNextWeek(weekDays);
  if (moved) renderWeekly();
  else alert("넘길 미완료 항목이 없거나 다음 주 칸이 부족합니다.");
});

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#1a1a1a" : theme === "pastel" ? "#fff8f0" : "#f4f4f5";
  localStorage.setItem(THEME_KEY, theme);
  if (els.themeSelect) els.themeSelect.value = theme;
}

function initTheme() {
  const theme = localStorage.getItem(THEME_KEY) || "minimal";
  applyTheme(theme);
  els.themeSelect?.addEventListener("change", (e) => applyTheme(e.target.value));
}

initTheme();
renderWeekly();

if (els.saveStatus) {
  els.saveStatus.textContent = "저장됨";
  els.saveStatus.className = "save-status save-status-saved";
}

window.__plannerDeps = { getDayData, getHourSlots, dateKey, startOfDay, PLAN_START_HOUR };
