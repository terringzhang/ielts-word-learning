// 监听来自网页的广播消息
window.addEventListener("message", async (event) => {
  if (event.source !== window || !event.data) return;

  // 1. 同步单词学习进度
  if (event.data.type === "LEXICONTEXT_SYNC_PROGRESS") {
    const { word, status, details, updatedAt } = event.data.payload;
    chrome.storage.local.get(["vocabBank", "notionApiKey", "notionDatabaseId"], async (res) => {
      const bank = res.vocabBank || {};
      bank[word] = { status, details, updatedAt };
      chrome.storage.local.set({ vocabBank: bank });

      // 如果配置了 Notion，自动同步此条
      if (res.notionApiKey && res.notionDatabaseId && details) {
        syncWordToNotion(word, status, details, res.notionApiKey, res.notionDatabaseId);
      }
    });
  }

  // 2. 网页端点击「同步到 Notion」按钮
  if (event.data.type === "LEXICONTEXT_SYNC_TO_NOTION") {
    chrome.storage.local.get(["notionApiKey", "notionDatabaseId"], async (res) => {
      if (!res.notionApiKey || !res.notionDatabaseId) {
        alert("请先点击浏览器右上角插件图标，配置 Notion API Key 和 Database ID！");
        return;
      }
      const { sessionData, progressMap } = event.data.payload;
      for (const item of (sessionData.vocab_list || [])) {
        const st = progressMap[item.word.toLowerCase()] || "learning";
        await syncWordToNotion(item.word, st, item, res.notionApiKey, res.notionDatabaseId);
      }
      alert("✅ 全部单词已成功同步到 Notion 数据库！");
    });
  }
});

// 向 Notion Database API 写入新行
async function syncWordToNotion(word, status, details, apiKey, dbId) {
  try {
    await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
      },
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          "Word": { title: [{ text: { content: word } }] },
          "Status": { select: { name: status === "mastered" ? "Mastered" : (status === "review" ? "Review" : "Learning") } },
          "English Def": { rich_text: [{ text: { content: details.en_def || "" } }] },
          "Chinese Def": { rich_text: [{ text: { content: details.zh_def || "" } }] },
          "Context": { rich_text: [{ text: { content: details.context_en || "" } }] }
        }
      })
    });
  } catch (err) {
    console.error("同步 Notion 失败:", err);
  }
}