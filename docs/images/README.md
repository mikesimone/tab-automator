# Tab Automator images

Screenshots and graphics for the README, the store listing, explainer videos and anything else that needs to show what Tab Automator does. Each entry says what is in the picture. The sample data is made up ("Acme"); the websites in the browser shots are real public pages.

The browser shots are real: an actual Chrome window running the extension, captured with its tab strip, groups, pinned tab, icons and toolbar badge. Nothing was drawn by hand. The infographics (19, 20) and the labels on the composites (03, 04, 11) were added afterward. Third-party logos and pages belong to their owners and appear only to show the extension at work.

## What the tabs look like

| File | Shows |
|---|---|
| `01-before-rules.png` | A browser window with eight tabs, no rules yet. Every tab is named by the site that opened it. |
| `02-after-rules.png` | The same tabs after seven rules: Google pinned, tabs renamed, groups (Dev, AI, Docs, Reading) with colored chips, emoji icons, YouTube muted. |
| `03-tab-strip-before-after.png` | Close-up of the tab strip before and after the rules, one above the other. |
| `04-tab-strip-what-changed.png` | The "after" strip with a legend: pinned, groups, renamed titles, muted and icons. |
| `11-pause-all-rules.png` | Rules on versus paused. Paused (Alt+Shift+P): sites go back to their own names and icons, nothing is grouped, and the toolbar icon shows a pause mark. |
| `12-spot-search.png` | Spot Search (Alt+Shift+E) open on a page, searching "git" across open tabs and showing the Dev group badge. |

## Workspaces, windows and sessions

| File | Shows |
|---|---|
| `05-demo-before-one-busy-window.png` | One window with eight tabs; three of them (GitHub, the Chrome Web Store listing and Chrome docs) form a group named "Product demo". |
| `06-demo-presenter-window.png` | After moving that group to a new window: a window with only the three demo tabs, group name and color kept. This is what an audience sees. |
| `07-demo-your-other-window.png` | The original window afterward, with the other five tabs, out of sight of the audience. |
| `08-demo-side-by-side.png` | Both windows next to each other: your other window on the left, the presenter window on the right. |
| `09-own-window-side-by-side.png` | The "Own window" rule: every GitHub tab gathered into a window of its own (right), everything else left behind (left). |
| `10-session-restored.png` | A saved session restored into a new window after every tab was closed: the pinned tab, groups, names and muted state all came back. |

## The screens

| File | Shows |
|---|---|
| `13-screen-rules.png` | The Rules page, with the new "Test a URL" bar, "Import rules", "Export rules" and "Pause all rules". |
| `14-screen-workspaces.png` | The Workspaces page: each open tab group with New window, Move to…, Save as session and Close tabs. |
| `15-screen-sessions.png` | The Sessions page: saved sessions, one expanded to list its tabs. |
| `16-screen-test-a-url.png` | "Test a URL": which rule applies to an address, and a rule that matches but is never reached (with the warning in the table). |
| `17-screen-own-window-rule.png` | Editing a rule with the "Own window" switch on and its help text showing. |
| `18-screen-share-rules.png` | Exporting a chosen set of rules as a shareable file. |

## Graphics

| File | Shows |
|---|---|
| `19-keyboard-shortcuts.png` | The four shortcuts: Alt+Shift+M (move to a new window), Alt+Shift+P (pause or resume all rules), Alt+Shift+E (Spot Search), Alt+Shift+W (merge all windows). |
| `20-how-rules-are-matched.png` | Rules are checked top to bottom and the first enabled match wins, with what a matching rule can do. |

`source/` holds the HTML the two graphics are made from. The scripts that produced everything are in `scripts/docs-images/`.
