"use strict";

const ENSURE_URL_PATTERNS = [
  "*://ds-ensure01.passportcard.com/*"
];

const ENSURE_URL_RE = /^https?:\/\/ds-ensure01\.passportcard\.com\//i;

function isEnsureUrl(url) {
  return ENSURE_URL_RE.test(url || "");
}

async function injectClaimCopy(tabId) {
  if (!tabId) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: {
        tabId,
        allFrames: true
      },
      files: [
        "claimCopy.js"
      ]
    });
  } catch (error) {
    console.debug("[ClaimCopy] injection skipped", {
      tabId,
      message: error?.message || String(error)
    });
  }
}

async function injectExistingEnsureTabs() {
  const tabs = await chrome.tabs.query({
    url: ENSURE_URL_PATTERNS
  });

  await Promise.all(tabs.map((tab) => injectClaimCopy(tab.id)));
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);

  if (isEnsureUrl(tab.url)) {
    injectClaimCopy(tabId);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && isEnsureUrl(tab.url)) {
    injectClaimCopy(tabId);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  injectExistingEnsureTabs();
});

chrome.runtime.onStartup.addListener(() => {
  injectExistingEnsureTabs();
});
