import { launch, SITES, config, seed, openAll, closeBlankTabs, reloadAll, activate, ensureIcons, settleClaude } from './scenes.mjs';
import { shot, sleep } from './lib.mjs';

const { ctx, sw } = await launch({ width: 1600, height: 460, scale: 2 });
await seed(sw, config());
await openAll(ctx, [SITES.github, SITES.google, SITES.claude, SITES.docs, SITES.wiki, SITES.bbc, SITES.youtube, SITES.issues], 12000);
await ensureIcons(sw);
await closeBlankTabs(sw);
await activate(sw, 'github.com/mikesimone/tab-automator');
await sw.evaluate(async () => chrome.storage.local.set({ tab_automator_paused: true }));
await sleep(1500);
await reloadAll(sw);
await sleep(12000);
await settleClaude(sw);
await closeBlankTabs(sw);
await activate(sw, 'github.com/mikesimone/tab-automator');
shot('strip-paused', { x: 0, y: 0, w: 3200, h: 176 });
await ctx.close();
