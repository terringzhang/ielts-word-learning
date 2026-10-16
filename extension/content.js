// LexiContext 插件 content script：监听网页广播，同步进度到本地词库 + Notion / Anki

// 握手：告诉网页插件已安装（网页据此显示"已连接"并启用真同步）
document.documentElement.dataset.lexiExt = "1";

// background / popup 通过 chrome.tabs.sendMessage 发来的指令 → 转交网页
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "LEXICONTEXT_REQUEST_FULL_SYNC") {
    window.postMessage({ type: "LEXICONTEXT_REQUEST_FULL_SYNC" }, "*");
  }
});

window.addEventListener("message", async (event) => {
  if (event.source !== window || !event.data) return;

  // 1. 网页端单词状态变化 → 存本地词库 → 按配置同步
  if (event.data.type === "LEXICONTEXT_SYNC_PROGRESS") {
    const { word, status, details, updatedAt } = event.data.payload;
    chrome.storage.local.get(["vocabBank", "notionApiKey", "notionDatabaseId", "ankiEnabled"], async (res) => {
      const bank = res.vocabBank || {};
      bank[word] = { status, details, updatedAt };
      chrome.storage.local.set({ vocabBank: bank });

      if (details) {
        if (res.notionApiKey && res.notionDatabaseId) {
          syncWordToNotion(word, status, details, res.notionApiKey, res.notionDatabaseId);
        }
        if (res.ankiEnabled) {
          syncWordToAnki(word, status, details);
        }
      }
    });
  }

  // 2. 网页回传全量数据（LEXICONTEXT_SYNC_TO_NOTION）→ 逐词同步
  if (event.data.type === "LEXICONTEXT_SYNC_TO_NOTION") {
    const { sessionData, progressMap } = event.data.payload || {};
    const cfg = await chrome.storage.local.get(["notionApiKey", "notionDatabaseId", "ankiEnabled"]);
    const hasNotion = cfg.notionApiKey && cfg.notionDatabaseId;
    const hasAnki = cfg.ankiEnabled;
    if (!hasNotion && !hasAnki) {
      alert("请先点击浏览器右上角插件图标，配置 Notion 或开启 Anki 同步！");
      return;
    }
    const list = (sessionData && sessionData.vocab_list) || [];
    const bank = {};
    for (const item of list) {
      const wordKey = item.word.toLowerCase();
      const st = (progressMap && progressMap[wordKey]) || "learning";
      bank[wordKey] = { status: st, details: item, updatedAt: new Date().toISOString() };
      if (hasNotion) await syncWordToNotion(item.word, st, item, cfg.notionApiKey, cfg.notionDatabaseId);
      if (hasAnki) await syncWordToAnki(item.word, st, item);
    }
    chrome.storage.local.set({ vocabBank: bank });
    alert("✅ 已同步 " + list.length + " 个单词" + (hasNotion ? "到 Notion" : "") + (hasNotion && hasAnki ? "、" : "") + (hasAnki ? "到 Anki" : "") + "！");
  }
});

// ---- Notion ----
async function syncWordToNotion(word, status, details, apiKey, dbId) {
  try {
    const resp = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
      },
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          "Word": { title: [{ text: { content: word } }] },
          "Status": { select: { name: status === "mastered" ? "Mastered" : (status === "review" ? "Review" : "Learning") } },
          "English Def": { rich_text: [{ text: { content: (details.en_def || "").slice(0, 2000) } }] },
          "Chinese Def": { rich_text: [{ text: { content: (details.zh_def || "").slice(0, 2000) } }] },
          "Context": { rich_text: [{ text: { content: (details.context_en || "").slice(0, 2000) } }] }
        }
      })
    });
    if (!resp.ok) console.error("Notion 同步失败:", resp.status, await resp.text().catch(() => ""));
  } catch (err) {
    console.error("Notion 同步异常:", err);
  }
}

// ---- Anki（经由本机 AnkiConnect，需桌面版 Anki + 安装 AnkiConnect 插件）----
async function ankiInvoke(action, params) {
  const resp = await fetch("http://127.0.0.1:8765", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, params: params || {} })
  });
  const j = await resp.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

async function syncWordToAnki(word, status, details) {
  try {
    await ankiInvoke("createDeck", { deck: "LexiContext" });
    const front = `${details.word || word} <br><small>${details.phonetic || ""} ${details.pos || ""}</small>`;
    const back = [
      details.en_def ? `<b>${details.en_def}</b>` : "",
      details.usage ? `<br>📌 用法：${details.usage}` : "",
      details.context_en ? `<br><br>📖 ${details.context_en}<br><small>${details.context_zh || ""}</small>` : "",
      details.tv_context_en ? `<br><br>🎬 ${details.tv_show || ""}: <i>${details.tv_context_en}</i>` : "",
      details.idiom_slang ? `<br><br>💬 ${details.idiom_slang}` : "",
      details.zh_def ? `<br><br>🇨🇳 ${details.zh_def}` : "",
      `<br><br><small>状态：${status}</small>`
    ].join("");
    await ankiInvoke("addNote", {
      note: {
        deckName: "LexiContext",
        modelName: "Basic",
        fields: { Front: front, Back: back },
        options: { allowDuplicate: false, duplicateScope: "deck" },
        tags: ["lexicontext", "status-" + status]
      }
    });
  } catch (err) {
    console.error("Anki 同步失败（请确认桌面 Anki 已打开并安装了 AnkiConnect 插件）:", err);
  }
}
