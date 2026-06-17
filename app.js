const STORAGE_KEY = "planner-v2";
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_NAMES_KO = ["일", "월", "화", "수", "목", "금", "토"];
const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DOW_MINI = ["M", "T", "W", "T", "F", "S", "S"];
const WORK_ROWS = 7;
const LIFE_ROWS = 6;
const TRACKER_ROWS = 4;

let state = {
  currentDate: startOfDay(new Date()),
  view: "daily",
  data: loadData(),
};

const els = {
  btnPrev: document.getElementById("btnPrev"),
  btnNext: document.getElementById("btnNext"),
  btnToday: document.getElementById("btnToday"),
  currentLabel: document.getElementById("currentLabel"),
  dailyView: document.getElementById("dailyView"),
  weeklyView: document.getElementById("weeklyView"),
  monthlyView: document.getElementById("monthlyView"),
  dailyDays: document.getElementById("dailyDays"),
  workList: document.getElementById("workList"),
  lifeList: document.getElementById("lifeList"),
  sidebarCal: document.getElementById("sidebarCal"),
  weeklyColumns: document.getElementById("weeklyColumns"),
  brandYear: document.getElementById("brandYear"),
  brandNum: document.getElementById("brandNum"),
  brandAbbr: document.getElementById("brandAbbr"),
  monthlyLeft: document.getElementById("monthlyLeft"),
  monthlyRight: document.getElementById("monthlyRight"),
  prevMiniMonth: document.getElementById("prevMiniMonth"),
  nextMiniMonth: document.getElementById("nextMiniMonth"),
  trackerLeft: document.getElementById("trackerLeft"),
  trackerRight: document.getElementById("trackerRight"),
};

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date) {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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
          plan: val.plan.map((p) => ({ text: p.text || "", done: !!p.done, highlight: false })),
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
  return { days: {}, weeks: {}, months: {} };
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
    plan: slots.map(() => ({ text: "", done: false, highlight: false })),
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
  return state.data.days[key];
}

function getWeekData(date) {
  const key = weekKey(date);
  if (!state.data.weeks[key]) {
    state.data.weeks[key] = { work: emptyWork(), life: emptyLife(), note: "" };
  }
  return state.data.weeks[key];
}

function getMonthData(date) {
  const key = monthKey(date);
  if (!state.data.months[key]) {
    state.data.months[key] = { notes: {}, tracker: {} };
  }
  return state.data.months[key];
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return startOfDay(d);
}

function addMonths(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth() + n, 1);
  return startOfDay(d);
}

function isSameDay(a, b) {
  return dateKey(a) === dateKey(b);
}

