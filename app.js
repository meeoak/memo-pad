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
const LEDGER_ROWS_MIN = 3;
const LEDGER_ROWS_MAX = 10;
const THEME_KEY = "planner-theme";

const LEDGER_OPEN_KEY = "planner-ledger-open";
const PLAN_TRIM_KEY = "planner-plan-trim-21";
const PLAN_FIX_KEY = "planner-plan-fix-v3";

function loadLedgerOpenDates() {
  try {
    const raw = localStorage.getItem(LEDGER_OPEN_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveLedgerOpenDates() {
  localStorage.setItem(LEDGER_OPEN_KEY, JSON.stringify([...ledgerOpenDates]));
}

const ledgerOpenDates = loadLedgerOpenDates();

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
  planSyncCol: document.getElementById("planSyncCol"),
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

function getDaysInYear(year) {
  return new Date(year, 1, 29).getDate() === 29 ? 366 : 365;
}

function getDayOfYear(date) {
  const d = startOfDay(date);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d - jan1) / 86400000) + 1;
}

function getISOWeekNumber(date) {
  const d = startOfDay(date);
  d.setHours(12, 0, 0, 0);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + 3);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const jan4day = (jan4.getDay() + 6) % 7;
  jan4.setDate(jan4.getDate() - jan4day);
  return 1 + Math.round((d - jan4) / 604800000);
}

function getISOWeeksInYear(year) {
  const lastWeek = getISOWeekNumber(new Date(year, 11, 31));
  return lastWeek === 1 ? 52 : lastWeek;
}

function buildCalProgressHTML(date) {
  const year = date.getFullYear();
  const dayOfYear = getDayOfYear(date);
  const daysInYear = getDaysInYear(year);
  const dayPct = Math.min(100, Math.round((dayOfYear / daysInYear) * 1000) / 10);

  const weekNum = getISOWeekNumber(date);
  const weeksInYear = getISOWeeksInYear(year);
  const weekPct = Math.min(100, Math.round((weekNum / weeksInYear) * 1000) / 10);

  return `
    <div class="cal-progress" aria-label="올해 진행">
      <div class="cal-progress-item">
        <div class="cal-progress-head">
          <span class="cal-progress-title">${dayOfYear} / ${daysInYear}일</span>
          <span class="cal-progress-pct">${dayPct}%</span>
        </div>
        <div class="progress-bar cal-progress-bar" role="progressbar" aria-valuenow="${dayOfYear}" aria-valuemin="1" aria-valuemax="${daysInYear}" aria-label="올해 ${dayOfYear}일째">
          <div class="progress-fill cal-progress-fill cal-progress-fill-year" style="width:${dayPct}%"></div>
        </div>
      </div>
      <div class="cal-progress-item">
        <div class="cal-progress-head">
          <span class="cal-progress-title">${weekNum} / ${weeksInYear}주</span>
          <span class="cal-progress-pct">${weekPct}%</span>
        </div>
        <div class="progress-bar cal-progress-bar" role="progressbar" aria-valuenow="${weekNum}" aria-valuemin="1" aria-valuemax="${weeksInYear}" aria-label="올해 ${weekNum}주차">
          <div class="progress-fill cal-progress-fill cal-progress-fill-week" style="width:${weekPct}%"></div>
        </div>
      </div>
    </div>`;
}

function findEmptyPlanSlot(dayData, preferredHour24) {
  const preferredIndex = dayData.plan.findIndex((p) => p.hour24 === preferredHour24);
  if (preferredIndex >= 0 && !dayData.plan[preferredIndex]?.text.trim()) return preferredIndex;
  return dayData.plan.findIndex((p) => !p.text.trim());
}

