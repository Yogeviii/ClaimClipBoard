# Claim Number Copy Button

Chrome Manifest V3 extension for the internal E-nsure ERP claims grid.

It injects a small green copy button to the left of each value in the `Claim No.` column. The script runs in all frames and uses the table header to find the correct column, so it does not depend on iframe indexes or hardcoded claim numbers.

## Install locally

1. Open Chrome Extensions: `chrome://extensions`.
2. Enable `Developer mode`.
3. Choose `Load unpacked`.
4. Select this folder: `C:\Users\yogev.amira\Documents\ClaimClipBoard`.

## Files

- `manifest.json` configures all-frame content-script injection for `ds-ensure01.passportcard.com`.
- `claimCopy.js` detects the claims grid, injects idempotent copy buttons, and re-runs after AJAX/WebForms updates via `MutationObserver`.
- `background.js` applies the script when an E-nsure tab loads, when you switch back to an already-open E-nsure tab, when the extension is installed/updated, and when Chrome starts. It also lets the extension toolbar button apply the script to the current tab immediately.
- `popup.html` and `popup.js` provide a visible `Apply Claim Copy Buttons` button in the extension popup.

If more E-nsure environments need support, add their URL match patterns to both `host_permissions` and `content_scripts[0].matches` in `manifest.json`.

## Apply without refreshing

Normal page loads and tab switches should work automatically.

If E-nsure was already open before installing, updating, enabling, or reloading the extension, Chrome may not inject content scripts into the already-loaded frames until the tab is activated or refreshed.

To force it immediately:

1. Open the E-nsure tab.
2. Click Chrome's puzzle-piece Extensions icon.
3. Open `Claim Number Copy Button`.
4. Click `Apply Claim Copy Buttons`.

You can pin the extension from the puzzle-piece menu if you want the icon visible in the toolbar. Chrome shows only the icon there; the visible text button is inside the popup.

## Debugging

After editing extension files, open `chrome://extensions`, find this extension, and click the reload icon. Then refresh E-nsure.

To enable extension logs:

```js
localStorage.setItem("claimCopyDebug", "1");
location.reload();
```

Open DevTools on the E-nsure tab and filter the Console for `ClaimCopy`.

Useful checks:

```js
location.href
document.documentElement.getAttribute("data-claim-copy-loaded")
document.querySelectorAll(".claude-claim-copy-btn").length
[...document.querySelectorAll("table")].map((table) => table.innerText.slice(0, 300))
```

Expected logs:

- `content script initialized`: the extension loaded in that frame.
- `inject pass complete`: the script scanned the frame's tables.
- `matchingTables: 1` or higher: it found a table with a `Claim No.` header.
- `inserted: N`: it added copy buttons.

If there are no `ClaimCopy` logs at all, the extension did not inject. Check the actual ERP URL and add its host to `manifest.json`.

If logs show `matchingTables: 0`, the script loaded but did not recognize the grid header. Copy the first 300 characters of the relevant table text from the Console output so the header matcher can be adjusted.
