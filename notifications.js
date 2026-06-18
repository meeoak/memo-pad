const NOTIF_SETTINGS_KEY = "planner-notifications";

const defaultNotifSettings = () => ({
  enabled: false,
  morning: { enabled: true, time: "08:00" },
  evening: { enabled: true, time: "21:00" },
  blockBefore: { enabled: true, minutes: 10 },
});

let notifDeps = null;
let notifSettings = loadNotifSettings();
let notifTimer = null;
let installPrompt = null;

function loadNotifSettings() {
  try {
    const raw = localStorage.getItem(NOTIF_SETTINGS_KEY);
    if (!raw) return defaultNotifSettings();
    return { ...defaultNotifSettings(), ...JSON.parse(raw) };
  } catch {
    return defaultNotifSettings();
  }
}

function saveNotifSettings() {
  localStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify(notifSettings));
}

function iconUrl() {
  return new URL("icons/icon.svg", window.location.href).href;
}

function permissionLabel() {
  if (!("Notification" in window)) return "이 브라우저는 알림을 지원하지 않습니다.";
  if (Notification.permission === "granted") return "알림 허용됨";
  if (Notification.permission === "denied") return "알림이 차단됨 · 브라우저 설정에서 허용해 주세요";
  return "알림 권한이 필요합니다";
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function wasSentToday(id) {
  const key = `${notifDeps.dateKey(new Date())}-${id}`;
  const sent = JSON.parse(sessionStorage.getItem("planner-notif-sent") || "{}");
  return !!sent[key];
}

function markSentToday(id) {
  const key = `${notifDeps.dateKey(new Date())}-${id}`;
  const sent = JSON.parse(sessionStorage.getItem("planner-notif-sent") || "{}");
  sent[key] = true;
  sessionStorage.setItem("planner-notif-sent", JSON.stringify(sent));
}

async function showPlannerNotification(title, body, tag) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const options = {
    body,
    tag,
    icon: iconUrl(),
    badge: iconUrl(),
  };

  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (reg?.showNotification) {
      await reg.showNotification(title, options);
      return;
    }
  }
  new Notification(title, options);
}

function notifyOnce(id, title, body) {
  if (wasSentToday(id)) return;
  markSentToday(id);
  showPlannerNotification(title, body, id);
}

