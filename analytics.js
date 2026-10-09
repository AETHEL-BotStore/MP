/* Yandex Metrika: stable event names shared by the Russian and English pages. */
(() => {
  'use strict';
  if (window.__siteAnalyticsStarted) return;
  window.__siteAnalyticsStarted = true;

  const COUNTER_ID = 113586801;
  const IDLE_MS = 60000;
  const HEARTBEAT_MS = 15000;
  const language = document.documentElement.lang || 'ru';
  const pageKind = document.body.dataset.pageKind || 'home';
  const context = { language, page_kind: pageKind, version: '1' };
  const sections = [...document.querySelectorAll('[data-analytics-section]')].map(element => ({
    element,
    id: element.dataset.analyticsSection,
    visibleMs: 0,
    activeMs: 0,
    sentMs: 0,
    viewed: false,
    engaged: false
  }));
  const cards = [...document.querySelectorAll('[data-analytics-client], [data-analytics-service]')].map(element => ({
    element,
    id: element.dataset.analyticsClient || element.dataset.analyticsService,
    kind: element.dataset.analyticsClient ? 'client' : 'service',
    visibleMs: 0,
    viewed: false
  }));
  let lastTick = performance.now();
  let lastActivity = lastTick;
  let focused = document.hasFocus();
  let running = true;
  let previousPrimary = '';
  let previousVisible = new Set();
  let previousCards = new Set();
  let lastSection = pageKind === 'not_found' ? 'not_found' : 'top';
  let activeMs = 0;
  let sentActiveMs = 0;
  let lastHeartbeat = lastTick;
  let maxScroll = 0;
  let departureSent = false;
  let lastOutbound = '';
  const reached = new Set();
  const dialog = document.querySelector('.image-dialog');

  function send(method, ...args) {
    if (typeof window.ym !== 'function') return;
    try { window.ym(COUNTER_ID, method, ...args); } catch (_) { /* Analytics must not interrupt the site. */ }
  }

  function event(name, key, values = {}, goal = null) {
    const detail = { ...context, section: lastSection, ...values };
    // params remains available even before the owner creates JavaScript goals.
    send('params', { site_events: { [name]: { [key]: { count: 1, ...detail } } } });
    if (goal) send('reachGoal', goal, { site_goal: { event: name, item: key, ...detail } });
  }

  function isActive(now) {
    return running && document.visibilityState === 'visible' && focused && now - lastActivity < IDLE_MS;
  }

  function visibleHeight(element) {
    if (element.hidden || element.getClientRects().length === 0) return 0;
    const rect = element.getBoundingClientRect();
    const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom || 0;
    return Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, headerBottom));
  }

  function enoughVisible(element, height) {
    // Works for sections taller than a phone viewport and small service cards.
    const rect = element.getBoundingClientRect();
    return height >= Math.min(160, window.innerHeight * 0.25, rect.height * 0.25);
  }

  function measureViewport() {
    const visible = new Set();
    const visibleCards = new Set();
    let primary = '';
    let largest = 0;
    if (!dialog?.open) {
      sections.forEach(section => {
        const height = visibleHeight(section.element);
        if (height > 0 && enoughVisible(section.element, height)) visible.add(section.id);
        if (height > largest) { largest = height; primary = section.id; }
      });
      cards.forEach(card => {
        const height = visibleHeight(card.element);
        if (height > 0 && enoughVisible(card.element, height)) visibleCards.add(card.id);
      });
    }
    if (primary) lastSection = primary;
    previousPrimary = primary;
    previousVisible = visible;
    previousCards = visibleCards;
  }

  function account(now = performance.now()) {
    // Attribute the elapsed interval to the viewport BEFORE a scroll/focus change.
    // Large gaps caused by OS sleep or frozen tabs are excluded.
    const gap = now - lastTick;
    const elapsed = running && focused && document.visibilityState === 'visible' && gap <= 5000
      ? Math.max(0, Math.min(now, lastActivity + IDLE_MS) - lastTick) : 0;
    lastTick = now;
    if (elapsed > 0) {
      activeMs += elapsed;
      sections.forEach(section => {
        section.visibleMs = previousVisible.has(section.id) ? section.visibleMs + elapsed : 0;
        if (section.id === previousPrimary) section.activeMs += elapsed;
        if (!section.viewed && section.visibleMs >= 1000) {
          section.viewed = true;
          event('section_view', section.id, { section: section.id }, 'section_view');
        }
        if (!section.engaged && section.activeMs >= 5000) {
          section.engaged = true;
          event('section_engaged', section.id, { section: section.id, threshold_seconds: 5 }, 'section_engaged');
        }
      });
      cards.forEach(card => {
        card.visibleMs = previousCards.has(card.id) ? card.visibleMs + elapsed : 0;
        if (!card.viewed && card.visibleMs >= 1000) {
          card.viewed = true;
          event(`${card.kind}_view`, card.id, { section: card.kind === 'client' ? 'work' : 'services' });
        }
      });
      [30, 60, 120].forEach(seconds => {
        const key = `active_${seconds}s`;
        if (activeMs >= seconds * 1000 && !reached.has(key)) {
          reached.add(key);
          event('active_time', key, { threshold_seconds: seconds }, key);
        }
      });
    }
    if (isActive(now)) measureViewport();
    if (now - lastHeartbeat >= HEARTBEAT_MS) {
      flushTime('heartbeat');
      lastHeartbeat = now;
    }
  }

  function flushTime(reason) {
    const deltas = {};
    sections.forEach(section => {
      const delta = section.activeMs - section.sentMs;
      if (delta > 0) {
        deltas[section.id] = { active_seconds: delta / 1000 };
        section.sentMs = section.activeMs;
      }
    });
    const delta = activeMs - sentActiveMs;
    if (delta <= 0) return;
    sentActiveMs = activeMs;
    send('params', {
      site_context: context,
      site_page_time: { active_seconds: delta / 1000 },
      site_section_time: deltas,
      site_checkpoint: { section: lastSection, reason, max_scroll_percent: maxScroll }
    });
  }

  function scrollDepth() {
    const height = document.documentElement.scrollHeight;
    const scrollable = height - window.innerHeight;
    // A short 404 page isn't a "100% scrolled" landing page.
    if (scrollable < 100) return;
    const percent = Math.min(100, Math.round(window.scrollY / scrollable * 100));
    maxScroll = Math.max(maxScroll, percent);
    [25, 50, 75, 90, 100].forEach(threshold => {
      const key = `scroll_${threshold}`;
      if (maxScroll >= threshold && !reached.has(key)) {
        reached.add(key);
        event('scroll_depth', key, { percent: threshold }, key);
      }
    });
  }

  function activity() {
    const now = performance.now();
    account(now);
    lastActivity = now;
    if (isActive(now)) measureViewport();
  }

  function placement(element) {
    if (element.closest('.site-header')) return 'header';
    if (element.closest('.site-footer')) return 'footer';
    return element.closest('[data-analytics-section]')?.dataset.analyticsSection || lastSection;
  }

  function trackLink(link) {
    const href = link.getAttribute('href') || '';
    const section = placement(link);
    const id = link.dataset.analyticsId || 'link';
    const service = link.closest('[data-analytics-service]')?.dataset.analyticsService;
    const client = link.closest('[data-analytics-client]')?.dataset.analyticsClient;
    const values = { section, placement: section, ...(service ? { service } : {}), ...(client ? { client } : {}) };
    let goal = link.dataset.analyticsGoal || null;
    if (link.closest('.language-switch')) {
      if (link.getAttribute('aria-current') === 'page') return;
      event('language_switch', id, { ...values, target_language: link.lang }, 'language_switch');
    } else if (href.startsWith('#')) {
      event('navigation', id, { ...values, target_section: href.slice(1) });
    } else {
      const url = new URL(href, location.href);
      // Do not transmit query strings, hashes, user-entered text or form values.
      const target = url.hostname + url.pathname;
      lastOutbound = target;
      event('link_click', id, { ...values, target }, goal);
      if (service && ['custom_bot', 'website', 'consultation'].includes(service)) {
        const serviceGoals = { custom_bot: 'service_bot', website: 'service_website', consultation: 'service_consultation' };
        send('reachGoal', serviceGoals[service], { site_goal: { ...context, ...values, item: id } });
      }
    }
  }

  document.addEventListener('click', e => {
    if (!(e.target instanceof Element)) return;
    const link = e.target.closest('a[href]');
    if (link) { activity(); trackLink(link); return; }
    const button = e.target.closest('button');
    if (!button || button.closest('[data-carousel], .image-dialog') || button.matches('.menu-toggle')) return;
    activity();
    event('button_click', button.dataset.analyticsId || 'button', { section: placement(button) });
  }, true);
  document.addEventListener('auxclick', e => {
    if (e.button !== 1 || !(e.target instanceof Element)) return;
    const link = e.target.closest('a[href]');
    if (link) { activity(); trackLink(link); }
  }, true);
  ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'].forEach(type => {
    let lastHandled = -Infinity;
    document.addEventListener(type, () => {
      const now = performance.now();
      if (now - lastHandled < 250) return;
      lastHandled = now;
      activity();
    }, { passive: true });
  });
  let scrollPending = false;
  window.addEventListener('scroll', () => {
    // Settle time immediately against the old section, then sample the new viewport.
    activity();
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => { scrollPending = false; scrollDepth(); });
  }, { passive: true });
  window.addEventListener('resize', () => { account(); measureViewport(); });
  window.addEventListener('blur', () => { account(); focused = false; flushTime('blur'); });
  window.addEventListener('focus', () => {
    lastTick = performance.now();
    lastActivity = lastTick;
    focused = true;
    measureViewport();
  });
  document.addEventListener('visibilitychange', () => {
    // visibilityState has already changed: settle using the previous foreground state.
    if (document.visibilityState === 'hidden') {
      const now = performance.now();
      const originalTick = lastTick;
      // account() cannot count a now-hidden document, so settle the final interval explicitly.
      const delta = focused && running && now - originalTick <= 5000
        ? Math.max(0, Math.min(now, lastActivity + IDLE_MS) - originalTick) : 0;
      activeMs += delta;
      const primary = sections.find(section => section.id === previousPrimary);
      if (primary) primary.activeMs += delta;
      lastTick = now;
      flushTime('hidden');
      // Hiding a tab is a checkpoint, never treated as leaving the site.
    } else {
      lastTick = performance.now();
      lastActivity = lastTick;
      focused = document.hasFocus();
      measureViewport();
    }
  });

  window.addEventListener('site:interaction', e => {
    const detail = e.detail;
    if (!detail || typeof detail.action !== 'string') return;
    activity();
    const { action, client = '', ...values } = detail;
    event(action, client || values.item || 'menu', {
      ...values,
      ...(client ? { client, section: 'work' } : {})
    }, action === 'gallery_open' ? 'gallery_open' : null);
    measureViewport();
  });

  window.addEventListener('pagehide', e => {
    account();
    flushTime(e.persisted ? 'bfcache' : 'pagehide');
    if (!e.persisted && !departureSent) {
      departureSent = true;
      event('page_departure', lastSection, {
        section: lastSection,
        active_seconds: activeMs / 1000,
        max_scroll_percent: maxScroll,
        last_outbound: lastOutbound || 'none'
      });
    }
    running = false;
  });
  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    running = true;
    focused = document.hasFocus();
    lastTick = performance.now();
    lastActivity = lastTick;
    measureViewport();
    event('page_resume', lastSection);
  });

  send('params', { site_context: context });
  if (pageKind === 'not_found') event('page_not_found', '404', {}, 'page_not_found');
  measureViewport();
  // One local timer, one combined timing request per 15 s; no request per scroll/pixel.
  window.setInterval(() => account(), 1000);
})();
