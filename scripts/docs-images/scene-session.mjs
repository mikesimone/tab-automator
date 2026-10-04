import { launch, SITES, config, seed, openAll, closeBlankTabs, reloadAll, activate, ensureIcons, windows, place, show, dumpTabs } from './scenes.mjs';
import { shot, sleep } from './lib.mjs';

const { ctx, sw, extId } = await launch({ width: 1280, height: 800, scale: 1 });
await seed(sw, config());
await openAll(ctx, [SITES.github, SITES.google, SITES.claude, SITES.docs, SITES.wiki, SITES.bbc, SITES.youtube, SITES.issues], 14000);
await ensureIcons(sw);
await closeBlankTabs(sw);

const ui = await ctx.newPage();
await ui.goto(`chrome-extension://${extId}/src/options.html`);
await ui.locator('.drawer-side').locator('text=Sessions').first().click();
await ui.waitForSelector('text=Save your tabs');
await ui.fill('input[placeholder^="Name (optional)"]', 'Morning setup');
await ui.locator('button:has-text("Save all windows")').click();
await ui.waitForSelector('text=Morning setup');
console.log('saved session');

// Close every web page, as if the browser had been closed and reopened.
await sw.evaluate(async () => {
	const ids = (await chrome.tabs.query({})).filter((t) => t.url?.startsWith('http')).map((t) => t.id);
	await chrome.tabs.remove(ids);
});
await sleep(1500);
await ui.locator('button:has-text("Restore in new window")').click();
await sleep(14000);
await ensureIcons(sw);
await sleep(1500);
const wins = await windows(sw);
console.log(JSON.stringify(wins.map((w) => ({ id: w.id, n: w.tabs.length }))));
const restored = wins.find((w) => w.tabs.some((t) => t.includes('github.com')));
await place(sw, restored.id, 1320, 0);
await show(sw, 'github.com/mikesimone/tab-automator');
await sleep(1500);
await dumpTabs(sw);
shot('10-session-restored', { x: 1320, y: 0, w: 1280, h: 800 });
await ctx.close();
