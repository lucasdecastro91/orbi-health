/* ============================================================
   ORBI HEALTH — Landing Page Script
   ============================================================ */

/* --- UTM: captura e persiste UTMs em sessionStorage + cookie (30 dias) --- */
function captureAndPersistUTMs() {
  const params = new URLSearchParams(window.location.search);
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(key => {
    const value = params.get(key);
    if (!value) return;
    sessionStorage.setItem(key, value);
    document.cookie = `${key}=${encodeURIComponent(value)};path=/;max-age=2592000;SameSite=Lax`;
  });
}

function getUTMs() {
  const utms = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(key => {
    const fromSession = sessionStorage.getItem(key);
    if (fromSession) { utms[key] = fromSession; return; }
    const match = document.cookie.match(new RegExp(`${key}=([^;]+)`));
    if (match) utms[key] = decodeURIComponent(match[1]);
  });
  return utms;
}

/* --- Header: adiciona sombra ao rolar --- */
function initHeaderScroll() {
  const header = document.querySelector('.header');
  if (!header) return;
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* --- Mobile menu --- */
function initMobileMenu() {
  const toggle = document.querySelector('.nav__toggle');
  const menu   = document.querySelector('.mobile-menu');
  if (!toggle || !menu) return;

  const close = () => {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-hidden', 'true');
  };

  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.contains('open');
    if (isOpen) { close(); return; }
    menu.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    menu.setAttribute('aria-hidden', 'false');
  });

  menu.querySelectorAll('.mobile-menu__link, .btn').forEach(el => {
    el.addEventListener('click', close);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
  });
}

/* --- Smooth scroll para âncoras internas (respeita altura do header fixo) --- */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const offset = 80;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
}

/* --- Scroll reveal via IntersectionObserver (sem dependência externa) --- */
function initScrollReveal() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('revealed'));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('revealed');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
}

/* --- Contadores animados (easeOutCubic, sem lib externa) --- */
function initCounters() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion) {
    document.querySelectorAll('[data-counter]').forEach(el => {
      el.textContent = el.getAttribute('data-counter');
    });
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el     = entry.target;
      const target = parseInt(el.getAttribute('data-counter'), 10);
      const dur    = 1800;
      const start  = performance.now();

      const tick = now => {
        const t = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(eased * target);
        if (t < 1) requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
      observer.unobserve(el);
    });
  }, { threshold: 0.6 });

  document.querySelectorAll('[data-counter]').forEach(el => observer.observe(el));
}

/* --- Rastreamento de CTAs (Meta Pixel + GA4) --- */
function initCTATracking() {
  document.querySelectorAll('[data-cta]').forEach(btn => {
    btn.addEventListener('click', function () {
      const ctaType  = this.getAttribute('data-cta');
      const ctaText  = this.textContent.trim();
      const utms     = getUTMs();
      const eventID  = `cta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      if (window.fbq) {
        const map = { lead: 'Lead', checkout: 'InitiateCheckout', contact: 'Contact' };
        fbq('track', map[ctaType] || 'Lead', { content_name: ctaText, ...utms }, { eventID });
      }

      if (window.gtag) {
        gtag('event', 'cta_click', { cta_type: ctaType, cta_text: ctaText, ...utms });
      }
    });
  });
}

/* --- Init --- */
document.addEventListener('DOMContentLoaded', () => {
  captureAndPersistUTMs();
  initHeaderScroll();
  initMobileMenu();
  initSmoothScroll();
  initScrollReveal();
  initCounters();
  initCTATracking();
});
