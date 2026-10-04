import { launch, SITES, config, seed, openAll, closeBlankTabs, reloadAll, activate, ensureIcons } from './scenes.mjs';
import { shot, sleep } from './lib.mjs';

const { ctx, sw } = await launch({ width: 1280, height: 800, scale: 1 });
await seed(sw, config());
await openAll(ctx, [SITES.github, SITES.google, SITES.claude, SITES.docs, SITES.wiki, SITES.bbc, SITES.youtube, SITES.issues], 14000);
await ensureIcons(sw);
await closeBlankTabs(sw);
await activate(sw, 'wikipedia.org');
await sw.evaluate(async () => {
	const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
	await chrome.tabs.sendMessage(tab.id, { action: 'toggleSpotSearch' });
});
await sleep(900);
const page = ctx.pages().find((p) => p.url().includes('wikipedia.org'));
await page.keyboard.type('git', { delay: 120 });
await sleep(1800);
shot('12-spot-search');
await ctx.close();
