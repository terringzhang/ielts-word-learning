// popup 的"立即同步"按钮 → 找到 LexiContext 标签页 → 让 content script 向网页请求全量数据
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "TRIGGER_NOTION_SYNC") {
    (async () => {
      const tabs = await chrome.tabs.query({ url: ["https://terringzhang.github.io/ielts-word-learning/*", "https://ringzhang.me/ielts-word-learning/*", "http://ringzhang.me/ielts-word-learning/*"] });
      if (!tabs.length) {
        sendResponse({ msg: "❌ 没找到打开的 LexiContext 页面，请先打开它。" });
        return;
      }
      try {
        await chrome.tabs.sendMessage(tabs[0].id, { type: "LEXICONTEXT_REQUEST_FULL_SYNC" });
        sendResponse({ msg: "🚀 已向页面请求数据，同步完成后页面会弹窗提示。" });
      } catch (e) {
        sendResponse({ msg: "❌ 无法与页面通信，请刷新 LexiContext 页面后重试。" });
      }
    })();
    return true; // 保持 sendResponse 异步可用
  }
});