function isToday(date) {
  return isSameDay(date, new Date());
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

function getMonthWeeks(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startOffset = (first.getDay() + 6) % 7;
  const weeks = [];
  let row = [];

  for (let i = 0; i < startOffset; i++) row.push(null);
  for (let d = 1; d <= last.getDate(); d++) {
    row.push(new Date(year, month, d));
    if (row.length === 7) { weeks.push(row); row = []; }
  }
  if (row.length) {
    while (row.length < 7) row.push(null);
    weeks.push(row);
  }
  return weeks;
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
  const d = state.currentDate;
  const di = d.getDay();
  if (state.view === "monthly") {
    els.currentLabel.textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  } else if (state.view === "weekly") {
    const ws = getWeekDays(d);
    els.currentLabel.textContent = `${ws[0].getMonth() + 1}/${ws[0].getDate()} – ${ws[6].getMonth() + 1}/${ws[6].getDate()}`;
  } else {
    const d2 = addDays(d, 1);
    els.currentLabel.textContent =
      `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_NAMES_KO[di]}) – ${d2.getMonth() + 1}월 ${d2.getDate()}일 (${DAY_NAMES_KO[d2.getDay()]})`;
  }
}

function getDailyPair() {
  return [state.currentDate, addDays(state.currentDate, 1)];
}

function buildDayColumnHTML(date) {
  const data = getDayData(date);
  const di = date.getDay();
  const slots = getHourSlots();
  const headerCls = [
    "day-header",
    di === 6 ? "sat" : "",
    di === 0 ? "sun" : "",
    isToday(date) ? "today" : "",
  ].filter(Boolean).join(" ");

  const hourRows = slots.map((s, i) => {
    const plan = data.plan[i] || { text: "", done: false, highlight: false };
    const doData = data.do[s.key] || { cells: ["", "", "", ""], tone: "none" };
    const rowCls = ["hour-row", plan.done ? "plan-done" : "", plan.highlight ? "plan-highlight" : ""].filter(Boolean).join(" ");
    const periodHtml = s.showPeriod ? `<span class="time-period">${s.period}</span>` : `<span class="time-period"></span>`;
    const toneCls = doData.tone !== "none" ? ` tone-${doData.tone}` : "";

    return `
      <div class="${rowCls}" data-index="${i}" data-hour="${s.key}">
        <div class="cell-plan">
          <label class="plan-check-wrap"><input type="checkbox" class="plan-check" ${plan.done ? "checked" : ""}></label>
          <input type="text" class="plan-input" value="${escapeAttr(plan.text)}" title="더블클릭: 강조">
        </div>
        <div class="cell-time"><span class="time-num">${s.num}</span>${periodHtml}</div>
        <div class="cell-do${toneCls}" title="더블클릭: 시간 톤 변경">
          ${doData.cells.map((v, ci) => `<input type="text" class="do-cell" data-col="${ci}" value="${escapeAttr(v)}">`).join("")}
        </div>
      </div>`;
  }).join("");

  return `
    <article class="day-column" data-date="${dateKey(date)}">
      <header class="${headerCls}"><span>${DAY_NAMES[di]}</span> <span>${date.getDate()}</span></header>
      <div class="section-labels"><span class="lbl-plan">PLAN</span><span class="lbl-do">DO</span></div>
      <div class="hour-rows">${hourRows}</div>
      <footer class="see-block">
        <span class="lbl-see">SEE</span>
        <div class="see-fields">
          <label class="see-field"><span class="see-num">1</span><input type="text" class="see-missed" value="${escapeAttr(data.see.missed || "")}" placeholder="오늘 못한 것"></label>
          <label class="see-field"><span class="see-num">2</span><input type="text" class="see-grateful" value="${escapeAttr(data.see.grateful || "")}" placeholder="감사한 일"></label>
          <label class="see-field"><span class="see-num">3</span><input type="text" class="see-summary" value="${escapeAttr(data.see.summary || "")}" placeholder="오늘의 하루"></label>
        </div>
      </footer>
    </article>`;
}

/* ── DAILY ── */
function renderDaily() {
  const [day1, day2] = getDailyPair();
  const week = getWeekData(day1);

  renderTagList(els.workList, week.work, "work");
  renderTagList(els.lifeList, week.life, "life");
  renderSidebarCal(day1, day2);

  els.dailyDays.innerHTML = buildDayColumnHTML(day1) + buildDayColumnHTML(day2);

  els.dailyDays.querySelectorAll(".day-column").forEach((col) => {
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

function bindDayEvents(col, date) {
  const data = getDayData(date);

  col.querySelectorAll(".hour-row").forEach((row) => {
    const i = Number(row.dataset.index);
    const hour = row.dataset.hour;
    const check = row.querySelector(".plan-check");
    const input = row.querySelector(".plan-input");
    const doEl = row.querySelector(".cell-do");

    check.addEventListener("change", () => {
      data.plan[i].done = check.checked;
      row.classList.toggle("plan-done", check.checked);
      persist();
    });

    input.addEventListener("input", () => {
      data.plan[i].text = input.value;
      persist();
    });

    input.addEventListener("dblclick", () => {
      data.plan[i].highlight = !data.plan[i].highlight;
      row.classList.toggle("plan-highlight", data.plan[i].highlight);
      persist();
    });

    doEl.addEventListener("dblclick", (e) => {
      if (e.target.classList.contains("do-cell")) return;
      const tones = ["none", "active", "sleep"];
      const cur = data.do[hour].tone || "none";
      const next = tones[(tones.indexOf(cur) + 1) % tones.length];
      data.do[hour].tone = next;
      doEl.classList.remove("tone-active", "tone-sleep");
      if (next !== "none") doEl.classList.add(`tone-${next}`);
      persist();
    });

    row.querySelectorAll(".do-cell").forEach((cell) => {
      const ci = Number(cell.dataset.col);
      cell.addEventListener("input", () => {
        data.do[hour].cells[ci] = cell.value;
        if (cell.value.trim() && data.do[hour].tone === "none") {
          data.do[hour].tone = "active";
          doEl.classList.add("tone-active");
        }
        persist();
      });
    });
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

function renderSidebarCal(day1, day2) {
  const year = day1.getFullYear();
  const month = day1.getMonth();
  const weekDays = getWeekDays(day1);
  const weekKeys = new Set(weekDays.map(dateKey));
  const selected = new Set([dateKey(day1), dateKey(day2)]);

  els.sidebarCal.innerHTML = buildMiniMonth(year, month, {
    highlightWeek: weekKeys,
    selectedSet: selected,
    onClick: true,
  });

  els.sidebarCal.querySelectorAll("[data-date]").forEach((el) => {
    const go = () => { state.currentDate = parseDate(el.dataset.date); renderAll(); };
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

  const title = `<div class="mini-month-title">${month + 1} <span class="${month === 0 ? '' : ''}">${MONTH_ABBR[month]}</span></div>`;
  const wd = DOW_MINI.map((w, i) => `<span class="wd${i === 6 ? " sun" : ""}">${w}</span>`).join("");
  const days = cells.map(({ day, other, date: dt }) => {
    const cls = ["d"];
    if (other) cls.push("other");
    if (dt.getDay() === 0 && !other) cls.push("sun");
    if (opts.highlightWeek?.has(dateKey(dt)) && !other) cls.push("current-week");
    if (opts.selected === dateKey(dt) || opts.selectedSet?.has(dateKey(dt))) cls.push("selected");
    const clickable = opts.onClick && !other ? `data-date="${dateKey(dt)}" role="button" tabindex="0"` : "";
    return `<span class="${cls.join(" ")}" ${clickable}>${day}</span>`;
  }).join("");

  return `${title}<div class="mini-month-grid">${wd}${days}</div>`;
}

/* ── WEEKLY ── */
function renderWeekly() {
  const weekDays = getWeekDays(state.currentDate);
  const slots = getHourSlots();

  els.weeklyColumns.innerHTML = weekDays.map((day) => {
    const data = getDayData(day);
    const di = day.getDay();
    const headCls = ["week-col-head", di === 6 ? "sat" : "", di === 0 ? "sun" : "", isToday(day) ? "today" : ""].filter(Boolean).join(" ");

    const rows = slots.map((s, i) => {
      const plan = data.plan[i] || { text: "", done: false, highlight: false };
      const doData = data.do[s.key] || { cells: ["", "", "", ""], tone: "none" };
      const dotCls = ["plan-dot", plan.done ? "done" : "", plan.highlight ? "highlight" : ""].filter(Boolean).join(" ");
      const period = s.showPeriod ? `<span>${s.period}</span>` : "";
      const blocks = doData.cells.map((c, ci) => {
        const tone = c.trim() ? doData.tone : "none";
        return `<div class="do-block${tone !== "none" ? ` tone-${tone}` : ""}" title="${escapeAttr(c)}"></div>`;
      }).join("");

      return `
        <div class="week-hour-row">
          <div class="cell-plan"><span class="${dotCls}"></span><span class="plan-text">${escapeHtml(plan.text)}</span></div>
          <div class="cell-time"><span>${s.num}</span>${period}</div>
          <div class="cell-do">${blocks}</div>
        </div>`;
    }).join("");

    const seeText = [data.see.missed, data.see.grateful, data.see.summary].filter(Boolean).join(" · ");

    return `
      <div class="week-col" data-date="${dateKey(day)}">
        <div class="${headCls}">${DAY_NAMES[di]} ${day.getDate()}</div>
        <div class="week-col-labels"><span>PLAN</span><span class="lbl-do">DO</span></div>
        <div class="week-col-rows">${rows}</div>
        <div class="week-col-see">${seeText ? escapeHtml(seeText) : "—"}</div>
      </div>`;
  }).join("");

  els.weeklyColumns.querySelectorAll(".week-col").forEach((col) => {
    col.addEventListener("click", (e) => {
      if (e.target.closest(".week-col-rows")) return;
      state.currentDate = parseDate(col.dataset.date);
      setView("daily");
    });
  });

  updateLabel();
}

/* ── MONTHLY ── */
function renderMonthly() {
  const d = state.currentDate;
  const year = d.getFullYear();
  const month = d.getMonth();
  const monthData = getMonthData(d);
  const weeks = getMonthWeeks(year, month);

  els.brandYear.textContent = year;
  els.brandNum.textContent = month + 1;
  els.brandAbbr.textContent = MONTH_ABBR[month];

  els.monthlyLeft.innerHTML = weeks.map((week) => {
    const cells = [0, 1, 2].map((i) => renderMonthCell(week[i], monthData));
    return `<div class="month-week-row left">${cells.join("")}</div>`;
  }).join("");

  els.monthlyRight.innerHTML = weeks.map((week) => {
    const cells = [3, 4, 5, 6].map((i) => renderMonthCell(week[i], monthData));
    return `<div class="month-week-row right">${cells.join("")}</div>`;
  }).join("");

  const prevM = new Date(year, month - 1, 1);
  const nextM = new Date(year, month + 1, 1);
  els.prevMiniMonth.innerHTML = buildMiniMonth(prevM.getFullYear(), prevM.getMonth());
  els.nextMiniMonth.innerHTML = buildMiniMonth(nextM.getFullYear(), nextM.getMonth());

  renderTracker(month, monthData);
  bindMonthlyEvents(monthData);
  updateLabel();
}

function renderMonthCell(date, monthData) {
  if (!date) return `<div class="month-cell empty"></div>`;
  const key = dateKey(date);
  const di = date.getDay();
  const cls = ["month-cell"];
  if (di === 6) cls.push("sat");
  if (di === 0) cls.push("sun");
  if (isToday(date)) cls.push("today");
  if (isSameDay(date, state.currentDate)) cls.push("selected");
  const note = monthData.notes[key] || "";

  return `
    <div class="${cls.join(" ")}" data-date="${key}">
      <div class="cell-date-bar"><span class="cell-date-num">${date.getDate()}</span></div>
      <div class="cell-grid-area">
        <textarea class="cell-note" data-date="${key}" rows="2">${escapeHtml(note)}</textarea>
      </div>
    </div>`;
}

function renderTracker(month, monthData) {
  const year = state.currentDate.getFullYear();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leftDays = [];
  const rightDays = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    const entry = { d, dow: DAY_NAMES[dt.getDay()], di: dt.getDay(), key: dateKey(dt) };
    if (d <= 15) leftDays.push(entry);
    else rightDays.push(entry);
  }

  els.trackerLeft.innerHTML = buildTrackerHalf(leftDays, monthData);
  els.trackerRight.innerHTML = buildTrackerHalf(rightDays, monthData);
}

function buildTrackerHalf(days, monthData) {
  if (!days.length) return "";
  const nums = days.map((d) => `<span class="td-num${d.di === 0 ? " sun" : d.di === 6 ? " sat" : ""}">${d.d}</span>`).join("");
  const dows = days.map((d) => `<span class="td-dow${d.di === 0 ? " sun" : d.di === 6 ? " sat" : ""}">${d.dow.slice(0, 3)}</span>`).join("");
  const cols = days.length;

  let grid = "";
  for (let r = 0; r < TRACKER_ROWS; r++) {
    grid += `<div class="tracker-row" style="grid-template-columns:repeat(${cols},1fr)">`;
    for (const d of days) {
      const tKey = `${d.key}-${r}`;
      const checked = monthData.tracker[tKey] ? " checked" : "";
      grid += `<div class="tracker-cell${checked}" data-track="${tKey}"></div>`;
    }
    grid += `</div>`;
  }

  return `
    <div class="tracker-days" style="grid-template-columns:repeat(${cols},1fr)">${nums}</div>
    <div class="tracker-days" style="grid-template-columns:repeat(${cols},1fr)">${dows}</div>
    <div class="tracker-grid">${grid}</div>`;
}

function bindMonthlyEvents(monthData) {
  document.querySelectorAll(".month-cell:not(.empty)").forEach((cell) => {
    cell.addEventListener("click", (e) => {
      if (e.target.classList.contains("cell-note")) return;
      state.currentDate = parseDate(cell.dataset.date);
      setView("daily");
    });
  });

  document.querySelectorAll(".cell-note").forEach((ta) => {
    ta.addEventListener("click", (e) => e.stopPropagation());
    ta.addEventListener("input", () => {
      monthData.notes[ta.dataset.date] = ta.value;
      persist();
    });
  });

  document.querySelectorAll(".tracker-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const k = cell.dataset.track;
      monthData.tracker[k] = !monthData.tracker[k];
      cell.classList.toggle("checked", monthData.tracker[k]);
      persist();
    });
  });
}

/* ── Navigation ── */
function setView(view) {
  state.view = view;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  els.monthlyView.classList.toggle("active", view === "monthly");
  els.weeklyView.classList.toggle("active", view === "weekly");
  els.dailyView.classList.toggle("active", view === "daily");
  renderAll();
}

function renderAll() {
  if (state.view === "monthly") renderMonthly();
  else if (state.view === "weekly") renderWeekly();
  else renderDaily();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

els.btnPrev.addEventListener("click", () => {
  if (state.view === "monthly") state.currentDate = addMonths(state.currentDate, -1);
  else if (state.view === "weekly") state.currentDate = addDays(state.currentDate, -7);
  else state.currentDate = addDays(state.currentDate, -2);
  renderAll();
});

els.btnNext.addEventListener("click", () => {
  if (state.view === "monthly") state.currentDate = addMonths(state.currentDate, 1);
  else if (state.view === "weekly") state.currentDate = addDays(state.currentDate, 7);
  else state.currentDate = addDays(state.currentDate, 2);
  renderAll();
});

els.btnToday.addEventListener("click", () => {
  state.currentDate = startOfDay(new Date());
  renderAll();
});

renderAll();
