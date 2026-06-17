const STORAGE_KEY = "paper-diary-v1";
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_NAMES_KO = ["일", "월", "화", "수", "목", "금", "토"];
const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

let state = {
  currentDate: startOfDay(new Date()),
  calMonth: startOfMonth(new Date()),
  view: "daily",
  data: loadData(),
};

const els = {
  btnPrev: document.getElementById("btnPrev"),
  btnNext: document.getElementById("btnNext"),
  btnToday: document.getElementById("btnToday"),
  currentLabel: document.getElementById("currentLabel"),
  dayName: document.getElementById("dayName"),
  dayNum: document.getElementById("dayNum"),
  dayHeader: document.getElementById("dayHeader"),
  planList: document.getElementById("planList"),
  timeColumn: document.getElementById("timeColumn"),
  doGrid: document.getElementById("doGrid"),
  seeText: document.getElementById("seeText"),
  dailyView: document.getElementById("dailyView"),
  weeklyView: document.getElementById("weeklyView"),
  weeklyRange: document.getElementById("weeklyRange"),
  weeklyNotes: document.getElementById("weeklyNotes"),
  weeklyGrid: document.getElementById("weeklyGrid"),
  calTitle: document.getElementById("calTitle"),
  calDays: document.getElementById("calDays"),
  calPrev: document.getElementById("calPrev"),
  calNext: document.getElementById("calNext"),
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
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
    return raw ? JSON.parse(raw) : { weeks: {} };
  } catch {
    return { weeks: {} };
  }
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
  let period;

  if (index < 9) period = "am";
  else if (index === 9) period = "pm";
  else if (index < 21) period = "pm";
  else if (index === 21) period = "am";
  else period = "am";

  return { key: String(hour24), num, period, hour24 };
}

function emptyDayData() {
  const slots = getHourSlots();
  return {
    plan: slots.map(() => ({ text: "", done: false })),
    do: Object.fromEntries(slots.map((s) => [s.key, ["", "", "", ""]])),
    see: "",
  };
}

function getDayData(date) {
  const key = dateKey(date);
  if (!state.data[key]) {
    state.data[key] = emptyDayData();
  }
  return state.data[key];
}

