/**
 * Client entry. Module scripts run once per full page load; everything that
 * depends on the current page re-runs on `astro:page-load` (fires on first load
 * and after every View Transition navigation).
 */
import { initPersistStyles } from './persist-styles';
import { initPreferences } from './preferences';
import { initScroll, onPageScroll } from './scroll';
import { initToc } from './toc';
import { initContent } from './content';
import { initSearch } from './search';
import { initSidebar } from './sidebar';
import { initMusic } from './music';
import { initComments } from './comments';
import { initClock } from './clock';
import { initPowerMode } from './power-mode';
import { initLoadBar } from './load-bar';
import { initTranslate } from './translate';
import { initStats } from './stats';

initPersistStyles(); // must run before any library injects CSS
initLoadBar(); // first, so a slow first load shows progress as early as possible
initPreferences();
initScroll();
initSearch();
initSidebar();
initPowerMode();
initTranslate(); // registers its own astro:page-load handler

document.addEventListener('astro:page-load', () => {
  onPageScroll();
  initToc();
  initContent();
  initMusic();
  initClock();
  initComments();
  initStats();
});
