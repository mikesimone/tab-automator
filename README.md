# <img src="public/assets/icon_16.png" alt="icon"> Tab Automator

[![license](https://img.shields.io/badge/license-MIT-ff4081.svg?style=flat-square&labelColor=black)](./LICENSE.md)

Automate your browser tabs with rules.

## Features

* Rename tab
* Change tab icon
* Pin tab
* Group tabs
* Prevent tab closing
* Unique tab
* Mute tab
* Auto-backup your configuration to Downloads on every change
* Sync your configuration across devices via your browser account
* Test a URL to see which rule applies, with warnings for rules that can never apply
* Pause all rules at once (Alt+Shift+P)
* Share rules as a file, and import rules other people share
* Workspaces: move a group of tabs to its own window (Alt+Shift+M), perfect for demos
* Sessions: save a window, all windows or one group, and restore them later
* Own window: gather every tab a rule matches into one window

Quick rename can be done by right-clicking anywhere in the page and click on "Rename Tab".

### Backup & Sync

In Options > Settings:

* **Auto-Backup on Every Change** - writes a copy of your full configuration to
  `Downloads/tab_automator_config_{datetime}.json` every time you add, edit, or remove
  something, so a browser reset or a bad import never costs you your rules.
  One file is kept per day (named with the date and time of that day's first
  backup) and overwritten as you keep making changes, and files older than 7
  days are deleted, so Downloads never fills up. The manual **Export** in
  Settings uses the same naming.
* **Sync Across Devices** - mirrors your configuration through your browser's
  built-in account sync (`chrome.storage.sync`), so it shows up automatically
  on your other devices signed into the same account. Very large
  configurations (lots of custom icons) may exceed the browser's sync quota;
  Tab Automator detects that and falls back to local + Downloads backup only, rather
  than failing silently.

Both are off by default and can be toggled independently.

### Rules page tools

* **Test a URL** - paste an address to see which rule would apply to it and what
  it would do. Rules are checked top to bottom and the first enabled match wins;
  later matches are shown as never reached. Rules that an earlier rule always
  catches (for plain-text detection types) are marked with a warning in the
  table.
* **Pause all rules** - a switch on the Rules page, or Alt+Shift+P (Command+Shift+P
  on Mac). While paused no rule renames, groups, pins, mutes, protects, closes
  duplicates of or auto-refreshes a tab, and the toolbar icon shows a pause mark.
  Tabs you already changed keep their look until they reload. It is stored on the
  device only, so it is never synced or included in backups.
* **Export rules / Import rules** - pick rules to save as a shareable
  `tab_automator_rules_*.json` file, which carries the groups those rules use.
  Importing shows what is in the file first and adds the rules after your
  existing ones, so shared rules never override your own. Only import files you
  trust.

### Workspaces, sessions and windows

* **Workspaces** - every open tab group is a workspace. On the Workspaces page you can move
  a group to a new window, move it to a window you already have open, save it as a session, or
  close its tabs. **Presenting or demoing?** Put the tabs you want to show in a group and move it
  to a new window: your audience sees only those tabs while your other tabs stay in your original
  window. Alt+Shift+M does the same for the current tab's group (or just the tab, if it isn't in
  a group), and so does **Move tab or group to new window** in the right-click menu.
* **Sessions** - save the current window, all windows, or a single workspace under a name, then
  restore it in a new window or the one you are in. Pinned tabs, groups and group colours come
  back too. Only web pages (http and https) are saved. Sessions stay on this computer and are not
  synced or included in backups.
* **Own window** - a toggle in a rule. Every tab the rule matches is gathered into one window of
  its own, created the first time a match loads (a matching tab that is alone in its window simply
  claims that window). Pinned tabs are left where they are. If you close that window, the next
  match starts a new one.

## Installation

Tab Automator works in Chromium-based browsers (Chrome, Arc, Brave, Edge, Opera). Install it from the
[Chrome Web Store](https://chromewebstore.google.com/detail/mookagdegldeclccpbjgpbdacipiehff), or see
[Load local extension in Chrome](#load-local-extension-in-chrome) to run it from source.

## Usage

* Click on the Tab Automator icon <img src="public/assets/icon_16.png" alt="icon"> to open Popup or Right-Click then Options.
* Create your tab rules.
* Try & enjoy!

## Core system

Tab Automator is based on user *rules* and act on the tab URL that matches the first seen rule. When you open a tab (or refresh), the extension will check if the URL matches a rule and apply the actions.

Aware of that, there is no reason to include a feature that is not "rule-based". Prefer to install specific extensions or create your own.

## Examples

You have infinite possibilities, here are some configurations:

**Distinguish development environments:**

* **Detection**: Contains
* **URL fragment**: localhost
* **Title**: [LOCAL] {title}
* **Icon**: select "bullets > bullet-green"

**Add staging prefix:**

* **Detection**: Contains
* **URL fragment**: staging.yourapp.com
* **Title**: [STAGING] {title}
* **Icon**: select "bullets > bullet-amber"

**Auto-pin documentation tabs:**

* **Detection**: Contains
* **URL fragment**: /docs/
* **Pinned**: ON

**Mute video streaming sites by default:**

* **Detection**: Contains
* **URL fragment**: youtube.com
* **Mute**: ON

**Keep only one email tab open:**

* **Detection**: Starts with
* **URL fragment**: https://mail.google.com
* **Unique**: ON

**Add project info to GitHub repository tabs:**

* **Detection**: Contains
* **URL fragment**: github.com
* **Title**: {title} | $2 by $1
* **URL matcher**: github[.]com/([A-Za-z0-9_-]+)/([A-Za-z0-9_-]+)

Tab title will be: "user/repo: Description | repo by user"

**Display filename for GitHub file views:**

* **Detection**: RegExp
* **URL fragment**: github[.]com/([A-Za-z0-9_-]+)/([A-Za-z0-9_-]+)/blob/
* **Title**: {#file-name-id-wide}

**Group all production tabs:**

* **Detection**: Contains
* **URL fragment**: app.yoursite.com
* **Title**: [PROD] {title}
* **Icon**: select "bullets > bullet-red"
* **Group**: Production

And now, build your own... 💪

## Known issues

### Local icon path doesn't work

Due to browser security restrictions, this path won't work: `file://<path>/icon.png`.
Your icon will not be shown by Chrome.

Alternatively, you can upload your icon somewhere like [imgur.com](http://imgur.com/) and paste the direct link in your rule.

Another solution consists in transform your image in the [Data URI format](https://en.wikipedia.org/wiki/Data_URI_scheme). Go to [ezgif.com](https://ezgif.com/image-to-datauri) and paste the given output (the long text) in the icon input on your rule.

### Chrome system pages `chrome://`

Pages that start with `chrome://` URL are protected. No content script can be injected then Tab Automator will not work on these pages.

### Local files `file:///`

By default, extensions don't have access to local files. You have to opt-in "Allow access to file URLs" from `chrome://extensions/?id=mookagdegldeclccpbjgpbdacipiehff`.

### Protected action is not triggered

Since Chrome 90, the JS event that triggers a refresh or a closure has been reworked, so the confirmation only appears after you've interacted with the page.

## Development

In case you want to contribute or just want to play with the code, follow the guide.

### Setup

Download and install [NodeJS](http://nodejs.org/download/) v20+ to get [npm](https://www.npmjs.org/).

💡 Use `nvm` to allow you to quickly install and use different versions of node via the command line.

Clone the project and install dependencies:

```bash
npm install
```

Type `npm run dev` to watch your changes inside `src/` folder or type `npm run build` after each change.

### Load local extension in Chrome

Go to `chrome://extensions/` and enable the "Developer mode".

Click on "Load unpacked extension..." and select the project `dist/` folder.

## Security

Every code change goes through automated security checks in our CI/CD pipeline:

- **ClamAV Malware Scan**: Detects viruses, trojans, and malware in the codebase
- **Gitleaks Secret Scan**: Prevents hardcoded secrets, API keys, and credentials
- **Dependency Audit**: Checks for known vulnerabilities in dependencies (HIGH severity and above)
- **Test Coverage**: Ensures code quality with comprehensive test suite
- **ReDoS Protection**: Built-in protection against Regular Expression Denial of Service attacks

For detailed security documentation, see [docs/SECURITY.md](docs/SECURITY.md).

## License

MIT; see [LICENSE.md](LICENSE.md).
