import { launch, SITES, config, seed, openAll, closeBlankTabs, reloadAll, activate, ensureIcons } from './scenes.mjs';
import { shot, sleep } from './lib.mjs';

const { ctx, sw } = await launch({ width: 1600, height: 460, scale: 2 });
await openAll(ctx, [SITES.github, SITES.google, SITES.claude, SITES.docs, SITES.wiki, SITES.bbc, SITES.youtube, SITES.issues], 10000);
await closeBlankTabs(sw);
await activate(sw, 'github.com/mikesimone/tab-automator');
shot('strip-before', { x: 0, y: 0, w: 3200, h: 176 });

await seed(sw, config());
await reloadAll(sw);
await sleep(12000);
await ensureIcons(sw);
await closeBlankTabs(sw);
await activate(sw, 'github.com/mikesimone/tab-automator');
shot('strip-after', { x: 0, y: 0, w: 3200, h: 176 });

// Pause all rules, then reload: tabs go back to how the sites name them.
await sw.evaluate(async () => chrome.storage.local.set({ tab_automator_paused: true }));
await sleep(1500);
await reloadAll(sw);
await sleep(12000);
await closeBlankTabs(sw);
await activate(sw, 'github.com/mikesimone/tab-automator');
shot('strip-paused', { x: 0, y: 0, w: 3200, h: 176 });
await ctx.close();
