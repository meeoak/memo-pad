const STORAGE_KEY = "planner-v2";
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DOW_MINI = ["M", "T", "W", "T", "F", "S", "S"];
const WORK_ROWS = 5;
const LIFE_ROWS = 5;

let state = {
  currentDate: startOfDay(new Date()),
  data: loadData(),
};

const els = {
  btnPrev: document.getElementById("btnPrev"),
  btnNext: document.getElementById("btnNext"),
  btnToday: document.getElementById("btnToday"),
  currentLabel: document.getElementById("currentLabel"),
  workList: document.getElementById("workList"),
  lifeList: document.getElementById("lifeList"),
  sidebarCal: document.getElementById("sidebarCal"),
  weeklyColumns: document.getElementById("weeklyColumns"),
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
          if (typeof note === "string") store.weeks[wk] = { work: emptyWork(), life: emptyLife(), note };
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
}

function getHourSlots() {
  const slots = [];
  for (let i = 0; i < 24; i++) {
    const hour24 = (3 + i) % 24;
    slots.push(formatHourDisplay(hour24, i));
  }
  return slots;
}

function formatHourDisplay(hour24, index) {
  const num = hour24 % 12 || 12;
  let period = "";
  let showPeriod = false;
  if (index === 0) { period = "am"; showPeriod = true; }
  else if (index === 9) { period = "pm"; showPeriod = true; }
  else if (index === 21) { period = "am"; showPeriod = true; }
  return { key: String(hour24), num, period, showPeriod, hour24 };
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
  return Array.from({ length: WORK_ROWS }, () => ({ text: "", done: false }));
}

function emptyLife() {
  return Array.from({ length: LIFE_ROWS }, () => ({ text: "", done: false }));
}

function getDayData(date) {
  const key = dateKey(date);
  if (!state.data.days[key]) state.data.days[key] = emptyDayData();
  state.data.days[key].plan = state.data.days[key].plan.map(normalizePlanItem);
  return state.data.days[key];
}

function normalizeTagList(list, length) {
  return Array.from({ length }, (_, i) => {
    const item = list?.[i];
    return item ? { text: item.text || "", done: !!item.done } : { text: "", done: false };
  });
}

function getWeekData(date) {
  const key = weekKey(date);
  if (!state.data.weeks[key]) {
    state.data.weeks[key] = { work: emptyWork(), life: emptyLife(), note: "" };
  }
  const week = state.data.weeks[key];
  week.work = normalizeTagList(week.work, WORK_ROWS);
  week.life = normalizeTagList(week.life, LIFE_ROWS);
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

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const persist = debounce(saveData, 250);

function updateLabel() {
  const ws = getWeekDays(state.currentDate);
  els.currentLabel.textContent =
    `${ws[0].getFullYear()}년 ${ws[0].getMonth() + 1}/${ws[0].getDate()} – ${ws[6].getMonth() + 1}/${ws[6].getDate()}`;
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

    return `
      <div class="${rowCls}" data-index="${i}" data-hour="${s.key}">
        <div class="cell-time"><span class="time-num">${s.num}</span>${periodHtml}</div>
        <div class="cell-plan">
          <button type="button" class="plan-check${plan.done ? " is-done" : ""}" aria-label="완료" title="완료">✓</button>
          <input type="text" class="plan-input" value="${escapeAttr(plan.text)}" title="더블클릭: 강조">
          <div class="plan-defer${plan.text?.trim() ? " has-plan" : ""}" title="→ 내일 · ↓ 미루기">
            <button type="button" class="defer-btn defer-tomorrow" aria-label="내일 같은 시간">→</button>
            <button type="button" class="defer-btn defer-later" aria-label="한 시간 미루기">↓</button>
          </div>
        </div>
      </div>`;
  }).join("");

  return `
    <article class="week-col" data-date="${dateKey(date)}">
      <header class="${headCls}">${DAY_NAMES[di]} ${date.getDate()}</header>
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
  const weekDays = getWeekDays(state.currentDate);
  const week = getWeekData(state.currentDate);

  renderTagList(els.workList, week.work, "work");
  renderTagList(els.lifeList, week.life, "life");
  renderSidebarCal(weekDays);

  els.weeklyColumns.innerHTML = weekDays.map(buildWeekColumnHTML).join("");

  els.weeklyColumns.querySelectorAll(".week-col").forEach((col) => {
    bindDayEvents(col, parseDate(col.dataset.date));
  });

  updateLabel();
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
}

function onTagChange(e) {
  const week = getWeekData(state.currentDate);
  const type = e.target.dataset.type;
  const i = Number(e.target.dataset.i);
  const list = type === "work" ? week.work : week.life;
  if (e.target.type === "checkbox") list[i].done = e.target.checked;
  else list[i].text = e.target.value;
  persist();
}

function emptyPlanItem() {
  return { text: "", done: false, highlight: false, defer: null };
}

function normalizePlanItem(item) {
  if (!item) return emptyPlanItem();
  const defer = item.defer === "later" || item.defer === "tomorrow" ? item.defer : null;
  return {
    text: item.text || "",
    done: !!item.done,
    highlight: !!item.highlight,
    defer: item.done ? null : defer,
  };
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
  const moving = { text: item.text, done: false, highlight: item.highlight, defer: deferStatus };

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
      if (data.plan[i].done) data.plan[i].defer = null;
      check.classList.toggle("is-done", data.plan[i].done);
      syncPlanRowClasses(row, data.plan[i]);
      persist();
    });

    input.addEventListener("input", () => {
      data.plan[i].text = input.value;
      if (!input.value.trim()) {
        data.plan[i].done = false;
        data.plan[i].defer = null;
        data.plan[i].highlight = false;
        check.classList.remove("is-done");
      }
      syncPlanRowClasses(row, data.plan[i]);
      syncActions();
      persist();
    });

    input.addEventListener("dblclick", () => {
      if (data.plan[i].done || data.plan[i].defer) return;
      data.plan[i].highlight = !data.plan[i].highlight;
      syncPlanRowClasses(row, data.plan[i]);
      persist();
    });

    input.addEventListener("keydown", (e) => {
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
  state.currentDate = addDays(state.currentDate, -7);
  renderWeekly();
});

els.btnNext.addEventListener("click", () => {
  state.currentDate = addDays(state.currentDate, 7);
  renderWeekly();
});

els.btnToday.addEventListener("click", () => {
  state.currentDate = startOfDay(new Date());
  renderWeekly();
});

renderWeekly();
