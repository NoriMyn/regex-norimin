import { saveSettingsDebounced } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

const extensionName = "regex-norimyn";

if (!window.RegexManagerData) {
  window.RegexManagerData = {
    packs: {},
    enabled: [],
    collapsed: false,
    errors: []
  };
}

jQuery(async () => {
  try {
    const settingsHtml = await $.get(`/scripts/extensions/third-party/${extensionName}/settings.html`);

    const target = $("#extensions_settings2").length
      ? $("#extensions_settings2")
      : $("#extensions_settings");

    if (!target.length) {
      throw new Error("Extensions settings container not found");
    }

    target.append(settingsHtml);

    if (extension_settings[extensionName]) {
      window.RegexManagerData.enabled = Array.isArray(extension_settings[extensionName].enabled)
        ? extension_settings[extensionName].enabled
        : [];
      window.RegexManagerData.collapsed = extension_settings[extensionName].collapsed === true;
    }

    await loadRegexPacks();
    renderPackList();
    updateCollapseState();
    cleanupManagedRegexes();

    for (const packId of window.RegexManagerData.enabled) {
      injectRegexPack(packId);
    }

    $("#regex-manager-collapse").on("click", function () {
      window.RegexManagerData.collapsed = !window.RegexManagerData.collapsed;
      updateCollapseState();
      saveSettings();
    });
  } catch (e) {
    console.error("[Regex Manager] Init error full:", e);
    console.error("[Regex Manager] message:", e?.message);
    console.error("[Regex Manager] stack:", e?.stack);
  }
});

function updateCollapseState() {
  const body = $("#regex-manager-body");
  const btn = $("#regex-manager-collapse");

  if (window.RegexManagerData.collapsed) {
    body.addClass("collapsed");
    btn.text("Развернуть");
  } else {
    body.removeClass("collapsed");
    btn.text("Свернуть");
  }
}

function saveSettings() {
  extension_settings[extensionName] = {
    enabled: [...window.RegexManagerData.enabled],
    collapsed: window.RegexManagerData.collapsed
  };
  saveSettingsDebounced();
}

async function reloadChatSafe() {
  const ctx = SillyTavern.getContext();
  if (ctx && typeof ctx.reloadCurrentChat === "function") {
    await ctx.reloadCurrentChat();
  }
}

async function loadRegexPacks() {
  const packFiles = [
    "regex_thinking",
    "regex_think",
    "regex_infobloc",
    "regex_buttons_panel",
    "regex_HTML"
  ];

  window.RegexManagerData.packs = {};
  window.RegexManagerData.errors = [];

  for (const file of packFiles) {
    try {
      const response = await fetch(`/scripts/extensions/third-party/${extensionName}/regexes/${file}.json`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const pack = await response.json();

      if (!pack || typeof pack !== "object") {
        throw new Error("Invalid JSON");
      }

      if (!pack.id || !pack.scriptName || typeof pack.findRegex !== "string") {
        throw new Error("Missing required fields");
      }

      window.RegexManagerData.packs[file] = pack;
    } catch (e) {
      window.RegexManagerData.errors.push(`${file}: ${e.message}`);
      console.error(`[Regex Manager] Load error ${file}:`, e);
    }
  }
}

function renderPackList() {
  const container = $("#regex-manager-list");
  container.empty();

  const entries = Object.entries(window.RegexManagerData.packs);

  if (!entries.length) {
    container.append(`
      <div class="regex-pack">
        <div class="regex-pack-name">Регексы не загрузились</div>
        <div class="regex-manager-desc">${escapeHtml(window.RegexManagerData.errors.join(" | ") || "Не удалось загрузить файлы regexes")}</div>
      </div>
    `);
    return;
  }

  if (window.RegexManagerData.errors.length) {
    container.append(`
      <div class="regex-pack">
        <div class="regex-pack-name">Часть регексов не загрузилась</div>
        <div class="regex-manager-desc">${escapeHtml(window.RegexManagerData.errors.join(" | "))}</div>
      </div>
    `);
  }

  for (const [id, pack] of entries) {
    const enabled = window.RegexManagerData.enabled.includes(id);
    const inputId = `regex-pack-${escapeId(id)}`;

    const html = `
      <div class="regex-pack">
        <div class="regex-pack-top">
          <input type="checkbox" id="${inputId}" data-pack="${escapeHtml(id)}" ${enabled ? "checked" : ""}>
          <label for="${inputId}" class="regex-pack-name">${escapeHtml(pack.scriptName)}</label>
        </div>
      </div>
    `;

    container.append(html);
  }

  container.find("input[type=checkbox]").on("change", async function () {
    const packId = $(this).data("pack");
    const checked = $(this).is(":checked");

    if (checked) {
      if (!window.RegexManagerData.enabled.includes(packId)) {
        window.RegexManagerData.enabled.push(packId);
        injectRegexPack(packId);
      }
    } else {
      window.RegexManagerData.enabled = window.RegexManagerData.enabled.filter(p => p !== packId);
      removeRegexPack(packId);
    }

    saveSettings();
    await reloadChatSafe();
  });
}

function injectRegexPack(packId) {
  const script = window.RegexManagerData.packs[packId];
  if (!script) return;

  if (!Array.isArray(extension_settings.regex)) {
    extension_settings.regex = [];
  }

  const newId = `rgxm-${packId}-${script.id}`;
  const exists = extension_settings.regex.some(r => r.id === newId);
  if (exists) return;

  extension_settings.regex.push({
    id: newId,
    scriptName: script.scriptName,
    findRegex: script.findRegex,
    replaceString: script.replaceString,
    trimStrings: Array.isArray(script.trimStrings) ? script.trimStrings : [],
    placement: Array.isArray(script.placement) ? script.placement : [2],
    disabled: false,
    markdownOnly: script.markdownOnly ?? false,
    promptOnly: script.promptOnly ?? false,
    runOnEdit: script.runOnEdit ?? true,
    substituteRegex: script.substituteRegex ?? 0,
    minDepth: script.minDepth ?? null,
    maxDepth: script.maxDepth ?? null
  });

  saveSettingsDebounced();
}

function removeRegexPack(packId) {
  if (!Array.isArray(extension_settings.regex)) return;

  const prefix = `rgxm-${packId}-`;

  for (let i = extension_settings.regex.length - 1; i >= 0; i--) {
    const item = extension_settings.regex[i];
    if (item?.id && item.id.startsWith(prefix)) {
      extension_settings.regex.splice(i, 1);
    }
  }

  saveSettingsDebounced();
}

function cleanupManagedRegexes() {
  if (!Array.isArray(extension_settings.regex)) return;

  const validIds = new Set();

  for (const packId of window.RegexManagerData.enabled) {
    const script = window.RegexManagerData.packs[packId];
    if (script?.id) {
      validIds.add(`rgxm-${packId}-${script.id}`);
    }
  }

  for (let i = extension_settings.regex.length - 1; i >= 0; i--) {
    const item = extension_settings.regex[i];
    if (!item?.id || !item.id.startsWith("rgxm-")) continue;

    if (!validIds.has(item.id)) {
      extension_settings.regex.splice(i, 1);
    }
  }

  saveSettingsDebounced();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

function escapeId(text) {
  return String(text).replace(/[^a-zA-Z0-9\-_:.]/g, "_");
}
