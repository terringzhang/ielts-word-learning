// 监听网页端点击“需复习/已掌握”动作，实时存入插件数据库
window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || event.data.type !== "LEXICONTEXT_SYNC_PROGRESS") return;
  const { word, status, details, updatedAt } = event.data.payload;
  chrome.storage.local.get(["vocabBank"], (res) => {
    const bank = res.vocabBank || {};
    bank[word] = { status, details, updatedAt };
    chrome.storage.local.set({ vocabBank: bank });
  });
});