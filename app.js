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
const PLAN_SLOT_MIN = 10;
const PLAN_SLOT_MAX = 28;
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
  btnCopyPanelsWeek: document.getElementById("btnCopyPanelsWeek"),
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
            missed: { text: "", style: null },
            grateful: { text: "", style: null },
            summary: { text: typeof val.see === "string" ? val.see : "", style: null },
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

  if (moved) saveData();
  return moved;
}

function cloneTagItem(item) {
  return {
    text: item.text,
    done: false,
    style: item.style ? MemoStyle.normalizeStyle({ ...item.style }) : null,
  };
}

function cloneHabitItem(habit) {
  return {
    text: habit.text,
    days: Array(7).fill(false),
    style: habit.style ? MemoStyle.normalizeStyle({ ...habit.style }) : null,
  };
}

function weekPanelHasContent(week, panel) {
  if (panel === "work") return week.work.some((item) => item.text.trim());
  if (panel === "life") return week.life.some((item) => item.text.trim());
  return week.habits.some((habit) => habit.text.trim());
}

function panelLabel(panel) {
  return { work: "#WORK", life: "#LIFE", habits: "습관" }[panel] || panel;
}

const plannerDialog = {
  el: null,
  emoji: null,
  title: null,
  message: null,
  actions: null,

  init() {
    this.el = document.getElementById("plannerDialog");
    this.emoji = document.getElementById("plannerDialogEmoji");
    this.title = document.getElementById("plannerDialogTitle");
    this.message = document.getElementById("plannerDialogMessage");
    this.actions = document.getElementById("plannerDialogActions");
  },

  open(text, { title = "알림", emoji = "✿", confirm = false, okLabel = "확인", cancelLabel = "취소" } = {}) {
    if (!this.el) this.init();
    this.emoji.textContent = emoji;
    this.title.textContent = title;
    this.message.innerHTML = text;
    this.actions.innerHTML = confirm
      ? `<button type="button" class="planner-dialog-btn planner-dialog-btn-ghost" data-choice="cancel">${escapeAttr(cancelLabel)}</button>
         <button type="submit" class="planner-dialog-btn planner-dialog-btn-primary" value="ok">${escapeAttr(okLabel)}</button>`
      : `<button type="submit" class="planner-dialog-btn planner-dialog-btn-primary" value="ok">${escapeAttr(okLabel)}</button>`;

    return new Promise((resolve) => {
      const finish = () => {
        this.el.removeEventListener("close", finish);
        resolve(this.el.returnValue === "ok");
      };
      this.el.addEventListener("close", finish);
      this.actions.querySelector('[data-choice="cancel"]')?.addEventListener("click", () => this.el.close("cancel"));
      this.el.showModal();
    });
  },
};

function plannerAlert(text, options = {}) {
  return plannerDialog.open(text, { ...options, confirm: false });
}

function plannerConfirm(text, options = {}) {
  return plannerDialog.open(text, { ...options, confirm: true, title: options.title || "확인할게요" });
}

async function copyWeekPanel(panel, fromDate, toDate) {
  if (weekKey(fromDate) === weekKey(toDate)) {
    return { copied: 0, sameWeek: true, panel };
  }

  const week = getWeekData(fromDate);
  const targetWeek = getWeekData(toDate);
  const label = panelLabel(panel);
  let items;

  if (panel === "work") {
    items = week.work.filter((item) => item.text.trim()).map(cloneTagItem);
  } else if (panel === "life") {
    items = week.life.filter((item) => item.text.trim()).map(cloneTagItem);
  } else {
    items = week.habits.filter((habit) => habit.text.trim()).map(cloneHabitItem);
  }

  if (!items.length) return { copied: 0, panel };

  if (weekPanelHasContent(targetWeek, panel)) {
    const ok = await plannerConfirm(
      `다음 주 <strong>${label}</strong>에 이미 내용이 있어요.<br><br>이번 주 내용으로 덮어쓸까요?<span class="planner-dialog-sub">체크는 새 주처럼 비워져요 · 원본은 그대로</span>`,
      { okLabel: "복사하기", emoji: "📋" },
    );
    if (!ok) return { copied: 0, cancelled: true, panel };
  }

  if (panel === "work") targetWeek.work = normalizeTagList(items);
  else if (panel === "life") targetWeek.life = normalizeTagList(items);
  else targetWeek.habits = normalizeHabits(items);

  saveData();
  return { copied: items.length, panel, label };
}