function parseTimeHM(time) {
  const [h, m] = time.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

function isNowAtTime(time) {
  const { h, m } = parseTimeHM(time);
  const now = new Date();
  return now.getHours() === h && now.getMinutes() === m;
}

function getSlotDateTime(plannerDate, index) {
  const slot = notifDeps.getHourSlots()[index];
  const startHour = notifDeps.PLAN_START_HOUR ?? 4;
  const dt = new Date(plannerDate);
  if (slot.hour24 < startHour) dt.setDate(dt.getDate() + 1);
  dt.setHours(slot.hour24, 0, 0, 0);
  return dt;
}

function checkScheduledNotifications() {
  if (!notifSettings.enabled || Notification.permission !== "granted") return;

  const now = new Date();
  const today = notifDeps.startOfDay(now);
  const todayData = notifDeps.getDayData(today);

  if (notifSettings.morning.enabled && isNowAtTime(notifSettings.morning.time)) {
    notifyOnce("morning", "오늘 계획 세우기", "오늘의 PLAN과 WORK 목표를 확인해 보세요.");
  }

  if (notifSettings.evening.enabled && isNowAtTime(notifSettings.evening.time)) {
    notifyOnce("evening", "저녁 회고", "SEE 영역에 오늘 못한 것, 감사한 일, 하루 요약을 적어 보세요.");
  }

  if (!notifSettings.blockBefore.enabled) return;

  const lead = notifSettings.blockBefore.minutes;
  const slots = notifDeps.getHourSlots();

  slots.forEach((slot, index) => {
    const plan = todayData.plan[index];
    if (!plan?.text?.trim() || plan.done) return;

    const slotStart = getSlotDateTime(today, index);
    const notifyAt = new Date(slotStart.getTime() - lead * 60000);
    if (now.getHours() !== notifyAt.getHours() || now.getMinutes() !== notifyAt.getMinutes()) return;

    const period = slot.showPeriod ? ` ${slot.period}` : "";
    const timeLabel = `${slot.num}${period}`;
    notifyOnce(
      `block-${index}`,
      `${timeLabel} 시작 ${lead}분 전`,
      plan.text.trim(),
    );
  });
}

function startNotificationLoop() {
  clearInterval(notifTimer);
  checkScheduledNotifications();
  notifTimer = setInterval(checkScheduledNotifications, 30000);
}

function stopNotificationLoop() {
  clearInterval(notifTimer);
  notifTimer = null;
}

function updateNotifUI() {
  const status = document.getElementById("notifStatus");
  const enableBtn = document.getElementById("btnNotifEnable");
  const master = document.getElementById("notifEnabled");
  const installBtn = document.getElementById("btnInstallPwa");
  const installHint = document.getElementById("pwaInstallHint");

  if (status) status.textContent = permissionLabel();
  if (master) master.checked = notifSettings.enabled;
  if (document.getElementById("notifMorningEnabled")) {
    document.getElementById("notifMorningEnabled").checked = notifSettings.morning.enabled;
    document.getElementById("notifMorningTime").value = notifSettings.morning.time;
    document.getElementById("notifEveningEnabled").checked = notifSettings.evening.enabled;
    document.getElementById("notifEveningTime").value = notifSettings.evening.time;
    document.getElementById("notifBlockEnabled").checked = notifSettings.blockBefore.enabled;
  }

  if (enableBtn) {
    enableBtn.hidden = Notification.permission === "granted";
    enableBtn.disabled = !("Notification" in window) || Notification.permission === "denied";
  }

  if (installBtn) {
    installBtn.hidden = !installPrompt;
  }
  if (installHint) {
    installHint.textContent = installPrompt
      ? "홈 화면에 설치하면 앱처럼 열 수 있습니다."
      : "이미 설치했거나, 브라우저 메뉴에서 ‘앱 설치’를 이용해 주세요.";
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register(new URL("service-worker.js", window.location.href));
  } catch {
    /* GitHub Pages 외 로컬 file:// 등에서는 실패할 수 있음 */
  }
}

function bindNotifDialog() {
  const dialog = document.getElementById("notifDialog");
  const openBtn = document.getElementById("btnNotif");
  const closeBtn = document.getElementById("btnNotifClose");
  const enableBtn = document.getElementById("btnNotifEnable");
  const installBtn = document.getElementById("btnInstallPwa");
  const testBtn = document.getElementById("btnNotifTest");

  openBtn?.addEventListener("click", () => {
    updateNotifUI();
    dialog?.showModal();
  });

  closeBtn?.addEventListener("click", () => dialog?.close());

  enableBtn?.addEventListener("click", async () => {
    const ok = await requestNotificationPermission();
    if (ok) {
      notifSettings.enabled = true;
      saveNotifSettings();
      startNotificationLoop();
    }
    updateNotifUI();
  });

  installBtn?.addEventListener("click", async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    installPrompt = null;
    updateNotifUI();
  });

  testBtn?.addEventListener("click", async () => {
    const ok = await requestNotificationPermission();
    if (!ok) {
      updateNotifUI();
      return;
    }
    await showPlannerNotification("플래너 알림 테스트", "알림이 정상적으로 동작합니다.");
  });

  document.getElementById("notifEnabled")?.addEventListener("change", async (e) => {
    if (e.target.checked) {
      const ok = await requestNotificationPermission();
      if (!ok) {
        e.target.checked = false;
        updateNotifUI();
        return;
      }
    }
    notifSettings.enabled = e.target.checked;
    saveNotifSettings();
    if (notifSettings.enabled) startNotificationLoop();
    else stopNotificationLoop();
    updateNotifUI();
  });

  const bindTime = (enabledId, timeId, bucket) => {
    document.getElementById(enabledId)?.addEventListener("change", (e) => {
      notifSettings[bucket].enabled = e.target.checked;
      saveNotifSettings();
    });
    document.getElementById(timeId)?.addEventListener("change", (e) => {
      notifSettings[bucket].time = e.target.value;
      saveNotifSettings();
    });
  };

  bindTime("notifMorningEnabled", "notifMorningTime", "morning");
  bindTime("notifEveningEnabled", "notifEveningTime", "evening");

  document.getElementById("notifBlockEnabled")?.addEventListener("change", (e) => {
    notifSettings.blockBefore.enabled = e.target.checked;
    saveNotifSettings();
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    updateNotifUI();
  });
}

window.PlannerNotifications = {
  init(deps) {
    notifDeps = deps;
    registerServiceWorker();
    bindNotifDialog();
    updateNotifUI();
    if (notifSettings.enabled && Notification.permission === "granted") {
      startNotificationLoop();
    }
  },
};

if (window.__plannerDeps) {
  PlannerNotifications.init(window.__plannerDeps);
}
