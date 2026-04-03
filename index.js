import { saveSettingsDebounced } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";
import { callGenericPopup, POPUP_TYPE } from "../../../popup.js";

const extensionName = "regex-norimyn";

if (!window.RegexManagerData) {
  window.RegexManagerData = {
    packs: {},
    enabled: [],
    active: true
  };
}

jQuery(async () => {
  try {
    const settingsHtml = await $.get(`/scripts/extensions/third-party/${extensionName}/settings.html`);
    $("#extensions_settings2").append(settingsHtml);

    if (extension_settings[extensionName]) {
      window.RegexManagerData.enabled = extension_settings[extensionName].enabled || [];
      window.RegexManagerData.active = extension_settings[extensionName].active !== false;
    }

    await loadRegexPacks();
    renderPackList();
    updateToggleButton();

    if (window.RegexManagerData.active) {
      for (const packId of window.RegexManagerData.enabled) {
        injectRegexPack(packId);
      }
    }

    $("#regex-manager-toggle").on("click", async function() {
      window.RegexManagerData.active = !window.RegexManagerData.active;

      if (window.RegexManagerData.active) {
        for (const packId of window.RegexManagerData.enabled) {
          injectRegexPack(packId);
        }
      } else {
        for (const packId of window.RegexManagerData.enabled) {
          removeRegexPack(packId);
        }
      }

      updateToggleButton();
      saveSettings();

      const ctx = SillyTavern.getContext();
      if (ctx.reloadCurrentChat) {
        await ctx.reloadCurrentChat();
      }
    });

    $("#regex-manager-debug").on("click", function() {
      openDebugger();
    });
  } catch (e) {
    console.error("[Regex Manager] Init error:", e);
  }
});

function updateToggleButton() {
  const btn = $("#regex-manager-toggle");

  if (window.RegexManagerData.active) {
    btn.text("ВКЛ").removeClass("inactive").addClass("active");
  } else {
    btn.text("ВЫКЛ").removeClass("active").addClass("inactive");
  }

  $("#regex-manager-list input[type=checkbox]").prop("disabled", !window.RegexManagerData.active);
}

async function loadRegexPacks() {
  const packFiles = [
    "nori"
  ];

  for (const file of packFiles) {
    try {
      const response = await fetch(`/scripts/extensions/third-party/${extensionName}/regexes/${file}.json`);
      const pack = await response.json();
      window.RegexManagerData.packs[file] = pack;
    } catch (e) {
      console.error(`[Regex Manager] Load error ${file}:`, e);
    }
  }
}

function renderPackList() {
  const container = $("#regex-manager-list");
  container.empty();

  for (const [id, pack] of Object.entries(window.RegexManagerData.packs)) {
    const enabled = window.RegexManagerData.enabled.includes(id);
    const inputId = `regex-pack-${id}`;

    const html = `
      <div class="regex-pack">
        <div class="regex-pack-top">
          <input type="checkbox" id="${inputId}" data-pack="${id}" ${enabled ? "checked" : ""} ${!window.RegexManagerData.active ? "disabled" : ""}>
          <label for="${inputId}" class="regex-pack-name">${escapeHtml(pack.name)}</label>
        </div>
        <div class="regex-pack-desc">${escapeHtml(pack.description)}</div>
        <div class="regex-pack-count">${pack.scripts.length} регексов</div>
      </div>
    `;

    container.append(html);
  }

  container.find("input[type=checkbox]").on("change", async function() {
    const packId = $(this).data("pack");
    const checked = $(this).is(":checked");

    if (checked) {
      if (!window.RegexManagerData.enabled.includes(packId)) {
        window.RegexManagerData.enabled.push(packId);
        if (window.RegexManagerData.active) {
          injectRegexPack(packId);
        }
      }
    } else {
      window.RegexManagerData.enabled = window.RegexManagerData.enabled.filter(p => p !== packId);
      removeRegexPack(packId);
    }

    saveSettings();

    const ctx = SillyTavern.getContext();
    if (ctx.reloadCurrentChat) {
      await ctx.reloadCurrentChat();
    }
  });
}

function saveSettings() {
  extension_settings[extensionName] = {
    enabled: window.RegexManagerData.enabled,
    active: window.RegexManagerData.active
  };
  saveSettingsDebounced();
}