async function copyWeekPanels(fromDate, toDate) {
  if (weekKey(fromDate) === weekKey(toDate)) {
    return { copied: 0, sameWeek: true };
  }

  const week = getWeekData(fromDate);
  const targetWeek = getWeekData(toDate);
  const workItems = week.work.filter((item) => item.text.trim()).map(cloneTagItem);
  const lifeItems = week.life.filter((item) => item.text.trim()).map(cloneTagItem);
  const habitItems = week.habits.filter((habit) => habit.text.trim()).map(cloneHabitItem);

  if (!workItems.length && !lifeItems.length && !habitItems.length) {
    return { copied: 0 };
  }

  const wouldOverwrite =
    (workItems.length && weekPanelHasContent(targetWeek, "work")) ||
    (lifeItems.length && weekPanelHasContent(targetWeek, "life")) ||
    (habitItems.length && weekPanelHasContent(targetWeek, "habits"));

  if (wouldOverwrite) {
    const ok = await plannerConfirm(
      `다음 주 패널에 이미 내용이 있어요.<br><br>#WORK · #LIFE · 습관을 한 번에 복사할까요?<span class="planner-dialog-sub">체크는 새 주처럼 비워져요 · 원본은 그대로</span>`,
      { okLabel: "전체 복사", emoji: "📋" },
    );
    if (!ok) return { copied: 0, cancelled: true };
  }

  if (workItems.length) targetWeek.work = normalizeTagList(workItems);
  if (lifeItems.length) targetWeek.life = normalizeTagList(lifeItems);
  if (habitItems.length) targetWeek.habits = normalizeHabits(habitItems);
  saveData();

  return {
    copied: workItems.length + lifeItems.length + habitItems.length,
    work: workItems.length,
    life: lifeItems.length,
    habits: habitItems.length,
  };
}

function copyWeekPanelsToNextWeek(weekDays) {
  return copyWeekPanels(state.currentDate, addDays(weekDays[0], 7));
}

function getHourSlots(count = PLAN_SLOT_COUNT) {
  const slotCount = Math.max(PLAN_SLOT_MIN, Math.min(PLAN_SLOT_MAX, count));
  return Array.from({ length: slotCount }, (_, i) => {
    const hour24 = (PLAN_START_HOUR + i) % 24;
    return formatHourDisplay(hour24);
  });
}

function getPlanSlotCount(plan) {
  const len = Array.isArray(plan) ? plan.length : PLAN_SLOT_COUNT;
  return Math.max(PLAN_SLOT_MIN, Math.min(PLAN_SLOT_MAX, len || PLAN_SLOT_COUNT));
}