function carryDayIncompleteToTomorrow(date) {
  const fromData = getDayData(date);
  const toData = getDayData(addDays(date, 1));
  let moved = 0;

  for (let i = 0; i < fromData.plan.length; i++) {
    const item = normalizePlanItem(fromData.plan[i]);
    if (!item.text.trim() || item.done) continue;

    const targetIndex = findEmptyPlanSlot(toData, item.hour24);
    if (targetIndex < 0) continue;

    toData.plan[targetIndex] = {
      text: item.text,
      done: false,
      highlight: item.highlight,
      defer: "tomorrow",
      deferFrom: { date: dateKey(date), index: i },
      hour24: toData.plan[targetIndex].hour24,
      style: item.style,
    };
    fromData.plan[i] = emptyPlanItem(item.hour24);
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

      const targetIndex = findEmptyPlanSlot(toData, item.hour24);
      if (targetIndex < 0) continue;

      toData.plan[targetIndex] = {
        text: item.text,
        done: false,
        highlight: item.highlight,
        defer: "tomorrow",
        deferFrom: { date: dateKey(date), index: i },
        hour24: toData.plan[targetIndex].hour24,
        style: item.style,
      };
      fromData.plan[i] = emptyPlanItem(item.hour24);
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

function planHourSortOrder(hour24) {
  return (hour24 - PLAN_START_HOUR + 24) % 24;
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

function sortPlanByHour(data) {
  data.plan.sort((a, b) => planHourSortOrder(a.hour24) - planHourSortOrder(b.hour24));
}

function migrateLegacyPlanHours(data) {
  const plan = data.plan;
  if (!Array.isArray(plan) || !plan.length) return false;
  if (plan.some((p) => Number.isInteger(normalizePlanItem(p).hour24))) return false;

  const slots = getHourSlots(plan.length);
  data.plan = plan.map((item, i) => normalizePlanItem(item, slots[i]?.hour24));
  const existingHours = new Set(data.plan.map((p) => p.hour24));
  getHourSlots(PLAN_SLOT_COUNT).forEach((s) => {
    if (!existingHours.has(s.hour24)) {
      data.plan.push(emptyPlanItem(s.hour24));
    }
  });
  sortPlanByHour(data);
  return true;
}

function getDefaultPlanHours() {
  return getHourSlots(PLAN_SLOT_COUNT).map((s) => s.hour24);
}

function dedupePlanByHour(data) {
  const byHour = new Map();
  for (const item of data.plan) {
    const p = normalizePlanItem(item);
    if (!Number.isInteger(p.hour24)) continue;
    const prev = byHour.get(p.hour24);
    if (!prev || (!prev.text.trim() && p.text.trim())) {
      byHour.set(p.hour24, normalizePlanItem(p, p.hour24));
    }
  }
  data.plan = [...byHour.values()];
  sortPlanByHour(data);
}

function alignDayPlanToWeek(data, weekHours) {
  dedupePlanByHour(data);
  const byHour = new Map(data.plan.map((p) => [p.hour24, p]));
  data.plan = weekHours.map((hour24) => {
    const item = byHour.get(hour24);
    return item ? normalizePlanItem(item, hour24) : emptyPlanItem(hour24);
  });
}

function getCanonicalWeekHours(days) {
  const hourSet = new Set();
  days.forEach((date) => {
    const data = getDayData(date);
    dedupePlanByHour(data);
    data.plan.forEach((p) => {
      if (Number.isInteger(p.hour24)) hourSet.add(p.hour24);
    });
  });
  if (!hourSet.size) return getDefaultPlanHours();
  return [...hourSet].sort((a, b) => planHourSortOrder(a) - planHourSortOrder(b));
}

function syncWeekPlanHours(days, persistChanges = false) {
  const weekHours = getCanonicalWeekHours(days);
  let changed = false;
  days.forEach((date) => {
    const data = getDayData(date);
    const snapshot = JSON.stringify(data.plan.map((p) => [p.hour24, p.text, p.done]));
    alignDayPlanToWeek(data, weekHours);
    syncDayDo(data);
    if (JSON.stringify(data.plan.map((p) => [p.hour24, p.text, p.done])) !== snapshot) {
      changed = true;
    }
  });
  if (changed && persistChanges) saveData();
  return weekHours;
}

function ensurePlanHours(data) {
  if (!Array.isArray(data.plan) || !data.plan.length) {
    data.plan = getDefaultPlanHours().map((hour24) => emptyPlanItem(hour24));
    return;
  }
  migrateLegacyPlanHours(data);
  data.plan = data.plan.map((item, i) => {
    const normalized = normalizePlanItem(item);
    if (!Number.isInteger(normalized.hour24)) {
      normalized.hour24 = getHourSlots(data.plan.length)[i]?.hour24 ?? PLAN_START_HOUR;
    }
    return normalized;
  });
  dedupePlanByHour(data);
  sortPlanByHour(data);
}

function getPlanSlotViews(data, weekHours = null) {
  if (weekHours) {
    alignDayPlanToWeek(data, weekHours);
  } else {
    ensurePlanHours(data);
  }
  const hours = weekHours || data.plan.map((p) => p.hour24);
  return hours.map((hour24) => {
    const planIndex = data.plan.findIndex((p) => p.hour24 === hour24);
    const item = normalizePlanItem(data.plan[planIndex], hour24);
    const slot = formatHourDisplay(hour24);
    return { ...slot, planIndex, item };
  });
}

function getWeekPlanHours(days) {
  return getCanonicalWeekHours(days);
}

function getNextPlanHour(data) {
  ensurePlanHours(data);
  if (data.plan.length >= PLAN_SLOT_MAX) return null;
  const existing = new Set(data.plan.map((p) => p.hour24));
  for (let order = 0; order < PLAN_SLOT_MAX; order += 1) {
    const hour24 = (PLAN_START_HOUR + order) % 24;
    if (!existing.has(hour24)) return hour24;
  }
  return null;
}

function getNextWeekPlanHour(days) {
  const existing = new Set(getWeekPlanHours(days));
  if (existing.size >= PLAN_SLOT_MAX) return null;
  for (let order = 0; order < PLAN_SLOT_MAX; order += 1) {
    const hour24 = (PLAN_START_HOUR + order) % 24;
    if (!existing.has(hour24)) return hour24;
  }
  return null;
}

function migratePlanTrimToDefault21() {
  if (localStorage.getItem(PLAN_FIX_KEY)) return;
  const defaultHours = getDefaultPlanHours();
  const allowed = new Set(defaultHours);
  let changed = false;
  for (const key of Object.keys(state.data.days)) {
    const day = state.data.days[key];
    if (!Array.isArray(day.plan)) continue;
    dedupePlanByHour(day);
    const byHour = new Map();
    day.plan.forEach((p) => {
      const h = normalizePlanItem(p).hour24;
      if (allowed.has(h) && !byHour.has(h)) byHour.set(h, normalizePlanItem(p, h));
    });
    day.plan = defaultHours.map((hour24) => byHour.get(hour24) || emptyPlanItem(hour24));
    syncDayDo(day);
    changed = true;
  }
  if (changed) saveData();
  localStorage.setItem(PLAN_FIX_KEY, "1");
  localStorage.setItem(PLAN_TRIM_KEY, "1");
}

function syncDayDo(data) {
  ensurePlanHours(data);
  const nextDo = {};
  for (const item of data.plan) {
    const key = String(item.hour24);
    nextDo[key] = data.do?.[key] || { cells: ["", "", "", ""], tone: "none" };
  }
  data.do = nextDo;
}

function formatHourDisplay(hour24) {
  const num = hour24 % 12 || 12;
  const period = hour24 < 12 ? "am" : "pm";
  return { key: String(hour24), num, period, showPeriod: true, hour24 };
}

function oldPlanIndexForHour(hour24) {
  return (hour24 - 3 + 24) % 24;
}

function migratePlanArray(plan, slotCount = PLAN_SLOT_COUNT) {
  const slots = getHourSlots(slotCount);
  const normalized = Array.isArray(plan) ? plan.map(normalizePlanItem) : [];

  if (normalized.length === 24 && slotCount !== 24) {
    return slots.map((s) => normalizePlanItem(normalized[oldPlanIndexForHour(s.hour24)], s.hour24));
  }

  if (normalized.some((p) => Number.isInteger(p.hour24))) {
    return normalized.map((item) => normalizePlanItem(item));
  }

  if (normalized.length === slotCount) {
    return normalized.map((item, i) => normalizePlanItem(item, slots[i].hour24));
  }
  if (normalized.length > slotCount) return normalized.slice(0, slotCount).map((item, i) => normalizePlanItem(item, slots[i]?.hour24));

  return Array.from({ length: slotCount }, (_, i) => normalizePlanItem(normalized[i], slots[i].hour24));
}

function emptyDayData() {
  const slots = getHourSlots(PLAN_SLOT_COUNT);
  return {
    plan: slots.map((s) => emptyPlanItem(s.hour24)),
    do: Object.fromEntries(slots.map((s) => [s.key, { cells: ["", "", "", ""], tone: "none" }])),
    see: emptySee(),
    ledger: emptyLedger(),
  };
}

function emptyLedgerEntry() {
  return { label: "", amount: 0, kind: "expense" };
}

function emptyLedger() {
  return Array.from({ length: LEDGER_ROWS_MIN }, () => emptyLedgerEntry());
}

function normalizeLedgerEntry(entry) {
  if (!entry || typeof entry !== "object") return emptyLedgerEntry();
  const amount = Math.abs(Number(entry.amount) || 0);
  const kind = entry.kind === "income" ? "income" : "expense";
  return { label: entry.label || "", amount, kind };
}

function normalizeLedger(ledger) {
  const list = Array.isArray(ledger) ? ledger.map(normalizeLedgerEntry) : [];
  while (list.length < LEDGER_ROWS_MIN) list.push(emptyLedgerEntry());
  if (list.length > LEDGER_ROWS_MAX) return list.slice(0, LEDGER_ROWS_MAX);
  return list;
}

function parseLedgerAmountInput(raw) {
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

function getLedgerTotals(ledger) {
  let expense = 0;
  let income = 0;
  for (const entry of ledger) {
    const amt = Number(entry.amount) || 0;
    if (!entry.label.trim() && !amt) continue;
    if (entry.kind === "income") income += amt;
    else expense += amt;
  }
  return { expense, income, net: income - expense };
}

function formatWon(amount) {
  return `${Math.abs(amount).toLocaleString("ko-KR")}원`;
}

function formatLedgerHeaderSummary(totals) {
  if (!totals.expense && !totals.income) return "기록 없음";
  const parts = [];
  if (totals.expense) parts.push(`−${formatWon(totals.expense)}`);
  if (totals.income) parts.push(`+${formatWon(totals.income)}`);
  return parts.join(" · ");
}

function isLedgerOpen(date) {
  return ledgerOpenDates.has(dateKey(date));
}

function addLedgerRow(date) {
  const data = getDayData(date);
  if (data.ledger.length >= LEDGER_ROWS_MAX) return false;
  data.ledger.push(emptyLedgerEntry());
  saveData();
  return true;
}

function removeLedgerRow(date, index) {
  const data = getDayData(date);
  if (data.ledger.length <= LEDGER_ROWS_MIN) return false;
  data.ledger.splice(index, 1);
  saveData();
  return true;
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
  const nextHour = getNextPlanHour(data);
  if (nextHour == null) return false;
  data.plan.push(emptyPlanItem(nextHour));
  sortPlanByHour(data);
  syncDayDo(data);
  saveData();
  return true;
}

function removePlanRowByHour(date, hour24) {
  const data = getDayData(date);
  ensurePlanHours(data);
  if (data.plan.length <= PLAN_SLOT_MIN) return false;
  const index = data.plan.findIndex((p) => p.hour24 === hour24);
  if (index < 0) return false;
  const removedKey = String(hour24);
  data.plan.splice(index, 1);
  if (data.do[removedKey]) delete data.do[removedKey];
  syncDayDo(data);
  saveData();
  return true;
}

function removePlanRow(date, planIndex) {
  const data = getDayData(date);
  ensurePlanHours(data);
  const hour24 = data.plan[planIndex]?.hour24;
  if (!Number.isInteger(hour24)) return false;
  return removePlanRowByHour(date, hour24);
}

function addPlanRowsForDays(days) {
  const hour24 = getNextWeekPlanHour(days);
  if (hour24 == null) return false;

  days.forEach((date) => {
    const data = getDayData(date);
    if (data.plan.some((p) => p.hour24 === hour24)) return;
    if (data.plan.length >= PLAN_SLOT_MAX) return;
    data.plan.push(emptyPlanItem(hour24));
    sortPlanByHour(data);
    syncDayDo(data);
  });
  saveData();
  return true;
}

function removePlanRowForDays(days, hour24) {
  const weekHours = getCanonicalWeekHours(days);
  if (weekHours.length <= PLAN_SLOT_MIN) return false;
  let removed = false;
  days.forEach((date) => {
    if (removePlanRowByHour(date, hour24)) removed = true;
  });
  return removed;
}

function buildPlanSyncColumnHTML(days, weekHours) {
  const nextHour = getNextWeekPlanHour(days);
  const nextLabel = nextHour == null ? "" : formatHourDisplay(nextHour);
  const addTitle = nextHour == null
    ? "더 이상 추가할 수 없음"
    : `모든 요일에 ${nextLabel.num} ${nextLabel.period} 행 추가`;
  const canRemove = weekHours.length > PLAN_SLOT_MIN;
  const canAdd = nextHour != null;
  const rows = weekHours.map((hour24) => {
    const slot = formatHourDisplay(hour24);
    return `
    <div class="plan-sync-row" title="${slot.num} ${slot.period} 행 삭제">
      <button type="button" class="row-del-btn plan-sync-del" data-hour="${hour24}" aria-label="${slot.num} ${slot.period} 행 삭제" title="행 삭제" ${canRemove ? "" : "disabled"}>×</button>
    </div>`;
  }).join("");

  return `
    <div class="plan-sync-plan">
      <div class="plan-sync-head">전체</div>
      <div class="plan-sync-label">삭제</div>
      <div class="plan-sync-rows">${rows}</div>
      <div class="plan-sync-actions">
        <button type="button" class="plan-sync-add" ${canAdd ? "" : "disabled"} title="${addTitle}">+ 행 추가</button>
      </div>
    </div>`;
}

function buildLedgerSectionHTML(date, ledger, options = {}) {
  const isOpen = isLedgerOpen(date);
  const totals = getLedgerTotals(ledger);
  const canRemove = ledger.length > LEDGER_ROWS_MIN;
  const canAdd = ledger.length < LEDGER_ROWS_MAX;
  const summary = formatLedgerHeaderSummary(totals);

  const rows = ledger.map((entry, i) => {
    const kindLabel = entry.kind === "income" ? "+" : "−";
    const kindTitle = entry.kind === "income" ? "수입 (클릭하여 지출)" : "지출 (클릭하여 수입)";
    return `
      <div class="ledger-row" data-index="${i}">
        <input type="text" class="ledger-label" value="${escapeAttr(entry.label)}" placeholder="항목" aria-label="항목">
        <button type="button" class="ledger-kind" data-kind="${entry.kind}" title="${kindTitle}" aria-label="${kindTitle}">${kindLabel}</button>
        <input type="text" class="ledger-amount" inputmode="numeric" value="${entry.amount ? entry.amount : ""}" placeholder="0" aria-label="금액">
        <button type="button" class="row-del-btn ledger-row-del" data-index="${i}" aria-label="내역 삭제" title="삭제" ${canRemove ? "" : "disabled"}>×</button>
      </div>`;
  }).join("");

  return `
    <section class="week-col-ledger${isOpen ? " is-open" : ""}">
      <button type="button" class="ledger-toggle" aria-expanded="${isOpen}" title="${isOpen ? "가계부 접기" : "가계부 펼치기"}">
        <span class="lbl-ledger">가계부</span>
        <span class="ledger-summary">${summary}</span>
        <span class="ledger-chevron" aria-hidden="true">▾</span>
      </button>
      <div class="ledger-body">
        <div class="ledger-rows">${rows}</div>
        <button type="button" class="ledger-add-btn" ${canAdd ? "" : "disabled"}>+ 내역</button>
        <div class="ledger-totals">
          <span class="ledger-total-expense">지출 ${formatWon(totals.expense)}</span>
          <span class="ledger-total-income">수입 ${formatWon(totals.income)}</span>
        </div>
      </div>
    </section>`;
}

function updateLedgerUI(col, ledger) {
  const totals = getLedgerTotals(ledger);
  const summaryEl = col.querySelector(".ledger-summary");
  const expenseEl = col.querySelector(".ledger-total-expense");
  const incomeEl = col.querySelector(".ledger-total-income");
  if (summaryEl) summaryEl.textContent = formatLedgerHeaderSummary(totals);
  if (expenseEl) expenseEl.textContent = `지출 ${formatWon(totals.expense)}`;
  if (incomeEl) incomeEl.textContent = `수입 ${formatWon(totals.income)}`;
}

function bindPlanSyncColumn(days) {
  if (!els.planSyncCol) return;
  els.planSyncCol.querySelectorAll(".plan-sync-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (removePlanRowForDays(days, Number(btn.dataset.hour))) renderWeekly();
    });
  });
  els.planSyncCol.querySelector(".plan-sync-add")?.addEventListener("click", () => {
    if (addPlanRowsForDays(days)) renderWeekly();
  });
}

function findPlanByHour(date, hour24) {
  return getDayData(date).plan.find((p) => p.hour24 === hour24);
}

function findPlanIndexByHour(date, hour24) {
  return getDayData(date).plan.findIndex((p) => p.hour24 === hour24);
}

function getDayData(date) {
  const key = dateKey(date);
  if (!state.data.days[key]) state.data.days[key] = emptyDayData();
  const day = state.data.days[key];
  if (!day.plan.some((p) => Number.isInteger(normalizePlanItem(p).hour24))) {
    day.plan = migratePlanArray(day.plan, getPlanSlotCount(day.plan));
  }
  ensurePlanHours(day);
  syncDayDo(day);
  day.see = normalizeSee(day.see);
  day.ledger = normalizeLedger(day.ledger);
  return day;
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

function buildWeekColumnHTML(date, options = {}) {
  const weeklySync = options.weeklySync === true;
  const weekHours = options.weekHours || null;
  const data = getDayData(date);
  const see = normalizeSee(data.see);
  const ledger = normalizeLedger(data.ledger);
  const di = date.getDay();
  const slotViews = getPlanSlotViews(data, weekHours);
  const nextHour = getNextPlanHour(data);
  const canRemovePlanRow = !weeklySync && data.plan.length > PLAN_SLOT_MIN;
  const canAddPlanRow = !weeklySync && nextHour != null;
  const headCls = ["week-col-head", di === 6 ? "sat" : "", di === 0 ? "sun" : "", isToday(date) ? "today" : ""].filter(Boolean).join(" ");

  const rows = slotViews.map(({ planIndex, item, num, period, showPeriod, key }) => {
    const plan = item;
    const rowCls = planRowClasses(plan);
    const periodHtml = `<span class="time-period">${period}</span>`;
    const timeCell = plan.text.trim()
      ? `<div class="cell-time drag-handle" draggable="true" title="드래그하여 이동"><span class="time-num">${num}</span>${periodHtml}</div>`
      : `<div class="cell-time"><span class="time-num">${num}</span>${periodHtml}</div>`;
    const delBtn = canRemovePlanRow
      ? `<button type="button" class="row-del-btn plan-row-del" data-plan-index="${planIndex}" data-hour="${key}" aria-label="행 삭제" title="행 삭제">×</button>`
      : "";

    return `
      <div class="${rowCls}" data-index="${planIndex}" data-hour="${key}">
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
      <div class="week-col-plan">
        <header class="${headCls}">
          <span class="col-head-label">${DAY_NAMES[di]} ${date.getDate()}</span>
          <button type="button" class="col-carry-btn" data-carry-date="${dateKey(date)}" title="이 날 미완료 → 내일">→</button>
        </header>
        <div class="week-col-labels"><span class="lbl-spacer"></span><span class="lbl-plan">PLAN</span></div>
        <div class="week-col-rows">${rows}</div>
        ${weeklySync ? "" : `<div class="plan-row-actions">
          <button type="button" class="plan-row-add-btn" data-plan-date="${dateKey(date)}" ${canAddPlanRow ? "" : "disabled"} title="${canAddPlanRow && nextHour != null ? `${formatHourDisplay(nextHour).num} 행 추가` : "더 이상 추가할 수 없음"}">+ 행</button>
        </div>`}
      </div>
      <div class="week-col-foot">
        ${buildLedgerSectionHTML(date, ledger, { weeklySync })}
        <footer class="week-col-see">
          <span class="lbl-see">SEE</span>
          <div class="see-fields">
            <label class="see-field"><span class="see-num">1</span><input type="text" class="see-missed" value="${escapeAttr(see.missed.text)}" placeholder="오늘 못한 것"></label>
            <label class="see-field"><span class="see-num">2</span><input type="text" class="see-grateful" value="${escapeAttr(see.grateful.text)}" placeholder="감사한 일"></label>
            <label class="see-field"><span class="see-num">3</span><input type="text" class="see-summary" value="${escapeAttr(see.summary.text)}" placeholder="오늘의 하루"></label>
          </div>
        </footer>
      </div>
    </article>`;
}

function renderWeekly() {
  const visibleDays = getVisibleDays(state.currentDate);
  const weekDays = getWeekDays(state.currentDate);
  const week = getWeekData(state.currentDate);

  document.body.classList.toggle("mobile-daily", isMobileView());
  document.body.classList.toggle("weekly-plan-sync", !isMobileView());

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

  const weeklySync = !isMobileView();
  const weekHours = syncWeekPlanHours(weekDays, true);

  if (els.planSyncCol) {
    if (weeklySync) {
      els.planSyncCol.hidden = false;
      els.planSyncCol.innerHTML = buildPlanSyncColumnHTML(weekDays, weekHours);
      bindPlanSyncColumn(weekDays);
    } else {
      els.planSyncCol.hidden = true;
      els.planSyncCol.innerHTML = "";
    }
  }

  els.weeklyColumns.innerHTML = visibleDays.map((date) => buildWeekColumnHTML(date, { weeklySync, weekHours })).join("");

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

function emptyPlanItem(hour24 = null) {
  const item = { text: "", done: false, highlight: false, defer: null, deferFrom: null, style: null };
  if (Number.isInteger(hour24)) item.hour24 = hour24;
  return item;
}

function normalizePlanItem(item, fallbackHour24 = null) {
  if (!item) return emptyPlanItem(fallbackHour24);
  const defer = item.defer === "later" || item.defer === "tomorrow" ? item.defer : null;
  const deferFrom = item.deferFrom?.date && Number.isInteger(item.deferFrom?.index)
    ? { date: item.deferFrom.date, index: item.deferFrom.index }
    : null;
  const hour24 = Number.isInteger(item.hour24) ? item.hour24 : fallbackHour24;
  const normalized = {
    text: item.text || "",
    done: !!item.done,
    highlight: !!item.highlight,
    defer: item.done ? null : defer,
    deferFrom: item.done || !defer ? null : deferFrom,
    style: item.style ? MemoStyle.normalizeStyle(item.style) : null,
  };
  if (Number.isInteger(hour24)) normalized.hour24 = ((hour24 % 24) + 24) % 24;
  return normalized;
}

function formatSlotLabel(dateKeyStr, planIndex) {
  const data = getDayData(parseDate(dateKeyStr));
  ensurePlanHours(data);
  const item = data.plan[planIndex];
  if (!item || !Number.isInteger(item.hour24)) return dateKeyStr;
  const slot = formatHourDisplay(item.hour24);
  const date = parseDate(dateKeyStr);
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
  const toData = getDayData(toDate);
  ensurePlanHours(fromData);
  ensurePlanHours(toData);
  const fromItem = fromData.plan[fromIndex];
  if (!fromItem?.text?.trim()) return false;

  const target = toData.plan[toIndex];
  const moving = {
    text: fromItem.text,
    done: false,
    highlight: fromItem.highlight,
    defer: deferStatus,
    deferFrom: deferStatus ? { date: dateKey(fromDate), index: fromIndex } : null,
    style: fromItem.style,
    hour24: target.hour24,
  };

  if (target.text.trim()) {
    fromData.plan[fromIndex] = {
      ...normalizePlanItem(target),
      hour24: fromItem.hour24,
    };
  } else {
    fromData.plan[fromIndex] = emptyPlanItem(fromItem.hour24);
  }

  toData.plan[toIndex] = moving;
  saveData();
  return true;
}

function deferPlanToTomorrow(date, index) {
  const data = getDayData(date);
  const hour24 = data.plan[index]?.hour24;
  if (!Number.isInteger(hour24)) return false;
  const tomorrow = addDays(date, 1);
  const toIndex = getDayData(tomorrow).plan.findIndex((p) => p.hour24 === hour24);
  if (toIndex < 0) return false;
  return movePlanItem(date, index, tomorrow, toIndex, "tomorrow");
}

function deferPlanToday(date, index) {
  const data = getDayData(date);
  const hour24 = data.plan[index]?.hour24;
  if (!Number.isInteger(hour24)) return false;
  const nextHour = (PLAN_START_HOUR + planHourSortOrder(hour24) + 1) % 24;
  const toIndex = data.plan.findIndex((p) => p.hour24 === nextHour);
  if (toIndex < 0) return false;
  return movePlanItem(date, index, date, toIndex, "later");
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

  bindLedgerEvents(col, date);

  col.querySelectorAll(".week-hour-row").forEach((row) => {
    const hour24 = Number(row.dataset.hour);
    const planItem = () => findPlanByHour(date, hour24);
    const planIndex = () => findPlanIndexByHour(date, hour24);
    const check = row.querySelector(".plan-check");
    const input = row.querySelector(".plan-input");
    const defer = row.querySelector(".plan-defer");
    const btnTomorrow = row.querySelector(".defer-tomorrow");
    const btnLater = row.querySelector(".defer-later");

    const syncActions = () => {
      const hasText = !!input.value.trim();
      const nextHour = Number.isInteger(hour24)
        ? (PLAN_START_HOUR + planHourSortOrder(hour24) + 1) % 24
        : null;
      const dayData = getDayData(date);
      const hasNextHour = nextHour != null && dayData.plan.some((p) => p.hour24 === nextHour);
      row.classList.toggle("has-plan", hasText);
      defer.classList.toggle("has-plan", hasText);
      btnTomorrow.disabled = !hasText;
      btnLater.disabled = !hasText || !hasNextHour;
    };

    check.addEventListener("change", () => {
      const item = planItem();
      if (!item || !input.value.trim()) {
        check.checked = false;
        return;
      }
      item.done = check.checked;
      if (item.done) {
        item.defer = null;
        item.deferFrom = null;
      }
      syncPlanRowClasses(row, item);
      persist();
      updateWeekProgress();
      renderDeferredPanel(getWeekDays(state.currentDate));
    });

    input.addEventListener("input", () => {
      const item = planItem();
      if (!item) return;
      item.text = input.value;
      if (!input.value.trim()) {
        item.done = false;
        item.defer = null;
        item.deferFrom = null;
        item.highlight = false;
        check.checked = false;
      }
      syncPlanRowClasses(row, item);
      syncActions();
      persist();
      renderDeferredPanel(getWeekDays(state.currentDate));
    });

    bindMemoStyle(input, {
      getStyle: () => planItem()?.style ?? null,
      setStyle: (style) => {
        const item = planItem();
        if (item) item.style = style;
      },
      getText: () => input.value,
      getLabel: () => {
        const slot = Number.isInteger(hour24) ? formatHourDisplay(hour24) : null;
        const period = slot?.showPeriod ? ` ${slot.period}` : "";
        return slot
          ? `PLAN · ${DAY_NAMES[date.getDay()]} ${slot.num}${period}`
          : `PLAN · ${DAY_NAMES[date.getDay()]}`;
      },
    });

    input.addEventListener("dblclick", () => {
      const item = planItem();
      if (!item || item.done || item.defer) return;
      item.highlight = !item.highlight;
      syncPlanRowClasses(row, item);
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
      const idx = planIndex();
      if (idx < 0) return;
      if (e.key === "ArrowRight" && e.altKey) {
        e.preventDefault();
        if (deferPlanToTomorrow(date, idx)) renderWeekly();
      } else if (e.key === "ArrowDown" && e.altKey) {
        e.preventDefault();
        if (deferPlanToday(date, idx)) renderWeekly();
      }
    });

    btnTomorrow.addEventListener("click", () => {
      const idx = planIndex();
      if (idx >= 0 && deferPlanToTomorrow(date, idx)) renderWeekly();
    });

    btnLater.addEventListener("click", () => {
      const idx = planIndex();
      if (idx >= 0 && deferPlanToday(date, idx)) renderWeekly();
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

function bindLedgerEvents(col, date) {
  const section = col.querySelector(".week-col-ledger");
  if (!section) return;

  const data = getDayData(date);
  const key = dateKey(date);

  section.querySelector(".ledger-toggle")?.addEventListener("click", () => {
    const open = section.classList.toggle("is-open");
    const toggle = section.querySelector(".ledger-toggle");
    toggle?.setAttribute("aria-expanded", open ? "true" : "false");
    toggle?.setAttribute("title", open ? "가계부 접기" : "가계부 펼치기");
    if (open) ledgerOpenDates.add(key);
    else ledgerOpenDates.delete(key);
    saveLedgerOpenDates();
  });

  section.querySelector(".ledger-add-btn")?.addEventListener("click", () => {
    ledgerOpenDates.add(key);
    saveLedgerOpenDates();
    if (addLedgerRow(date)) renderWeekly();
  });

  section.querySelectorAll(".ledger-row-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (removeLedgerRow(date, Number(btn.dataset.index))) renderWeekly();
    });
  });

  section.querySelectorAll(".ledger-row").forEach((row) => {
    const i = Number(row.dataset.index);
    const labelInput = row.querySelector(".ledger-label");
    const amountInput = row.querySelector(".ledger-amount");
    const kindBtn = row.querySelector(".ledger-kind");

    labelInput.addEventListener("input", () => {
      data.ledger[i].label = labelInput.value;
      persist();
      updateLedgerUI(col, data.ledger);
    });

    amountInput.addEventListener("input", () => {
      data.ledger[i].amount = parseLedgerAmountInput(amountInput.value);
      persist();
      updateLedgerUI(col, data.ledger);
    });

    amountInput.addEventListener("blur", () => {
      const amt = data.ledger[i].amount;
      amountInput.value = amt ? String(amt) : "";
    });

    kindBtn.addEventListener("click", () => {
      const next = data.ledger[i].kind === "income" ? "expense" : "income";
      data.ledger[i].kind = next;
      kindBtn.dataset.kind = next;
      kindBtn.textContent = next === "income" ? "+" : "−";
      kindBtn.title = next === "income" ? "수입 (클릭하여 지출)" : "지출 (클릭하여 수입)";
      persist();
      updateLedgerUI(col, data.ledger);
    });

    labelInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.altKey) return;
      e.preventDefault();
      amountInput.focus();
      amountInput.select();
    });

    amountInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const nextRow = row.nextElementSibling;
      const nextLabel = nextRow?.querySelector(".ledger-label");
      if (nextLabel) {
        nextLabel.focus();
        nextLabel.select();
      }
    });
  });
}

function renderSidebarCal(weekDays) {
  const day1 = weekDays[0];
  const year = day1.getFullYear();
  const month = day1.getMonth();
  const weekKeys = new Set(weekDays.map(dateKey));

  els.sidebarCal.innerHTML =
    buildMiniMonth(year, month, {
      highlightWeek: weekKeys,
      onClick: true,
    }) + buildCalProgressHTML(state.currentDate);

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
migratePlanTrimToDefault21();
renderWeekly();

if (els.saveStatus) {
  els.saveStatus.textContent = "저장됨";
  els.saveStatus.className = "save-status save-status-saved";
}

window.__plannerDeps = { getDayData, getHourSlots, dateKey, startOfDay, PLAN_START_HOUR };
