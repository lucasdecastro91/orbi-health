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

/* --- Pricing toggle (mensal / anual + por alunos) --- */
function initPricingToggle() {
  const toggle     = document.getElementById('billing-toggle');
  const labelMonth = document.getElementById('toggle-monthly-label');
  const labelYear  = document.getElementById('toggle-annual-label');
  if (!toggle) return;

  // Estado global
  let isAnnual = false;
  const tierState = { motion: '50', pro: '50' };

  function updatePrices() {
    const billing = isAnnual ? 'annual' : 'monthly';
    const period  = isAnnual ? '/ano'   : '/mês';

    // Motion
    const motionEl     = document.querySelector('[data-motion-price]');
    const motionPeriod = document.querySelector('[data-motion-period]');
    if (motionEl) {
      const key = `data-${billing}-${tierState.motion === '50' ? '50' : 'unlimited'}`;
      motionEl.textContent     = motionEl.getAttribute(key);
      motionPeriod.textContent = period;
    }

    // Pro
    const proEl     = document.querySelector('[data-pro-price]');
    const proPeriod = document.querySelector('[data-pro-period]');
    if (proEl) {
      const key = `data-${billing}-${tierState.pro === '50' ? '50' : 'unlimited'}`;
      proEl.textContent     = proEl.getAttribute(key);
      proPeriod.textContent = period;
    }
  }

  // Toggle global mensal / anual
  toggle.addEventListener('click', () => {
    isAnnual = !isAnnual;
    toggle.setAttribute('aria-checked', isAnnual ? 'true' : 'false');
    labelMonth.classList.toggle('pricing-toggle__label--active', !isAnnual);
    labelYear.classList.toggle('pricing-toggle__label--active',  isAnnual);
    updatePrices();
  });

  // Toggles internos por alunos
  document.querySelectorAll('.plan-tier-toggle').forEach(wrap => {
    const plan = wrap.getAttribute('data-plan');
    wrap.querySelectorAll('.plan-tier-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        wrap.querySelectorAll('.plan-tier-btn').forEach(b => b.classList.remove('plan-tier-btn--active'));
        btn.classList.add('plan-tier-btn--active');
        tierState[plan] = btn.getAttribute('data-tier');
        updatePrices();
      });
    });
  });
}

/* --- Carrossel app do aluno --- */
function carouselScroll(dir) {
  const el = document.getElementById('carousel-aluno');
  if (!el) return;
  el.scrollBy({ left: dir * 300, behavior: 'smooth' });
}

/* --- Scroll reveal para .reveal-img --- */
function initRevealImg() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal-img').forEach(el => observer.observe(el));
}

/* --- Slide-up word rotator seção dor --- */
function initPainTypewriter() {
  const el = document.getElementById('pain-typewriter');
  if (!el) return;
  const words = ['PDF no WhatsApp.', 'planilha do Google.', 'link de pagamento avulso.', 'app genérico sem marca.'];
  let wi = 0;

  el.textContent = words[0];

  /* força o browser a reconhecer a classe antes de animar */
  void el.offsetWidth;
  el.classList.add('word-enter');

  function next() {
    el.classList.remove('word-enter');
    void el.offsetWidth;
    el.classList.add('word-exit');

    setTimeout(() => {
      wi = (wi + 1) % words.length;
      el.textContent = words[wi];
      el.classList.remove('word-exit');
      void el.offsetWidth; /* reflow obrigatório para resetar a animação */
      el.classList.add('word-enter');
    }, 340);
  }

  setInterval(next, 2800);
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
  initPricingToggle();
  initRevealImg();
  initPainTypewriter();
});
