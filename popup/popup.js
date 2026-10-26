document.getElementById('focusTab').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ url: 'https://vids.google.com/*' });
  if (tabs.length) {
    chrome.tabs.update(tabs[0].id, { active: true });
    chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: 'https://vids.google.com/' });
  }
  window.close();
});