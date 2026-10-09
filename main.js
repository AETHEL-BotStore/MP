const isEnglish = document.documentElement.lang === 'en';
const menuButton = document.querySelector('.menu-toggle');
const mobileMenu = document.querySelector('#mobile-menu');

function reportInteraction(action, detail = {}) {
  window.dispatchEvent(new CustomEvent('site:interaction', { detail: { action, ...detail } }));
}

function closeMenu() {
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', isEnglish ? 'Open menu' : 'Открыть меню');
  mobileMenu.hidden = true;
}

menuButton.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  menuButton.setAttribute('aria-label', isOpen
    ? (isEnglish ? 'Open menu' : 'Открыть меню')
    : (isEnglish ? 'Close menu' : 'Закрыть меню'));
  mobileMenu.hidden = isOpen;
  reportInteraction('menu_toggle', { item: isOpen ? 'close' : 'open', section: 'header' });
});

mobileMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMenu();
});

document.querySelectorAll('[data-lang-link]').forEach(link => {
  link.addEventListener('click', () => {
    if (window.location.hash) link.href += window.location.hash;
  }, { once: true });
});

const codeReveal = document.querySelector('[data-code-reveal]');
if (codeReveal && 'IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  codeReveal.classList.add('code-ready');
  const observer = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    observer.disconnect();
    codeReveal.classList.add('is-revealing');
    window.setTimeout(() => {
      codeReveal.classList.remove('is-revealing');
      codeReveal.classList.add('is-revealed');
    }, 1650);
  }, { threshold: 0.3 });
  observer.observe(codeReveal);
}

const dialog = document.querySelector('.image-dialog');
const dialogImage = dialog.querySelector('img');
const closeDialogButton = dialog.querySelector('.dialog-close');
const dialogPrevious = dialog.querySelector('.dialog-prev');
const dialogNext = dialog.querySelector('.dialog-next');
let activeCarousel = null;

function updateDialog() {
  if (!activeCarousel) return;
  const moveFocus = (document.activeElement === dialogPrevious && activeCarousel.current === 0)
    || (document.activeElement === dialogNext && activeCarousel.current === activeCarousel.slides.length - 1);
  const image = activeCarousel.slides[activeCarousel.current].querySelector('img');
  dialogImage.src = image.currentSrc || image.src;
  dialogImage.alt = image.alt;
  dialogPrevious.hidden = activeCarousel.current === 0;
  dialogNext.hidden = activeCarousel.current === activeCarousel.slides.length - 1;
  if (moveFocus) closeDialogButton.focus();
}

function openDialog(carousel, source) {
  activeCarousel = carousel;
  updateDialog();
  dialog.showModal();
  document.body.classList.add('dialog-open');
  closeDialogButton.focus();
  reportInteraction('gallery_open', { client: carousel.client, slide: carousel.current === 0 ? 'profile' : 'bot', source });
}

document.querySelectorAll('[data-carousel]').forEach(carousel => {
  const slides = [...carousel.querySelectorAll('.proof-slide')];
  const previous = carousel.querySelector('.slide-prev');
  const next = carousel.querySelector('.slide-next');
  const counter = carousel.querySelector('.proof-count');
  const enlarge = carousel.querySelector('.view-image');
  let touchStart = null;

  const api = {
    slides,
    client: carousel.closest('[data-analytics-client]')?.dataset.analyticsClient || 'unknown',
    current: 0,
    showSlide(index, source) {
      const oldIndex = this.current;
      this.current = Math.max(0, Math.min(index, slides.length - 1));
      slides.forEach((slide, slideIndex) => {
        slide.hidden = slideIndex !== this.current;
      });
      previous.hidden = this.current === 0;
      next.hidden = this.current === slides.length - 1;
      const label = this.current === 0
        ? (isEnglish ? 'PROFILE' : 'ПРОФИЛЬ')
        : (isEnglish ? 'BOOKING BOT' : 'БОТ ЗАПИСИ');
      counter.textContent = `${String(this.current + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')} · ${label}`;
      if (activeCarousel === this && dialog.open) updateDialog();
      if (source && oldIndex !== this.current) {
        reportInteraction('gallery_slide', { client: this.client, slide: this.current === 0 ? 'profile' : 'bot', direction: this.current > oldIndex ? 'next' : 'previous', source, expanded: dialog.open });
      }
    }
  };

  previous.addEventListener('click', () => api.showSlide(api.current - 1, 'card_arrow'));
  next.addEventListener('click', () => api.showSlide(api.current + 1, 'card_arrow'));
  enlarge.addEventListener('click', () => openDialog(api, 'button'));
  slides.forEach(slide => slide.querySelector('img').addEventListener('click', () => openDialog(api, 'image')));

  carousel.addEventListener('touchstart', event => {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  carousel.addEventListener('touchend', event => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      api.showSlide(api.current + (deltaX < 0 ? 1 : -1), 'swipe');
    }
    touchStart = null;
  }, { passive: true });

  api.showSlide(0);
});

dialogPrevious.addEventListener('click', () => activeCarousel?.showSlide(activeCarousel.current - 1, 'dialog_arrow'));
dialogNext.addEventListener('click', () => activeCarousel?.showSlide(activeCarousel.current + 1, 'dialog_arrow'));
dialog.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') activeCarousel?.showSlide(activeCarousel.current - 1, 'keyboard');
  if (event.key === 'ArrowRight') activeCarousel?.showSlide(activeCarousel.current + 1, 'keyboard');
});
closeDialogButton.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});
dialog.addEventListener('close', () => {
  if (activeCarousel) reportInteraction('gallery_close', { client: activeCarousel.client, slide: activeCarousel.current === 0 ? 'profile' : 'bot' });
  document.body.classList.remove('dialog-open');
  dialogImage.removeAttribute('src');
  activeCarousel = null;
});

document.querySelector('#year').textContent = new Date().getFullYear();