function getWeeklyNotes(date) {
  const key = weekKey(date);
  if (!state.data.weeks) state.data.weeks = {};
  if (!state.data.weeks[key]) state.data.weeks[key] = "";
  return state.data.weeks[key];
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
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

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const persist = debounce(saveData, 250);

function renderDaily() {
  const date = state.currentDate;
  const data = getDayData(date);
  const dayIndex = date.getDay();
  const slots = getHourSlots();

  els.dayName.textContent = DAY_NAMES[dayIndex];
  els.dayNum.textContent = date.getDate();

  els.dayHeader.classList.remove("weekend-sat", "weekend-sun");
  if (dayIndex === 6) els.dayHeader.classList.add("weekend-sat");
  if (dayIndex === 0) els.dayHeader.classList.add("weekend-sun");

  els.currentLabel.textContent =
    `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${DAY_NAMES_KO[dayIndex]})`;

  els.timeColumn.innerHTML = slots
    .map(
      (s) => `
      <div class="time-row">
        <span class="time-num">${s.num}</span>
        <span class="time-period">${s.period}</span>
      </div>`
    )
    .join("");

  els.planList.innerHTML = slots
    .map(
      (s, i) => `
      <div class="plan-row${data.plan[i]?.done ? " done" : ""}" data-index="${i}">
        <input type="checkbox" class="plan-check" ${data.plan[i]?.done ? "checked" : ""} aria-label="완료">
        <input type="text" class="plan-input" value="${escapeAttr(data.plan[i]?.text || "")}">
      </div>`
    )
    .join("");

  els.doGrid.innerHTML = slots
    .map((s) => {
      const cells = data.do[s.key] || ["", "", "", ""];
      return `
        <div class="do-row" data-hour="${s.key}">
          <div class="do-hour-label" aria-hidden="true">
            <span>${s.num}</span>
            <span>${s.period}</span>
          </div>
          ${cells
            .map(
              (val, ci) =>
                `<input type="text" class="do-cell" data-col="${ci}" value="${escapeAttr(val)}" aria-label="${s.num}${s.period} ${ci + 1}">`
            )
            .join("")}
        </div>`;
    })
    .join("");

  els.seeText.value = data.see || "";
  bindDailyEvents(date, data);
}

function bindDailyEvents(date, data) {
  const key = dateKey(date);

  els.planList.querySelectorAll(".plan-row").forEach((row) => {
    const i = Number(row.dataset.index);
    const check = row.querySelector(".plan-check");
    const input = row.querySelector(".plan-input");

    check.addEventListener("change", () => {
      data.plan[i].done = check.checked;
      row.classList.toggle("done", check.checked);
      persist();
    });

    input.addEventListener("input", () => {
      data.plan[i].text = input.value;
      persist();
    });
  });

  els.doGrid.querySelectorAll(".do-row").forEach((row) => {
    const hour = row.dataset.hour;
    row.querySelectorAll(".do-cell").forEach((cell) => {
      const col = Number(cell.dataset.col);
      cell.addEventListener("input", () => {
        if (!data.do[hour]) data.do[hour] = ["", "", "", ""];
        data.do[hour][col] = cell.value;
        persist();
      });
    });
  });

  els.seeText.oninput = () => {
    state.data[key].see = els.seeText.value;
    persist();
  };
}

function summarizeDo(data) {
  const parts = [];
  for (const cells of Object.values(data.do || {})) {
    for (const cell of cells) {
      const text = cell.trim();
      if (text) parts.push(text);
    }
  }
  return parts.slice(0, 3).join(" · ");
}

function renderWeekly() {
  const weekDays = getWeekDays(state.currentDate);
  const start = weekDays[0];
  const end = weekDays[6];

  els.weeklyRange.textContent =
    `${start.getFullYear()}.${start.getMonth() + 1}.${start.getDate()} – ${end.getMonth() + 1}.${end.getDate()}`;

  els.weeklyNotes.value = getWeeklyNotes(state.currentDate);
  els.weeklyNotes.oninput = () => {
    state.data.weeks[weekKey(state.currentDate)] = els.weeklyNotes.value;
    persist();
  };

  els.weeklyGrid.innerHTML = weekDays
    .map((day) => {
      const data = getDayData(day);
      const dIdx = day.getDay();
      const todayClass = isToday(day) ? " today" : "";
      const weekendClass = dIdx === 6 ? " sat" : dIdx === 0 ? " sun" : "";

      const planItems = data.plan
        .filter((p) => p.text.trim())
        .slice(0, 5)
        .map(
          (p) =>
            `<div class="week-plan-item${p.done ? " done" : ""}"><span class="week-plan-dot">${p.done ? "✓" : "○"}</span>${escapeHtml(p.text)}</div>`
        )
        .join("");

      const doPreview = summarizeDo(data);
      const seePreview = data.see.trim();

      return `
        <div class="week-day" data-date="${dateKey(day)}" role="button" tabindex="0" aria-label="${DAY_NAMES[dIdx]} ${day.getDate()}일 보기">
          <div class="week-day-header${todayClass}${weekendClass}">${DAY_NAMES[dIdx]} · ${day.getDate()}</div>
          <div class="week-day-body">
            <div class="week-section-label">Plan</div>
            <div class="week-plan-preview">${planItems || '<span class="week-empty">—</span>'}</div>
            <div class="week-section-label">Do</div>
            <div class="week-do-preview">${doPreview ? escapeHtml(doPreview) : '<span class="week-empty">—</span>'}</div>
            <div class="week-section-label">See</div>
            <div class="week-see-preview">${seePreview ? escapeHtml(seePreview) : '<span class="week-empty">—</span>'}</div>
          </div>
        </div>`;
    })
    .join("");

  els.weeklyGrid.querySelectorAll(".week-day").forEach((el) => {
    const openDay = () => {
      state.currentDate = parseDate(el.dataset.date);
      state.calMonth = startOfMonth(state.currentDate);
      setView("daily");
    };
    el.addEventListener("click", openDay);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDay();
      }
    });
  });
}

