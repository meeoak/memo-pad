(function () {
  const PREF_KEY = "planner-memo-style-pref";

  const PEN_TYPES = [
    { id: "pencil", label: "연필", icon: "✏️" },
    { id: "ballpoint", label: "볼펜", icon: "🖊️" },
    { id: "highlighter", label: "형광펜", icon: "🖍️" },
  ];

  const COLOR_PALETTE = [
    "#222222", "#1565c0", "#2e7d32", "#c62828", "#6a1b9a",
    "#ef6c00", "#00838f", "#ad1457", "#5d4037", "#fdd835",
  ];

  const FONTS = [
    { id: "default", label: "기본", family: "inherit", group: "기본" },
    { id: "gaegu", label: "개구", family: "'Gaegu', cursive", group: "손글씨" },
    { id: "hi-melody", label: "하이멜로디", family: "'Hi Melody', cursive", group: "손글씨" },
    { id: "poor-story", label: "Poor Story", family: "'Poor Story', cursive", group: "손글씨" },
    { id: "single-day", label: "싱글데이", family: "'Single Day', cursive", group: "손글씨" },
    { id: "dongle", label: "동글", family: "'Dongle', sans-serif", group: "손글씨" },
    { id: "gamja-flower", label: "감자꽃", family: "'Gamja Flower', cursive", group: "귀여운" },
    { id: "jua", label: "주아", family: "'Jua', sans-serif", group: "귀여운" },
  ];

  const DEFAULT_STYLE = {
    pen: "ballpoint",
    weight: 2,
    color: "#222222",
    font: "default",
  };

  let panel = null;
  let preview = null;
  let activeBinding = null;
  let currentStyle = { ...DEFAULT_STYLE };
  let onPersist = null;

  function loadPref() {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (raw) return normalizeStyle(JSON.parse(raw));
    } catch { /* ignore */ }
    return { ...DEFAULT_STYLE };
  }

  function savePref(style) {
    localStorage.setItem(PREF_KEY, JSON.stringify(normalizeStyle(style)));
  }

  function normalizeStyle(style) {
    const s = style && typeof style === "object" ? style : {};
    const pen = PEN_TYPES.some((p) => p.id === s.pen) ? s.pen : DEFAULT_STYLE.pen;
    const font = FONTS.some((f) => f.id === s.font) ? s.font : DEFAULT_STYLE.font;
    const weight = Number.isFinite(Number(s.weight))
      ? Math.min(5, Math.max(1, Math.round(Number(s.weight))))
      : DEFAULT_STYLE.weight;
    const color = typeof s.color === "string" && /^#[0-9a-fA-F]{6}$/.test(s.color)
      ? s.color
      : DEFAULT_STYLE.color;
    return { pen, weight, color, font };
  }

  function resolveStyle(style) {
    return style ? normalizeStyle(style) : loadPref();
  }

  function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function fontFamily(fontId) {
    return FONTS.find((f) => f.id === fontId)?.family || "inherit";
  }

  function styleToCss(style) {
    const s = normalizeStyle(style);
    const baseRem = 0.72;
    const sizeRem = baseRem + (s.weight - 2) * 0.04;
    const css = {
      fontFamily: fontFamily(s.font),
      fontSize: `${sizeRem}rem`,
    };

    if (s.pen === "highlighter") {
      css.color = s.color;
      css.backgroundColor = hexToRgba(s.color, 0.32);
      css.borderRadius = "2px";
      css.textShadow = "none";
    } else if (s.pen === "pencil") {
      css.color = hexToRgba(s.color, 0.72);
      css.fontWeight = s.weight >= 4 ? "500" : "400";
      css.textShadow = `0 0.4px 0 ${hexToRgba(s.color, 0.25)}`;
    } else {
      css.color = s.color;
      css.fontWeight = s.weight >= 4 ? "600" : s.weight <= 2 ? "400" : "500";
    }

    return css;
  }

  function applyStyleToInput(input, style) {
    if (!input) return;
    const s = resolveStyle(style);
    const css = styleToCss(s);
    input.style.fontFamily = css.fontFamily;
    input.style.fontSize = css.fontSize;
    input.style.color = css.color;
    input.style.fontWeight = css.fontWeight || "";
    input.style.textShadow = css.textShadow || "";
    input.style.backgroundColor = css.backgroundColor || "";
    input.style.borderRadius = css.borderRadius || "";
    input.dataset.memoPen = s.pen;
    input.classList.add("memo-styled");
  }

  function buildPanel() {
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "memoStylePanel";
    panel.className = "memo-style-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <header class="memo-style-head">
        <span class="memo-style-title">꾸미기</span>
        <button type="button" class="memo-style-close" aria-label="닫기">×</button>
      </header>
      <div class="memo-style-preview-wrap">
        <span class="memo-style-preview" id="memoStylePreview">미리보기 — 오늘의 메모</span>
      </div>
      <div class="memo-style-body">
        <details class="memo-style-section" open>
          <summary>펜</summary>
          <div class="memo-pen-group" id="memoPenGroup"></div>
        </details>
        <details class="memo-style-section" open>
          <summary>굵기 · 색상</summary>
          <label class="memo-weight-label">
            굵기 <output id="memoWeightOut">2</output>
            <input type="range" id="memoWeight" min="1" max="5" step="1" value="2">
          </label>
          <div class="memo-color-group" id="memoColorGroup"></div>
          <label class="memo-custom-color">
            <span>커스텀</span>
            <input type="color" id="memoCustomColor" value="#222222">
          </label>
        </details>
        <details class="memo-style-section" open>
          <summary>서체</summary>
          <select id="memoFontSelect" class="memo-font-select"></select>
        </details>
      </div>`;

    document.body.appendChild(panel);

    preview = panel.querySelector("#memoStylePreview");
    const penGroup = panel.querySelector("#memoPenGroup");
    PEN_TYPES.forEach((pen) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "memo-pen-btn";
      btn.dataset.pen = pen.id;
      btn.title = pen.label;
      btn.innerHTML = `<span class="memo-pen-icon">${pen.icon}</span><span class="memo-pen-label">${pen.label}</span>`;
      btn.addEventListener("click", () => setPen(pen.id));
      penGroup.appendChild(btn);
    });

    const colorGroup = panel.querySelector("#memoColorGroup");
    COLOR_PALETTE.forEach((color) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "memo-color-swatch";
      btn.dataset.color = color;
      btn.style.backgroundColor = color;
      btn.title = color;
      btn.addEventListener("click", () => setColor(color));
      colorGroup.appendChild(btn);
    });

    const fontSelect = panel.querySelector("#memoFontSelect");
    let lastGroup = "";
    FONTS.forEach((font) => {
      if (font.group !== lastGroup) {
        const og = document.createElement("optgroup");
        og.label = font.group;
        og.dataset.group = font.group;
        fontSelect.appendChild(og);
        lastGroup = font.group;
      }
      const opt = document.createElement("option");
      opt.value = font.id;
      opt.textContent = font.label;
      fontSelect.querySelector(`optgroup[data-group="${font.group}"]`).appendChild(opt);
    });

    panel.querySelector(".memo-style-close").addEventListener("click", closePanel);
    panel.querySelector("#memoWeight").addEventListener("input", (e) => {
      setWeight(Number(e.target.value));
    });
    panel.querySelector("#memoCustomColor").addEventListener("input", (e) => {
      setColor(e.target.value);
    });
    fontSelect.addEventListener("change", (e) => setFont(e.target.value));

    document.addEventListener("click", (e) => {
      if (panel.hidden) return;
      if (panel.contains(e.target) || e.target.closest(".memo-style-btn")) return;
      closePanel();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) closePanel();
    });

    return panel;
  }

  function syncPanelUi() {
    if (!panel) return;
    const s = currentStyle;
    panel.querySelectorAll(".memo-pen-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.pen === s.pen);
    });
    panel.querySelectorAll(".memo-color-swatch").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.color.toLowerCase() === s.color.toLowerCase());
    });
    const weightEl = panel.querySelector("#memoWeight");
    const weightOut = panel.querySelector("#memoWeightOut");
    weightEl.value = String(s.weight);
    weightOut.textContent = String(s.weight);
    panel.querySelector("#memoCustomColor").value = s.color;
    panel.querySelector("#memoFontSelect").value = s.font;

    if (preview) {
      const text = activeBinding?.getText?.()?.trim() || "미리보기 — 오늘의 메모";
      preview.textContent = text;
      const css = styleToCss(s);
      preview.style.fontFamily = css.fontFamily;
      preview.style.fontSize = "1rem";
      preview.style.color = css.color;
      preview.style.fontWeight = css.fontWeight || "";
      preview.style.textShadow = css.textShadow || "";
      preview.style.backgroundColor = css.backgroundColor || "transparent";
      preview.style.padding = css.backgroundColor ? "4px 8px" : "0";
      preview.style.borderRadius = css.borderRadius || "";
    }
  }

  function commitStyle() {
    if (!activeBinding) return;
    const saved = normalizeStyle(currentStyle);
    activeBinding.setStyle(saved);
    applyStyleToInput(activeBinding.input, saved);
    savePref(saved);
    if (onPersist) onPersist();
    syncPanelUi();
  }

  function setPen(pen) {
    currentStyle = { ...currentStyle, pen };
    commitStyle();
  }

  function setWeight(weight) {
    currentStyle = { ...currentStyle, weight };
    commitStyle();
  }

  function setColor(color) {
    currentStyle = { ...currentStyle, color };
    commitStyle();
  }

  function setFont(font) {
    currentStyle = { ...currentStyle, font };
    commitStyle();
  }

  function openPanel(anchor, binding) {
    buildPanel();
    activeBinding = binding;
    currentStyle = resolveStyle(binding.getStyle?.());
    syncPanelUi();

    panel.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = rect.left;

    if (left + 280 > window.innerWidth - 8) {
      left = window.innerWidth - 288;
    }
    if (left < 8) left = 8;
    if (top + panelRect.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - panelRect.height - 6);
    }

    panel.style.top = `${top + window.scrollY}px`;
    panel.style.left = `${left + window.scrollX}px`;
  }

  function closePanel() {
    if (panel) panel.hidden = true;
    activeBinding = null;
  }

  function createStyleButton(input, binding) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "memo-style-btn";
    btn.setAttribute("aria-label", "메모 꾸미기");
    btn.title = "꾸미기";
    btn.textContent = "✎";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanel(btn, { ...binding, input });
    });
    return btn;
  }

  function wrapMemoInput(input, binding) {
    if (input.closest(".memo-input-wrap")) return input.closest(".memo-input-wrap");

    const wrap = document.createElement("div");
    wrap.className = "memo-input-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.classList.add("memo-input");
    applyStyleToInput(input, binding.getStyle?.());
    wrap.appendChild(createStyleButton(input, binding));

    input.addEventListener("focus", () => {
      applyStyleToInput(input, binding.getStyle?.());
    });

    return wrap;
  }

  function init(options = {}) {
    onPersist = options.onPersist || null;
    buildPanel();
  }

  window.MemoStyle = {
    init,
    normalizeStyle,
    resolveStyle,
    applyStyleToInput,
    wrapMemoInput,
    loadPref,
    DEFAULT_STYLE,
    PEN_TYPES,
    FONTS,
  };
})();
