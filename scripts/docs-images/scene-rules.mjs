import { launch, SITES, config, seed, openAll, closeBlankTabs, reloadAll, activate, ensureIcons, dumpTabs } from './scenes.mjs';
import { shot, sleep } from './lib.mjs';

const { ctx, sw } = await launch({ width: 1280, height: 800, scale: 1 });
await openAll(ctx, [SITES.github, SITES.google, SITES.claude, SITES.docs, SITES.wiki, SITES.bbc, SITES.youtube, SITES.issues], 10000);
await closeBlankTabs(sw);
await activate(sw, 'github.com/mikesimone/tab-automator');
await dumpTabs(sw);
shot('01-before-rules');

await seed(sw, config());
await reloadAll(sw);
await sleep(12000);
await ensureIcons(sw);
await closeBlankTabs(sw);
await activate(sw, 'github.com/mikesimone/tab-automator');
await dumpTabs(sw);
shot('02-after-rules');
await ctx.close();
