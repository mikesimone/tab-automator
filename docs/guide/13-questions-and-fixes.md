# 13. Questions and fixes

[← Back to the guide](README.md)

## I made a rule, but my tab didn't change.

Try these in order:

1. **Reload the tab.** Press **F5** (**Command + R** on a Mac). Rules apply when a page loads, so tabs that were already open don't change until they reload.
2. **Check that the rule is on.** On the **📋 Rules** page, its switch should be on, and in the rule itself the bottom switch should say **Enabled**.
3. **Check that rules aren't paused.** If the Tab Automator button shows a pause mark, press **Alt + Shift + P** to resume. See [Turn every rule off for a while](05-which-pages-a-rule-covers.md#turn-every-rule-off-for-a-while).
4. **Test the address.** On the **📋 Rules** page, open **Test a URL** and paste the page's address. It tells you which rule applies, or that none does. If a different rule wins, drag your rule above it. See [When two rules cover the same page](05-which-pages-a-rule-covers.md#when-two-rules-cover-the-same-page-top-wins).
5. **Check the URL Fragment.** It must really be part of the page's address. Copy the address from the address bar and compare. A common mistake is typing `https://` with **Contains** when the site uses `http://`, or the other way around. Leave the `https://` off when you use **Contains**.

## It doesn't work on some pages.

Chrome doesn't let any extension change its own pages: the New Tab page, Settings, the Extensions page, the Chrome Web Store, and anything starting with `chrome://`. Tab Automator can't rename or change those tabs. A few websites also keep changing their own title or icon, and may win out now and then.

## It doesn't work on files on my computer.

Pages that start with `file:///` (like a PDF you opened from your computer) are blocked by Chrome unless you allow it:

1. Type `chrome://extensions/?id=mookagdegldeclccpbjgpbdacipiehff` in the address bar and press **Enter**.
2. Turn on **Allow access to file URLs**.

## "Ask before closing" doesn't ask.

Chrome only shows the "Leave site?" question if you've clicked or typed on the page at least once since it loaded. This is a Chrome safety rule, so websites can't trap you on a page you never touched.

## My own picture for a tab icon doesn't show up.

Chrome won't show pictures from your computer by their file location (like `C:\Pictures\icon.png`). Instead, open the picture, copy it (**Ctrl + C**, or **Command + C** on a Mac), and paste it into the **Custom Icon** box with **Ctrl + V**. Tab Automator stores the picture itself, so it always works.

## Can I use text from the page in the tab title?

Yes. Anything in curly brackets is copied from the page:

- `{title}`: the page's own title
- `{h1}`: the page's main heading
- `{#name}`: the text of the part of the page with that id
- `{.name}`: the text of the first part of the page with that class

For example, on YouTube, `{.ytd-channel-name a} - {title}` puts the channel name in front of the video title. Finding the right name takes a little web know-how: right-click the text on the page and choose **Inspect** to see it.

## Will Tab Automator slow down my computer?

It's designed to be light, and it only acts when a page loads or changes its title. If one heavy website feels slow, add it to [Lightweight Mode](11-settings.md#lightweight-mode).

## What does Tab Automator know about me?

Nothing. It doesn't collect, send or sell anything. Your rules and settings stay on your computer (and in your own Chrome account, if you turn on sync). The code is open for anyone to read on [GitHub](https://github.com/mikesimone/tab-automator).

## I deleted a rule by mistake.

If you had [automatic backup](10-backup-sync-share.md#automatic-backup-recommended) on, go to **⚙️ Settings → Backup → Import**, choose the newest `tab_automator_config_…json` file in your Downloads folder, and pick **Import & Merge** to add back what's missing.

## Something else is wrong, or I have an idea.

Please [open an issue on GitHub](https://github.com/mikesimone/tab-automator/issues). Tell us what you did, what you expected, and what happened instead. A screenshot helps a lot.

[Next: Word list →](14-word-list.md)
