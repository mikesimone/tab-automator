# <img src="public/assets/icon_16.png" alt="icon"> Tab Automator

[![license](https://img.shields.io/badge/license-MIT-ff4081.svg?style=flat-square&labelColor=black)](./LICENSE.md)

Automate your browser tabs with rules.

> **Tab Automator is a community fork of [Tabee](https://github.com/furybee/chrome-tab-modifier)
> (formerly Tab Modifier) by [FuryBee](https://github.com/furybee).** Nearly all of this extension
> is FuryBee's work, used under the MIT license. The fork exists to ship features that are waiting
> on upstream review, starting with auto-backup and cross-device sync
> ([furybee/chrome-tab-modifier#555](https://github.com/furybee/chrome-tab-modifier/pull/555)).
> It is not affiliated with or endorsed by FuryBee. If you'd rather use the original, install
> [Tabee from the Chrome Web Store](https://chromewebstore.google.com/detail/tabee-tab-modifier/penegkenfmliefdbmnfkidlgjfjcidia).

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

Quick rename can be done by right-clicking anywhere in the page and click on "Rename Tab".

### Backup & Sync

In Options > Settings:

* **Auto-Backup on Every Change** - writes a copy of your full configuration to
  `Downloads/tab-automator.auto-backup.json` every time you add, edit, or remove
  something, so a browser reset or a bad import never costs you your rules.
  The file is overwritten in place (no growing pile of numbered copies).
* **Sync Across Devices** - mirrors your configuration through your browser's
  built-in account sync (`chrome.storage.sync`), so it shows up automatically
  on your other devices signed into the same account. Very large
  configurations (lots of custom icons) may exceed the browser's sync quota;
  Tab Automator detects that and falls back to local + Downloads backup only, rather
  than failing silently.

Both are off by default and can be toggled independently.

## Installation

Tab Automator works in Chromium-based browsers (Chrome, Arc, Brave, Edge, Opera). The Chrome Web
Store listing is coming soon; until then, see [Load local extension in Chrome](#load-local-extension-in-chrome).

## Usage

* Click on the Tab Automator icon <img src="public/assets/icon_16.png" alt="icon"> to open Popup or Right-Click then Options.
* Create your tab rules.
* Try & enjoy!

## Why did you build this extension?

I needed a quick UI element in Chrome to know the environment of the tab, as a Web developer I often use multiple versions of the same website: local, pre-production and production.

Not easy to find the appropriate tab when you have multiple tabs called "My awesome website".

*(In FuryBee's words, from the original project.)*

I created Tabee (formerly Tab Modifier) to add prefixes to website titles with a specific match.

* [DEV] My awesome website: `.local.domain.com`
* [PREPROD] My awesome website: `.preprod.domain.com`
* [PROD] My awesome website: `.domain.com`

After that, I have added more features like "auto-pin", custom favicons and more.

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

Related issue: [#5](https://github.com/furybee/chrome-tab-modifier/issues/5)

Due to browser security restrictions, this path won't work: `file://<path>/icon.png`.
Your icon will not be shown by Chrome.

Alternatively, you can upload your icon somewhere like [imgur.com](http://imgur.com/) and paste the direct link in your rule.

Another solution consists in transform your image in the [Data URI format](https://en.wikipedia.org/wiki/Data_URI_scheme). Go to [ezgif.com](https://ezgif.com/image-to-datauri) and paste the given output (the long text) in the icon input on your rule.

### Chrome system pages `chrome://`

Related issues: [#11](https://github.com/furybee/chrome-tab-modifier/issues/11), [#14](https://github.com/furybee/chrome-tab-modifier/issues/14)

Pages that start with `chrome://` URL are protected. No content script can be injected then Tab Automator will not work on these pages.

### Local files `file:///`

Related issue: [#13](https://github.com/furybee/chrome-tab-modifier/issues/13)

By default, extensions don't have access to local files. You have to opt-in "Allow access to file URLs" from `chrome://extensions/?id=penegkenfmliefdbmnfkidlgjfjcidia`.

### Protected action is not triggered

Related issue: [#95](https://github.com/furybee/chrome-tab-modifier/issues/95)

Since Chrome 90, the JS event that triggers a refresh or a closure has been reworked. See related issue.

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

## Supporting the original author

Tab Automator is built on FuryBee's work. If you like it, consider supporting FuryBee directly:

- [Buy Me a Coffee](https://www.buymeacoffee.com/xyugxh7bk)
- [Credit Card](https://donate.stripe.com/fZeg1Sgml971dbieUU)
- [Paypal](https://www.paypal.com/donate/?hosted_button_id=T7KZA4MLT5XTU)

## Security

Tab Automator inherits Tabee's security checks. Every code change goes through automated security checks in our CI/CD pipeline:

- **ClamAV Malware Scan**: Detects viruses, trojans, and malware in the codebase
- **Gitleaks Secret Scan**: Prevents hardcoded secrets, API keys, and credentials
- **Dependency Audit**: Checks for known vulnerabilities in dependencies (HIGH severity and above)
- **Test Coverage**: Ensures code quality with comprehensive test suite
- **ReDoS Protection**: Built-in protection against Regular Expression Denial of Service attacks

For detailed security documentation, see [docs/SECURITY.md](docs/SECURITY.md).

## License

MIT. Original work copyright (c) 2014 FuryBee; see [LICENSE.md](LICENSE.md).
