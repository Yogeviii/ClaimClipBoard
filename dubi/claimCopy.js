(function () {
  "use strict";

  const GLOBAL_STATE_KEY = "__claimCopyButtonExtension";

  if (window[GLOBAL_STATE_KEY]) {
    if (typeof window[GLOBAL_STATE_KEY].run === "function") {
      window[GLOBAL_STATE_KEY].run();
    }
    return;
  }

  window[GLOBAL_STATE_KEY] = {
    run: null,
    version: "1.0.2"
  };

  const BUTTON_CLASS = "claude-claim-copy-btn";
  const BUTTON_SELECTOR = `.${BUTTON_CLASS}`;
  const CLAIM_HEADER_RE = /\bclaim\s*no\.?\b/i;
  const SUB_CLAIM_HEADER_RE = /\bsub\s*claim\b/i;
  const CLAIM_VALUE_RE = /^\d{5,12}$/;
  const REINJECT_DELAY_MS = 200;
  const COPIED_FLASH_MS = 250;
  const TOOLTIP_RESET_MS = 900;
  const DEBUG_STORAGE_KEY = "claimCopyDebug";

  let observer = null;
  let reinjectTimer = 0;
  let observedMutationCount = 0;
  const debugEnabled = isDebugEnabled();

  function isDebugEnabled() {
    try {
      return new URLSearchParams(window.location.search).has(DEBUG_STORAGE_KEY)
        || window.localStorage?.getItem(DEBUG_STORAGE_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function isFrame() {
    try {
      return window.self !== window.top;
    } catch (error) {
      return true;
    }
  }

  function debugLog(message, details) {
    if (!debugEnabled) {
      return;
    }

    const prefix = `[ClaimCopy] ${message}`;

    if (details === undefined) {
      console.debug(prefix);
    } else {
      console.debug(prefix, details);
    }
  }

  function normalizeText(value) {
    return (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function getColumnIndex(row, targetCell) {
    let index = 0;

    for (const cell of row.cells) {
      if (cell === targetCell) {
        return index;
      }

      index += Math.max(cell.colSpan || 1, 1);
    }

    return -1;
  }

  function getCellAtColumn(row, columnIndex) {
    let index = 0;

    for (const cell of row.cells) {
      const span = Math.max(cell.colSpan || 1, 1);

      if (columnIndex >= index && columnIndex < index + span) {
        return span === 1 ? cell : null;
      }

      index += span;
    }

    return null;
  }

  function findHeaderInfo(table) {
    for (const row of table.rows) {
      let claimColumnIndex = -1;
      let subClaimColumnIndex = -1;

      for (const cell of row.cells) {
        const headerText = normalizeText(cell.textContent);

        if (CLAIM_HEADER_RE.test(headerText)) {
          claimColumnIndex = getColumnIndex(row, cell);
        } else if (SUB_CLAIM_HEADER_RE.test(headerText)) {
          subClaimColumnIndex = getColumnIndex(row, cell);
        }
      }

      if (claimColumnIndex !== -1) {
        return {
          row,
          claimColumnIndex,
          subClaimColumnIndex
        };
      }
    }

    return null;
  }

  function isNonDataRow(row, headerRow) {
    if (row === headerRow || row.querySelector("th")) {
      return true;
    }

    const text = normalizeText(row.textContent);

    if (!text) {
      return true;
    }

    return /(^|\b)totals?\s*:/i.test(text);
  }

  function getClaimNumber(cell) {
    const clone = cell.cloneNode(true);
    clone.querySelectorAll(BUTTON_SELECTOR).forEach((button) => button.remove());

    const value = normalizeText(clone.textContent);
    return CLAIM_VALUE_RE.test(value) ? value : "";
  }

  function fallbackCopyText(value) {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      if (!document.execCommand("copy")) {
        throw new Error("execCommand copy failed");
      }
    } finally {
      textarea.remove();
    }
  }

  async function copyText(value) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch (error) {
        // Some iframe contexts expose Clipboard API but reject writes.
      }
    }

    fallbackCopyText(value);
  }

  function flashButton(button, success) {
    const originalTitle = button.title;
    button.title = success ? "Copied!" : "Copy failed";
    button.classList.add(success ? "is-copied" : "is-error");

    window.setTimeout(() => {
      button.classList.remove("is-copied", "is-error");
    }, COPIED_FLASH_MS);

    window.setTimeout(() => {
      button.title = originalTitle || "Copy claim number";
    }, TOOLTIP_RESET_MS);
  }

  function createButton(claimNumber) {
    const button = document.createElement("span");
    button.className = BUTTON_CLASS;
    button.dataset.claim = claimNumber;
    button.title = "Copy claim number";
    button.setAttribute("role", "button");
    button.setAttribute("tabindex", "0");
    button.setAttribute("aria-label", `Copy claim number ${claimNumber}`);

    button.innerHTML = [
      '<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false">',
      '<rect x="4" y="2" width="6" height="2" rx="0.7"></rect>',
      '<rect x="3" y="3.5" width="8" height="8" rx="1"></rect>',
      '<path d="M5 6h4M5 8h4"></path>',
      '</svg>'
    ].join("");

    button.addEventListener("click", onCopyClick);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        onCopyClick(event);
      }
    });

    return button;
  }

  function onCopyClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const claimNumber = button.dataset.claim;

    if (!claimNumber) {
      flashButton(button, false);
      return;
    }

    copyText(claimNumber)
      .then(() => flashButton(button, true))
      .catch(() => flashButton(button, false));
  }

  function ensureStyles() {
    if (document.getElementById("claude-claim-copy-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "claude-claim-copy-styles";
    style.textContent = `
      .${BUTTON_CLASS} {
        align-items: center;
        background: #2ecc40;
        border: 1px solid #1a7d2c;
        border-radius: 3px;
        box-sizing: border-box;
        cursor: pointer;
        display: inline-flex;
        height: 14px;
        justify-content: center;
        margin-right: 5px;
        vertical-align: middle;
        width: 14px;
      }

      .${BUTTON_CLASS}:hover,
      .${BUTTON_CLASS}:focus {
        background: #22b837;
        outline: 1px solid #0b6e1d;
      }

      .${BUTTON_CLASS}.is-copied {
        background: #0b6e1d;
      }

      .${BUTTON_CLASS}.is-error {
        background: #b00020;
        border-color: #790016;
      }

      .${BUTTON_CLASS} svg {
        display: block;
        fill: none;
        height: 11px;
        pointer-events: none;
        stroke: #fff;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 1.2;
        width: 11px;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function upsertButton(cell, claimNumber) {
    const existingButton = cell.querySelector(BUTTON_SELECTOR);

    if (existingButton) {
      existingButton.dataset.claim = claimNumber;
      existingButton.setAttribute("aria-label", `Copy claim number ${claimNumber}`);
      return;
    }

    cell.insertBefore(createButton(claimNumber), cell.firstChild);
  }

  function injectIntoTable(table, headerInfo) {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of table.rows) {
      if (isNonDataRow(row, headerInfo.row)) {
        skipped += 1;
        continue;
      }

      const claimCell = getCellAtColumn(row, headerInfo.claimColumnIndex);

      if (!claimCell) {
        skipped += 1;
        continue;
      }

      if (
        headerInfo.subClaimColumnIndex !== -1
        && headerInfo.claimColumnIndex === headerInfo.subClaimColumnIndex
      ) {
        skipped += 1;
        continue;
      }

      const claimNumber = getClaimNumber(claimCell);

      if (!claimNumber) {
        const staleButton = claimCell.querySelector(BUTTON_SELECTOR);
        if (staleButton) {
          staleButton.remove();
        }
        skipped += 1;
        continue;
      }

      if (claimCell.querySelector(BUTTON_SELECTOR)) {
        updated += 1;
      } else {
        inserted += 1;
      }

      upsertButton(claimCell, claimNumber);
    }

    debugLog("table processed", {
      claimColumnIndex: headerInfo.claimColumnIndex,
      subClaimColumnIndex: headerInfo.subClaimColumnIndex,
      rows: table.rows.length,
      inserted,
      updated,
      skipped
    });
  }

  function injectClaimCopyButtons() {
    if (!document.body) {
      return;
    }

    ensureStyles();

    let tablesSeen = 0;
    let matchingTables = 0;

    for (const table of document.querySelectorAll("table")) {
      tablesSeen += 1;
      const headerInfo = findHeaderInfo(table);

      if (headerInfo) {
        matchingTables += 1;
        injectIntoTable(table, headerInfo);
      }
    }

    debugLog("inject pass complete", {
      href: window.location.href,
      isFrame: isFrame(),
      tablesSeen,
      matchingTables
    });
  }

  function scheduleInjection() {
    window.clearTimeout(reinjectTimer);
    reinjectTimer = window.setTimeout(injectClaimCopyButtons, REINJECT_DELAY_MS);
  }

  function startObserver() {
    if (!document.body || observer) {
      return;
    }

    observer = new MutationObserver((mutations) => {
      const shouldInject = mutations.some((mutation) => {
        if (mutation.type === "characterData") {
          return !mutation.target.parentElement?.closest(BUTTON_SELECTOR);
        }

        return Array.from(mutation.addedNodes).some((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            return true;
          }

          return node.nodeType === Node.ELEMENT_NODE
            && !node.matches?.(BUTTON_SELECTOR)
            && !node.querySelector?.(BUTTON_SELECTOR);
        });
      });

      if (shouldInject) {
        observedMutationCount += mutations.length;
        debugLog("DOM changed; scheduling reinject", {
          mutationBatchSize: mutations.length,
          observedMutationCount
        });
        scheduleInjection();
      }
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  function init() {
    if (!document.body) {
      window.setTimeout(init, 50);
      return;
    }

    document.documentElement.setAttribute("data-claim-copy-loaded", "1");
    document.documentElement.setAttribute("data-claim-copy-frame", isFrame() ? "1" : "0");

    debugLog("content script initialized", {
      href: window.location.href,
      isFrame: isFrame()
    });

    injectClaimCopyButtons();
    startObserver();
  }

  window[GLOBAL_STATE_KEY].run = injectClaimCopyButtons;

  init();
}());
