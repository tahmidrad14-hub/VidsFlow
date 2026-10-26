// popup/popup.js
document.getElementById('focusTab').addEventListener('click', async () => {
  // Query for the Vids tab specifically on docs.google.com
  const tabs = await chrome.tabs.query({ url: 'https://docs.google.com/videos/*' });
  
  if (tabs.length) {
    chrome.tabs.update(tabs[0].id, { active: true });
    chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    // If no Vids tab is open, open the main Google Vids dashboard
    chrome.tabs.create({ url: 'https://docs.google.com/videos/' });
  }
  window.close();
});