function injectRegexPack(packId) {
  const pack = window.RegexManagerData.packs[packId];
  if (!pack) return;

  if (!Array.isArray(extension_settings.regex)) {
    extension_settings.regex = [];
  }

  for (const script of pack.scripts) {
    const newId = `rgxm-${packId}-${script.id}`;
    const existingIndex = extension_settings.regex.findIndex(r => r.id === newId);
    if (existingIndex !== -1) continue;

    extension_settings.regex.push({
      id: newId,
      scriptName: `[RM] ${script.scriptName}`,
      findRegex: script.findRegex,
      replaceString: script.replaceString,
      trimStrings: script.trimStrings || [],
      placement: script.placement || [1, 2, 6],
      disabled: false,
      markdownOnly: script.markdownOnly ?? true,
      promptOnly: script.promptOnly ?? false,
      runOnEdit: script.runOnEdit ?? true,
      substituteRegex: script.substituteRegex ?? 0,
      minDepth: script.minDepth ?? null,
      maxDepth: script.maxDepth ?? null
    });
  }

  saveSettingsDebounced();
}

function removeRegexPack(packId) {
  if (!Array.isArray(extension_settings.regex)) return;

  const prefix = `rgxm-${packId}-`;

  for (let i = extension_settings.regex.length - 1; i >= 0; i--) {
    if (extension_settings.regex[i].id && extension_settings.regex[i].id.startsWith(prefix)) {
      extension_settings.regex.splice(i, 1);
    }
  }

  saveSettingsDebounced();
}

async function openDebugger() {
  const packs = window.RegexManagerData.packs;
  const enabledPacks = window.RegexManagerData.enabled;

  let allScripts = [];
  for (const packId of enabledPacks) {
    const pack = packs[packId];
    if (pack) {
      allScripts = allScripts.concat(pack.scripts.map(s => ({ ...s, packName: pack.name })));
    }
  }

  const html = `
    <div class="regex-manager-debugger">
      <div class="debugger-section">
        <h4>Активные регексы (${allScripts.length})</h4>
        <div class="debugger-rules">
          ${allScripts.length === 0 ? '<div class="no-rules">Нет активных регексов</div>' :
            allScripts.map((s, i) => `
              <div class="debugger-rule">
                <span class="rule-num">${i + 1}</span>
                <span class="rule-name">${escapeHtml(s.scriptName)}</span>
                <code class="rule-regex">${escapeHtml(String(s.findRegex).slice(0, 40))}${String(s.findRegex).length > 40 ? '...' : ''}</code>
              </div>
            `).join('')
          }
        </div>
      </div>

      <div class="debugger-section">
        <h4>Тест</h4>
        <div>
          <label for="debug-input">Текст для теста</label>
          <textarea id="debug-input" class="text_pole" rows="4" placeholder="Вставь текст для теста..."></textarea>
        </div>
        <div class="debugger-buttons">
          <div>
            <label for="debug-render">Режим вывода</label>
            <select id="debug-render">
              <option value="text">Как текст</option>
            </select>
          </div>
          <div>
            <button id="debug-run" class="menu_button">Запустить</button>
          </div>
        </div>
      </div>

      <div class="debugger-section">
        <h4>Результат</h4>
        <div id="debug-output" class="debugger-output"></div>
      </div>

      <div class="debugger-section">
        <h4>Пошаговая трансформация</h4>
        <div id="debug-steps" class="debugger-steps"></div>
      </div>
    </div>
  `;

  const popup = $(html);

  popup.find("#debug-run").on("click", function() {
    const input = popup.find("#debug-input").val();
    if (!input) return;

    let result = input;
    const steps = [];

    for (const script of allScripts) {
      const before = result;

      try {
        const regex = buildRegexFromString(script.findRegex);
        result = result.replace(regex, script.replaceString);

        if (before !== result) {
          steps.push({
            name: script.scriptName,
            changed: true
          });
        }
      } catch (e) {
        steps.push({
          name: script.scriptName,
          error: e.message
        });
      }
    }

    popup.find("#debug-output").text(result);

    const stepsEl = popup.find("#debug-steps");
    if (steps.length === 0) {
      stepsEl.html('<div class="no-changes">Ни один регекс не сработал</div>');
    } else {
      stepsEl.html(steps.map(s => `
        <div class="step ${s.error ? 'step-error' : 'step-ok'}">
          <span class="step-name">${escapeHtml(s.name)}</span>
          ${s.error
            ? `<span class="step-error-msg">Ошибка: ${escapeHtml(s.error)}</span>`
            : '<span class="step-ok-msg">✓ Сработал</span>'}
        </div>
      `).join(''));
    }
  });

  await callGenericPopup(popup, POPUP_TYPE.TEXT, '', { wide: true, large: true });
}

function buildRegexFromString(source) {
  if (typeof source !== "string" || !source.length) {
    throw new Error("Empty findRegex");
  }

  const literalMatch = source.match(/^\/([\s\S]*)\/([gimsuy]*)$/);
  if (literalMatch) {
    return new RegExp(literalMatch[1], literalMatch[2]);
  }

  return new RegExp(source);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}
