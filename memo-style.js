(function () {
  const PREF_KEY = "planner-memo-style-pref";

  const PEN_TYPES = [
    { id: "pencil", label: "연필", icon: "✏️" },
    { id: "ballpoint", label: "볼펜", icon: "🖊️" },
    { id: "highlighter", label: "형광", icon: "🖍️" },
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
    size: 6,
    color: "#222222",
    font: "default",
  };

  const SIZE_MIN = 1;
  const SIZE_MAX = 7;

  function sizeToRem(size) {
    return 0.72 + (size - 1) * 0.06;
  }

  let bar = null;
  let preview = null;
  let statusEl = null;
  let activeBinding = null;
  let activeInput = null;
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
    const size = Number.isFinite(Number(s.size))
      ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(Number(s.size))))
      : DEFAULT_STYLE.size;
    const color = typeof s.color === "string" && /^#[0-9a-fA-F]{6}$/.test(s.color)
      ? s.color
      : DEFAULT_STYLE.color;
    return { pen, weight, size, color, font };
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
    const css = {
      fontFamily: fontFamily(s.font),
      fontSize: `${sizeToRem(s.size)}rem`,
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
    if (!style) {
      resetInputStyle(input);
      return;
    }
    const s = normalizeStyle(style);
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

  function resetInputStyle(input) {
    if (!input) return;
    input.style.fontFamily = "";
    input.style.fontSize = "";
    input.style.color = "";
    input.style.fontWeight = "";
    input.style.textShadow = "";
    input.style.backgroundColor = "";
    input.style.borderRadius = "";
    delete input.dataset.memoPen;
    input.classList.remove("memo-styled");
  }

  function setActiveInput(input) {
    if (activeInput) activeInput.classList.remove("memo-input-active");
    activeInput = input || null;
    if (activeInput) activeInput.classList.add("memo-input-active");
  }

  function buildBar() {
    if (bar) return bar;

    bar = document.getElementById("memoStyleBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "memoStyleBar";
      bar.className = "memo-style-bar";
      document.body.appendChild(bar);
    }

    bar.innerHTML = `
      <div class="memo-bar-main">
        <span class="memo-bar-label">꾸미기</span>
        <span class="memo-bar-status" id="memoBarStatus">메모를 선택하세요</span>
        <div class="memo-bar-group memo-bar-pens" id="memoPenGroup"></div>
        <span class="memo-bar-divider" aria-hidden="true"></span>
        <label class="memo-bar-weight">
          <span class="memo-bar-mini-label">굵기</span>
          <input type="range" id="memoWeight" min="1" max="5" step="1" value="2" aria-label="굵기">
          <output id="memoWeightOut">2</output>
        </label>
        <label class="memo-bar-size">
          <span class="memo-bar-mini-label">크기</span>
          <input type="range" id="memoSize" min="1" max="7" step="1" value="6" aria-label="글씨 크기">
          <output id="memoSizeOut">6</output>
        </label>
        <span class="memo-bar-divider" aria-hidden="true"></span>
        <div class="memo-bar-group memo-bar-colors" id="memoColorGroup"></div>
        <label class="memo-bar-custom-color" title="커스텀 색상">
          <input type="color" id="memoCustomColor" value="#222222" aria-label="커스텀 색상">
        </label>
        <span class="memo-bar-divider" aria-hidden="true"></span>
        <label class="memo-bar-font-wrap">
          <span class="memo-bar-mini-label">서체</span>
          <select id="memoFontSelect" class="memo-font-select" aria-label="서체"></select>
        </label>
        <span class="memo-bar-preview" id="memoStylePreview">미리보기</span>
        <button type="button" class="memo-clear-btn" id="memoClearStyle" title="선택한 메모의 꾸미기를 기본으로 되돌립니다">스타일 지우기</button>
      </div>
      <button type="button" class="memo-bar-toggle" id="memoBarToggle" aria-expanded="false">꾸미기</button>`;

    statusEl = bar.querySelector("#memoBarStatus");
    preview = bar.querySelector("#memoStylePreview");

    const penGroup = bar.querySelector("#memoPenGroup");
    PEN_TYPES.forEach((pen) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "memo-pen-btn";
      btn.dataset.pen = pen.id;
      btn.title = pen.label;
      btn.setAttribute("aria-label", pen.label);
      btn.innerHTML = `<span class="memo-pen-icon">${pen.icon}</span><span class="memo-pen-label">${pen.label}</span>`;
      btn.addEventListener("click", () => setPen(pen.id));
      penGroup.appendChild(btn);
    });

    const colorGroup = bar.querySelector("#memoColorGroup");
    COLOR_PALETTE.forEach((color) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "memo-color-swatch";
      btn.dataset.color = color;
      btn.style.backgroundColor = color;
      btn.title = color;
      btn.setAttribute("aria-label", `색상 ${color}`);
      btn.addEventListener("click", () => setColor(color));
      colorGroup.appendChild(btn);
    });

    const fontSelect = bar.querySelector("#memoFontSelect");
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

    bar.querySelector("#memoWeight").addEventListener("input", (e) => {
      setWeight(Number(e.target.value));
    });
    bar.querySelector("#memoSize").addEventListener("input", (e) => {
      setSize(Number(e.target.value));
    });
    bar.querySelector("#memoCustomColor").addEventListener("input", (e) => {
      setColor(e.target.value);
    });
    fontSelect.addEventListener("change", (e) => setFont(e.target.value));

    bar.querySelector("#memoBarToggle").addEventListener("click", () => {
      const open = bar.classList.toggle("memo-bar-open");
      bar.querySelector("#memoBarToggle").setAttribute("aria-expanded", open ? "true" : "false");
    });

    bar.querySelector("#memoClearStyle").addEventListener("click", clearStyle);

    currentStyle = loadPref();
    syncBarUi();
    return bar;
  }

  function syncBarUi() {
    if (!bar) return;
    const s = currentStyle;
    bar.querySelectorAll(".memo-pen-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.pen === s.pen);
    });
    bar.querySelectorAll(".memo-color-swatch").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.color.toLowerCase() === s.color.toLowerCase());
    });
    const weightEl = bar.querySelector("#memoWeight");
    const weightOut = bar.querySelector("#memoWeightOut");
    weightEl.value = String(s.weight);
    weightOut.textContent = String(s.weight);
    const sizeEl = bar.querySelector("#memoSize");
    const sizeOut = bar.querySelector("#memoSizeOut");
    sizeEl.value = String(s.size);
    sizeOut.textContent = String(s.size);
    bar.querySelector("#memoCustomColor").value = s.color;
    bar.querySelector("#memoFontSelect").value = s.font;

    if (preview) {
      const text = activeBinding?.getText?.()?.trim() || "미리보기 — 오늘의 메모";
      preview.textContent = text;
      const css = styleToCss(s);
      preview.style.fontFamily = css.fontFamily;
      preview.style.fontSize = css.fontSize;
      preview.style.color = css.color;
      preview.style.fontWeight = css.fontWeight || "";
      preview.style.textShadow = css.textShadow || "";
      preview.style.backgroundColor = css.backgroundColor || "transparent";
      preview.style.padding = css.backgroundColor ? "2px 8px" : "0";
      preview.style.borderRadius = css.borderRadius || "";
    }

    if (statusEl) {
      statusEl.textContent = activeBinding
        ? (activeBinding.getLabel?.() || "선택된 메모")
        : "메모를 선택하세요";
    }

    bar.classList.toggle("has-target", !!activeBinding);
    const clearBtn = bar.querySelector("#memoClearStyle");
    if (clearBtn) clearBtn.disabled = !activeBinding;
  }

  function commitStyle() {
    const saved = normalizeStyle(currentStyle);
    savePref(saved);
    if (activeBinding?.input) {
      activeBinding.setStyle(saved);
      applyStyleToInput(activeBinding.input, saved);
      if (onPersist) onPersist();
    }
    syncBarUi();
  }

  function setPen(pen) {
    currentStyle = { ...currentStyle, pen };
    commitStyle();
  }

  function setWeight(weight) {
    currentStyle = { ...currentStyle, weight };
    commitStyle();
  }

  function setSize(size) {
    currentStyle = { ...currentStyle, size };
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

  function clearStyle() {
    if (!activeBinding?.input) return;
    activeBinding.setStyle(null);
    resetInputStyle(activeBinding.input);
    currentStyle = loadPref();
    if (onPersist) onPersist();
    syncBarUi();
  }

  function activateBinding(binding) {
    activeBinding = binding;
    const saved = binding.getStyle?.() ?? null;
    currentStyle = resolveStyle(saved);
    setActiveInput(binding.input);
    if (binding.input) {
      applyStyleToInput(binding.input, saved ?? currentStyle);
    }
    syncBarUi();
  }

  function wrapMemoInput(input, binding) {
    if (input.closest(".memo-input-wrap")) return input.closest(".memo-input-wrap");

    const wrap = document.createElement("div");
    wrap.className = "memo-input-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.classList.add("memo-input");

    const fullBinding = {
      ...binding,
      input,
      getLabel: binding.getLabel || (() => input.placeholder || "메모"),
    };

    const saved = binding.getStyle?.() ?? null;
    applyStyleToInput(input, saved ?? loadPref());

    input.addEventListener("focus", () => {
      activateBinding(fullBinding);
    });

    return wrap;
  }

  function init(options = {}) {
    onPersist = options.onPersist || null;
    buildBar();
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
