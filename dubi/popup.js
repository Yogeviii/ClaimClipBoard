"use strict";

const applyButton = document.getElementById("apply");
const statusEl = document.getElementById("status");

function setStatus(message) {
  statusEl.textContent = message;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tabs[0] || null;
}

async function applyClaimCopyButtons() {
  applyButton.disabled = true;
  setStatus("Applying to the active tab...");

  try {
    const tab = await getActiveTab();

    if (!tab?.id) {
      setStatus("No active tab found.");
      return;
    }

    await chrome.scripting.executeScript({
      target: {
        tabId: tab.id,
        allFrames: true
      },
      files: [
        "claimCopy.js"
      ]
    });

    setStatus("Applied. Check the claims grid for green buttons.");
  } catch (error) {
    setStatus(error?.message || "Could not apply to this tab.");
  } finally {
    applyButton.disabled = false;
  }
}

applyButton.addEventListener("click", applyClaimCopyButtons);
