import { launch, SITES, openAll, closeBlankTabs, activate, groupTabs, windows, place, show, dumpTabs } from './scenes.mjs';
import { shot, sleep } from './lib.mjs';

const { ctx, sw, extId } = await launch({ width: 1280, height: 800, scale: 1 });
await openAll(ctx, [SITES.google, SITES.github, SITES.claude, SITES.store, SITES.youtube, SITES.docs, SITES.wiki, SITES.bbc], 11000);
await closeBlankTabs(sw);
await groupTabs(sw, ['github.com/mikesimone/tab-automator', 'chromewebstore.google.com', 'developer.chrome.com'], 'Product demo', 'purple');
await sleep(800);
await activate(sw, 'github.com/mikesimone/tab-automator');
await dumpTabs(sw);
shot('05-demo-before');

const options = await ctx.newPage();
await options.goto(`chrome-extension://${extId}/src/options.html`);
await options.locator('.drawer-side').locator('text=Workspaces').first().click();
await options.waitForSelector('td:has-text("Product demo")');
await options.locator('tr:has-text("Product demo") button:has-text("New window")').click();
await sleep(2500);
await options.close();
await sleep(800);

const wins = await windows(sw);
console.log(JSON.stringify(wins));
const presenter = wins.find((w) => w.tabs.length === 3 && w.tabs.some((t) => t.includes('github.com')));
const other = wins.find((w) => w !== presenter);
await place(sw, other.id, 0, 0);
await place(sw, presenter.id, 1320, 0);
await show(sw, 'github.com/mikesimone/tab-automator');
await sw.evaluate(async (id) => { const t = (await chrome.tabs.query({ windowId: id })).find((x) => x.url.includes('google.com/')); if (t) await chrome.tabs.update(t.id, { active: true }); }, other.id);
await sleep(1500);
await dumpTabs(sw);
shot('06-demo-presenter-window', { x: 1320, y: 0, w: 1280, h: 800 });
shot('07-demo-your-other-window', { x: 0, y: 0, w: 1280, h: 800 });
shot('08-demo-side-by-side', { x: 0, y: 0, w: 2600, h: 800 });
await ctx.close();