function syncDayDo(data) {
  const slots = getHourSlots(data.plan.length);
  const nextDo = {};
  for (const s of slots) {
    nextDo[s.key] = data.do?.[s.key] || { cells: ["", "", "", ""], tone: "none" };
  }
  data.do = nextDo;
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

function migratePlanArray(plan, slotCount = PLAN_SLOT_COUNT) {
  const slots = getHourSlots(slotCount);
  const normalized = Array.isArray(plan) ? plan.map(normalizePlanItem) : [];

  if (normalized.length === 24 && slotCount !== 24) {
    return slots.map((s) => normalizePlanItem(normalized[oldPlanIndexForHour(s.hour24)]));
  }

  if (normalized.length === slotCount) return normalized;
  if (normalized.length > slotCount) return normalized.slice(0, slotCount);

  return Array.from({ length: slotCount }, (_, i) => normalized[i] || emptyPlanItem());
}

function emptyDayData() {
  const slots = getHourSlots();
  return {
    plan: slots.map(() => emptyPlanItem()),
    do: Object.fromEntries(slots.map((s) => [s.key, { cells: ["", "", "", ""], tone: "none" }])),
    see: emptySee(),
  };
}

function emptySee() {
  return {
    missed: emptyMemoField(),
    grateful: emptyMemoField(),
    summary: emptyMemoField(),
  };
}

function emptyMemoField() {
  return { text: "", style: null };
}

function normalizeMemoField(val) {
  if (typeof val === "string") return { text: val, style: null };
  if (!val || typeof val !== "object") return emptyMemoField();
  return {
    text: val.text || "",
    style: val.style ? MemoStyle.normalizeStyle(val.style) : null,
  };
}

function normalizeSee(see) {
  if (!see || typeof see !== "object") return emptySee();
  return {
    missed: normalizeMemoField(see.missed),
    grateful: normalizeMemoField(see.grateful),
    summary: normalizeMemoField(see.summary),
  };
}

function emptyWork() {
  return Array.from({ length: TAG_ROWS_MIN }, () => emptyTagItem());
}

function emptyLife() {
  return Array.from({ length: TAG_ROWS_MIN }, () => emptyTagItem());
}

function emptyTagItem() {
  return { text: "", done: false, style: null };
}

function emptyHabits() {
  return Array.from({ length: HABIT_ROWS_MIN }, () => emptyHabitItem());
}

function emptyHabitItem() {
  return { text: "", days: Array(7).fill(false), style: null };
}

function normalizeTagList(list) {
  const items = Array.isArray(list)
    ? list.map((item) => ({
        text: item?.text || "",
        done: !!item?.done,
        style: item?.style ? MemoStyle.normalizeStyle(item.style) : null,
      }))
    : [];
  while (items.length < TAG_ROWS_MIN) items.push(emptyTagItem());
  return items;
}

function isHabitEmpty(habit) {
  return !habit.text.trim() && habit.days.every((d) => !d);
}

function normalizeHabits(list) {
  const items = Array.isArray(list)
    ? list.map((item) => ({
        text: item?.text || "",
        days: Array.from({ length: 7 }, (_, d) => !!item?.days?.[d]),
        style: item?.style ? MemoStyle.normalizeStyle(item.style) : null,
      }))
    : [];
  const hasContent = items.some((habit) => !isHabitEmpty(habit));
  if (hasContent) {
    while (items.length > 0 && isHabitEmpty(items[0])) items.shift();
  }
  while (items.length < HABIT_ROWS_MIN) {
    items.push(emptyHabitItem());
  }
  return items;
}

function addTagRow(type) {
  const week = getWeekData(state.currentDate);
  const list = type === "work" ? week.work : week.life;
  if (list.length >= TAG_ROWS_MAX) return;
  list.push(emptyTagItem());
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

function removeTagRow(type, index) {
  const week = getWeekData(state.currentDate);
  const list = type === "work" ? week.work : week.life;
  if (list.length <= TAG_ROWS_MIN) return false;
  list.splice(index, 1);
  saveData();
  if (type === "work") {
    renderTagList(els.workList, week.work, "work");
    if (els.btnAddWork) els.btnAddWork.disabled = week.work.length >= TAG_ROWS_MAX;
  } else {
    renderTagList(els.lifeList, week.life, "life");
    if (els.btnAddLife) els.btnAddLife.disabled = week.life.length >= TAG_ROWS_MAX;
  }
  updateWeekProgress();
  return true;
}

function addHabitRow() {
  const week = getWeekData(state.currentDate);
  if (week.habits.length >= HABIT_ROWS_MAX) return;
  week.habits.push(emptyHabitItem());
  saveData();
  renderHabitTracker(getWeekDays(state.currentDate), week.habits);
}

function removeHabitRow(index) {
  const week = getWeekData(state.currentDate);
  if (week.habits.length <= HABIT_ROWS_MIN) return false;
  week.habits.splice(index, 1);
  saveData();
  renderHabitTracker(getWeekDays(state.currentDate), week.habits);
  return true;
}

function addPlanRow(date) {
  const data = getDayData(date);
  if (data.plan.length >= PLAN_SLOT_MAX) return false;
  data.plan.push(emptyPlanItem());
  syncDayDo(data);
  saveData();
  return true;
}

function removePlanRow(date, index) {
  const data = getDayData(date);
  if (data.plan.length <= PLAN_SLOT_MIN) return false;
  const slots = getHourSlots(data.plan.length);
  const removedKey = slots[index]?.key;
  data.plan.splice(index, 1);
  if (removedKey && data.do[removedKey]) delete data.do[removedKey];
  syncDayDo(data);
  saveData();
  return true;
}

function getDayData(date) {
  const key = dateKey(date);
  if (!state.data.days[key]) state.data.days[key] = emptyDayData();
  const slotCount = getPlanSlotCount(state.data.days[key].plan);
  state.data.days[key].plan = migratePlanArray(state.data.days[key].plan, slotCount);
  syncDayDo(state.data.days[key]);
  state.data.days[key].see = normalizeSee(state.data.days[key].see);
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
  const see = normalizeSee(data.see);
  const di = date.getDay();
  const slots = getHourSlots(data.plan.length);
  const canRemovePlanRow = data.plan.length > PLAN_SLOT_MIN;
  const canAddPlanRow = data.plan.length < PLAN_SLOT_MAX;
  const headCls = ["week-col-head", di === 6 ? "sat" : "", di === 0 ? "sun" : "", isToday(date) ? "today" : ""].filter(Boolean).join(" ");

  const rows = slots.map((s, i) => {
    const plan = normalizePlanItem(data.plan[i]);
    const rowCls = planRowClasses(plan);
    const periodHtml = s.showPeriod ? `<span class="time-period">${s.period}</span>` : `<span class="time-period"></span>`;
    const timeCell = plan.text.trim()
      ? `<div class="cell-time drag-handle" draggable="true" title="드래그하여 이동"><span class="time-num">${s.num}</span>${periodHtml}</div>`
      : `<div class="cell-time"><span class="time-num">${s.num}</span>${periodHtml}</div>`;
    const delBtn = canRemovePlanRow
      ? `<button type="button" class="row-del-btn plan-row-del" data-plan-index="${i}" aria-label="행 삭제" title="행 삭제">×</button>`
      : "";

    return `
      <div class="${rowCls}" data-index="${i}" data-hour="${s.key}">
        ${timeCell}
        <div class="cell-plan">
          <label class="plan-check-wrap" title="완료">
            <input type="checkbox" class="plan-check planner-check" ${plan.done ? "checked" : ""} aria-label="완료">
          </label>
          <input type="text" class="plan-input" value="${escapeAttr(plan.text)}" title="더블클릭: 강조">
          ${delBtn}
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
      <div class="plan-row-actions">
        <button type="button" class="plan-row-add-btn" data-plan-date="${dateKey(date)}" ${canAddPlanRow ? "" : "disabled"}>+ 행</button>
      </div>
      <footer class="week-col-see">
        <span class="lbl-see">SEE</span>
        <div class="see-fields">
          <label class="see-field"><span class="see-num">1</span><input type="text" class="see-missed" value="${escapeAttr(see.missed.text)}" placeholder="오늘 못한 것"></label>
          <label class="see-field"><span class="see-num">2</span><input type="text" class="see-grateful" value="${escapeAttr(see.grateful.text)}" placeholder="감사한 일"></label>
          <label class="see-field"><span class="see-num">3</span><input type="text" class="see-summary" value="${escapeAttr(see.summary.text)}" placeholder="오늘의 하루"></label>
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

function bindMemoStyle(input, binding) {
  MemoStyle.wrapMemoInput(input, binding);
}

function renderTagList(container, items, type) {
  const canDelete = items.length > TAG_ROWS_MIN;
  container.innerHTML = items.map((item, i) => `
    <li class="tag-item">
      <input type="checkbox" data-type="${type}" data-i="${i}" ${item.done ? "checked" : ""}>
      <input type="text" data-type="${type}" data-i="${i}" value="${escapeAttr(item.text)}">
      <button type="button" class="row-del-btn tag-row-del" data-type="${type}" data-i="${i}" aria-label="행 삭제" title="행 삭제" ${canDelete ? "" : "disabled"}>×</button>
    </li>`).join("");

  container.querySelectorAll("input").forEach((inp) => {
    if (inp.type === "checkbox") {
      inp.addEventListener("change", onTagChange);
      inp.addEventListener("input", onTagChange);
      return;
    }
    const i = Number(inp.dataset.i);
    inp.addEventListener("change", onTagChange);
    inp.addEventListener("input", onTagChange);
    bindMemoStyle(inp, {
      getStyle: () => getWeekData(state.currentDate)[type === "work" ? "work" : "life"][i].style,
      setStyle: (style) => {
        const week = getWeekData(state.currentDate);
        const list = type === "work" ? week.work : week.life;
        list[i].style = style;
      },
      getText: () => inp.value,
      getLabel: () => `${type === "work" ? "#WORK" : "#LIFE"} · ${inp.value.trim() || `행 ${i + 1}`}`,
    });
  });
  container.querySelectorAll(".tag-row-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeTagRow(btn.dataset.type, Number(btn.dataset.i));
    });
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

  const canDeleteHabit = habits.length > HABIT_ROWS_MIN;
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
        <button type="button" class="row-del-btn habit-row-del" data-habit="${hi}" aria-label="행 삭제" title="행 삭제" ${canDeleteHabit ? "" : "disabled"}>×</button>
      </li>`;
  }).join("");

  els.habitTracker.innerHTML = `
    <div class="habit-head">
      <div class="panel-head panel-head-habit">
        <h3 class="tag-head habit-tag-head">습관 트래커</h3>
        <button type="button" class="panel-copy-btn" data-panel="habits" title="이 패널만 다음 주에 복사">다음주 ↗</button>
      </div>
      <div class="habit-days-head">${dayHeaders}</div>
    </div>
    <ul class="habit-list">${rows}</ul>
    <button type="button" class="tag-add-btn habit-add-btn" id="btnAddHabit">+ 행 추가</button>`;

  els.habitTracker.querySelectorAll(".habit-name").forEach((inp) => {
    const hi = Number(inp.dataset.habit);
    inp.addEventListener("input", () => {
      const week = getWeekData(state.currentDate);
      week.habits[hi].text = inp.value;
      persist();
    });
    bindMemoStyle(inp, {
      getStyle: () => getWeekData(state.currentDate).habits[hi].style,
      setStyle: (style) => {
        getWeekData(state.currentDate).habits[hi].style = style;
      },
      getText: () => inp.value,
      getLabel: () => `습관 · ${inp.value.trim() || `행 ${hi + 1}`}`,
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

  els.habitTracker.querySelectorAll(".habit-row-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeHabitRow(Number(btn.dataset.habit));
    });
  });
}

function emptyPlanItem() {
  return { text: "", done: false, highlight: false, defer: null, deferFrom: null, style: null };
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
    style: item.style ? MemoStyle.normalizeStyle(item.style) : null,
  };
}

function formatSlotLabel(dateKeyStr, index) {
  const date = parseDate(dateKeyStr);
  const slot = getHourSlots(getDayData(date).plan.length)[index];
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
  const data = getDayData(date);
  if (index >= data.plan.length - 1) return false;
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

  col.querySelector(".plan-row-add-btn")?.addEventListener("click", () => {
    if (addPlanRow(date)) renderWeekly();
  });

  col.querySelectorAll(".plan-row-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (removePlanRow(date, Number(btn.dataset.planIndex))) renderWeekly();
    });
  });

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
      btnLater.disabled = !hasText || i >= data.plan.length - 1;
    };

    check.addEventListener("change", () => {
      if (!input.value.trim()) {
        check.checked = false;
        return;
      }
      data.plan[i].done = check.checked;
      if (data.plan[i].done) {
        data.plan[i].defer = null;
        data.plan[i].deferFrom = null;
      }
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
        check.checked = false;
      }
      syncPlanRowClasses(row, data.plan[i]);
      syncActions();
      persist();
      renderDeferredPanel(getWeekDays(state.currentDate));
    });

    bindMemoStyle(input, {
      getStyle: () => getDayData(date).plan[i].style,
      setStyle: (style) => {
        getDayData(date).plan[i].style = style;
      },
      getText: () => input.value,
      getLabel: () => {
        const slot = getHourSlots(data.plan.length)[i];
        const period = slot.showPeriod ? ` ${slot.period}` : "";
        return `PLAN · ${DAY_NAMES[date.getDay()]} ${slot.num}${period}`;
      },
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

  const seeLabels = {
    missed: "SEE · 오늘 못한 것",
    grateful: "SEE · 감사한 일",
    summary: "SEE · 오늘의 하루",
  };

  const bindSee = (sel, field) => {
    const el = col.querySelector(sel);
    el.addEventListener("input", () => {
      data.see[field].text = el.value;
      persist();
    });
    bindMemoStyle(el, {
      getStyle: () => getDayData(date).see[field].style,
      setStyle: (style) => {
        getDayData(date).see[field].style = style;
      },
      getText: () => el.value,
      getLabel: () => seeLabels[field],
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

els.btnCarryToday.addEventListener("click", async () => {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const messages = [];

  const planMoved = carryDayIncompleteToTomorrow(today);
  if (planMoved) messages.push(`미완료 일정 ${planMoved}개 → 내일`);

  const panelResult = await copyWeekPanels(today, tomorrow);
  if (panelResult.cancelled) {
    if (planMoved) renderWeekly();
    return;
  }
  if (panelResult.copied) {
    messages.push(`패널 → 다음 주 복사 완료`);
  }

  if (!planMoved && !panelResult.copied) {
    if (panelResult.sameWeek) {
      await plannerAlert("같은 주에는 패널이 함께 쓰여요.<br>미완료 일정이 없으면 할 일이 없어요.", { emoji: "☁️", title: "알림" });
    } else {
      await plannerAlert("복사할 패널 내용이 없어요.", { emoji: "📝", title: "비어 있어요" });
    }
    return;
  }

  renderWeekly();
  await plannerAlert(messages.join("<br>"), { emoji: "✨", title: "완료!" });
});

els.btnCarryWeek.addEventListener("click", () => {
  const weekDays = getWeekDays(state.currentDate);
  const moved = carryWeekIncompleteToNextWeek(weekDays);
  if (moved) renderWeekly();
  else plannerAlert("넘길 미완료 일정이 없거나 다음 주 칸이 부족해요.", { emoji: "📅", title: "일정" });
});

els.btnCopyPanelsWeek?.addEventListener("click", async () => {
  const weekDays = getWeekDays(state.currentDate);
  const result = await copyWeekPanelsToNextWeek(weekDays);
  if (result.cancelled) return;
  if (!result.copied) {
    await plannerAlert("복사할 #WORK, #LIFE, 습관 내용이 없어요.", { emoji: "📝", title: "비어 있어요" });
    return;
  }
  renderWeekly();
  await plannerAlert(
    `다음 주로 복사했어요 <span class="planner-dialog-sub">원본 유지 · 체크 초기화</span><br><br>WORK ${result.work} · LIFE ${result.life} · 습관 ${result.habits}<br>› 버튼으로 다음 주를 확인하세요`,
    { emoji: "🌷", title: "복사 완료" },
  );
});

document.addEventListener("click", async (event) => {
  const btn = event.target.closest(".panel-copy-btn");
  if (!btn) return;

  const panel = btn.dataset.panel;
  if (!panel) return;

  const weekDays = getWeekDays(state.currentDate);
  const result = await copyWeekPanel(panel, state.currentDate, addDays(weekDays[0], 7));
  if (result.cancelled) return;

  if (result.sameWeek) {
    await plannerAlert("같은 주에는 패널이 함께 쓰여요.<br>다음 주로 넘어간 뒤 복사해 주세요.", { emoji: "☁️", title: panelLabel(panel) });
    return;
  }

  if (!result.copied) {
    await plannerAlert(`${panelLabel(panel)}에 복사할 내용이 없어요.`, { emoji: "📝", title: "비어 있어요" });
    return;
  }

  renderWeekly();
  await plannerAlert(
    `<strong>${result.label}</strong> ${result.copied}개를 다음 주로 복사했어요<span class="planner-dialog-sub">원본 유지 · 체크 초기화 · › 로 확인</span>`,
    { emoji: "✿", title: "복사 완료" },
  );
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
plannerDialog.init();
MemoStyle.init({ onPersist: persist });
renderWeekly();

if (els.saveStatus) {
  els.saveStatus.textContent = "저장됨";
  els.saveStatus.className = "save-status save-status-saved";
}

window.__plannerDeps = { getDayData, getHourSlots, dateKey, startOfDay, PLAN_START_HOUR };