function renderCalendar() {
  const year = state.calMonth.getFullYear();
  const month = state.calMonth.getMonth();

  els.calTitle.textContent = `${month + 1} ${MONTH_ABBR[month]} '${String(year).slice(2)}`;

  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const currentWeekStart = dateKey(getWeekStart(state.currentDate));
  const rows = [];
  let row = [];

  for (let i = 0; i < startOffset; i++) {
    const day = prevMonthDays - startOffset + i + 1;
    row.push({ day, other: true, date: new Date(year, month - 1, day) });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    row.push({ day: d, other: false, date: new Date(year, month, d) });
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }

  if (row.length) {
    let trailingDay = 1;
    while (row.length < 7) {
      row.push({ day: trailingDay, other: true, date: new Date(year, month + 1, trailingDay) });
      trailingDay += 1;
    }
    rows.push(row);
  }

  let trailingDay = 1;
  if (rows.length) {
    const lastOther = [...rows[rows.length - 1]].reverse().find((c) => c.other);
    if (lastOther) trailingDay = lastOther.day + 1;
  }

  while (rows.length < 6) {
    const weekRow = [];
    for (let i = 0; i < 7; i++) {
      weekRow.push({ day: trailingDay, other: true, date: new Date(year, month + 1, trailingDay) });
      trailingDay += 1;
    }
    rows.push(weekRow);
  }

  els.calDays.innerHTML = rows
    .map((weekRow) => {
      const rowWeekStart = dateKey(getWeekStart(weekRow.find((c) => !c.other)?.date || weekRow[0].date));
      const isCurrentWeek = rowWeekStart === currentWeekStart;
      const rowClass = isCurrentWeek ? "cal-week-row current-week" : "cal-week-row";

      return `<div class="${rowClass}">${weekRow
        .map(({ day, other, date }) => {
          const classes = ["cal-day"];
          if (other) classes.push("other-month");
          if (date.getDay() === 0 && !other) classes.push("sunday");
          if (isToday(date)) classes.push("today");
          if (isSameDay(date, state.currentDate)) classes.push("selected");

          return `<button type="button" class="${classes.join(" ")}" data-date="${dateKey(date)}">${day}</button>`;
        })
        .join("")}</div>`;
    })
    .join("");

  els.calDays.querySelectorAll(".cal-day").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.currentDate = parseDate(btn.dataset.date);
      state.calMonth = startOfMonth(state.currentDate);
      renderAll();
    });
  });
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  els.dailyView.classList.toggle("active", view === "daily");
  els.weeklyView.classList.toggle("active", view === "weekly");
  renderAll();
}

function renderAll() {
  if (state.view === "daily") renderDaily();
  else renderWeekly();
  renderCalendar();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

els.btnPrev.addEventListener("click", () => {
  state.currentDate = addDays(state.currentDate, state.view === "weekly" ? -7 : -1);
  state.calMonth = startOfMonth(state.currentDate);
  renderAll();
});

els.btnNext.addEventListener("click", () => {
  state.currentDate = addDays(state.currentDate, state.view === "weekly" ? 7 : 1);
  state.calMonth = startOfMonth(state.currentDate);
  renderAll();
});

els.btnToday.addEventListener("click", () => {
  state.currentDate = startOfDay(new Date());
  state.calMonth = startOfMonth(state.currentDate);
  renderAll();
});

els.calPrev.addEventListener("click", () => {
  state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1);
  renderCalendar();
});

els.calNext.addEventListener("click", () => {
  state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1);
  renderCalendar();
});

renderAll();
