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

/* --- Smooth scroll para âncoras internas (respeita altura do header fixo) ---
   No mobile o header deixou de ser fixed (rola junto com a página — ver
   .header em style.css), então não tem mais nada sobrepondo o topo pra
   compensar ali. Em vez de um offset fixo de 80px (certo só quando o
   header é fixed, no desktop), mede a altura do header só quando ele
   está mesmo fixed. */
function initSmoothScroll() {
  const header = document.querySelector('.header');
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const offset = header && getComputedStyle(header).position === 'fixed' ? header.offsetHeight : 0;
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

  const fmtBRL = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Anual = 9x o mensal (25% off) — mesma regra usada em todo o checkout.
  function updatePlanPrice(plan) {
    const amountEl  = document.querySelector(`[data-${plan}-price]`);
    const periodEl  = document.querySelector(`[data-${plan}-period]`);
    const strikeEl  = document.querySelector(`[data-${plan}-strike]`);
    const savingsEl = document.querySelector(`[data-${plan}-savings]`);
    if (!amountEl) return;

    const tierKey = tierState[plan] === '50' ? '50' : 'unlimited';
    const monthly = parseFloat(amountEl.getAttribute(`data-monthly-${tierKey}`));

    if (!isAnnual) {
      amountEl.textContent = fmtBRL(monthly);
      periodEl.textContent = '/mês';
      strikeEl.style.display  = 'none';
      savingsEl.style.display = 'none';
      return;
    }

    const monthlyCents = Math.round(monthly * 100);
    const annualCents  = monthlyCents * 9;
    const equivCents   = Math.round(annualCents / 12);
    const annual  = annualCents / 100;
    const equiv   = equivCents / 100;
    const savings = (monthlyCents * 12 - annualCents) / 100;

    amountEl.textContent   = fmtBRL(equiv);
    periodEl.textContent   = '/mês';
    strikeEl.textContent   = fmtBRL(monthly);
    strikeEl.style.display = '';
    savingsEl.innerHTML    = `Cobrado ${fmtBRL(annual)} uma vez no ano · economize <b>${fmtBRL(savings)}</b>`;
    savingsEl.style.display = '';
  }

  function updatePrices() {
    updatePlanPrice('motion');
    updatePlanPrice('pro');

    // CTAs — leva o tier escolhido pro cadastro
    const motionCta = document.querySelector('a[href^="https://app.orbihealth.com.br/cadastro?plano=motion"]');
    if (motionCta) {
      const alunos = tierState.motion === '50' ? '50' : 'ilimitado';
      motionCta.setAttribute('href', `https://app.orbihealth.com.br/cadastro?plano=motion&alunos=${alunos}`);
    }
    const proCta = document.querySelector('a[href^="https://app.orbihealth.com.br/cadastro?plano=pro"]');
    if (proCta) {
      const alunos = tierState.pro === '50' ? '50' : 'ilimitado';
      proCta.setAttribute('href', `https://app.orbihealth.com.br/cadastro?plano=pro&alunos=${alunos}`);
    }

    // Features condicionadas ao tier (ex: colaboradores só no Ilimitado)
    document.querySelectorAll('[data-tier-feature]').forEach((li) => {
      const plan = li.getAttribute('data-tier-feature');
      const active = tierState[plan] !== '50';
      li.classList.toggle('pricing-feature--active', active);
    });
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

/* --- Carrossel app do aluno (baseado em índice + transform) --- */
let carouselIndex = 0;

function carouselScroll(dir) {
  const track = document.getElementById('carousel-aluno');
  if (!track) return;
  const total = track.querySelectorAll('.carousel__item').length;
  carouselIndex = (carouselIndex + dir + total) % total;
  applyCarousel();
}

function carouselGoTo(idx) {
  carouselIndex = idx;
  applyCarousel();
}

function applyCarousel() {
  const track = document.getElementById('carousel-aluno');
  const dotsContainer = document.getElementById('carousel-dots');
  if (!track) return;

  track.style.transform = `translateX(-${carouselIndex * 100}%)`;

  if (dotsContainer) {
    const dots = dotsContainer.querySelectorAll('.app-aluno__dot');
    dots.forEach((dot, idx) => {
      dot.classList.toggle('app-aluno__dot--active', idx === carouselIndex);
    });
  }
}

function initCarouselDots() {
  const dotsContainer = document.getElementById('carousel-dots');
  if (!dotsContainer) return;
  dotsContainer.querySelectorAll('.app-aluno__dot').forEach((dot, idx) => {
    dot.addEventListener('click', () => carouselGoTo(idx));
  });
}

/* --- Carrossel White-label (swipe, só mobile — desktop mantém os 3 lado
   a lado sem transform nenhum) --- */
let wlCarouselIndex = 0;

function applyWlCarousel() {
  const track = document.getElementById('wl-carousel-track');
  const dotsContainer = document.getElementById('wl-carousel-dots');
  if (!track) return;
  track.style.transform = `translateX(-${wlCarouselIndex * 100}%)`;
  if (dotsContainer) {
    dotsContainer.querySelectorAll('.app-aluno__dot').forEach((dot, idx) => {
      dot.classList.toggle('app-aluno__dot--active', idx === wlCarouselIndex);
    });
  }
}

function wlCarouselGoTo(idx) {
  wlCarouselIndex = idx;
  applyWlCarousel();
}

function initWlCarousel() {
  const track = document.getElementById('wl-carousel-track');
  const dotsContainer = document.getElementById('wl-carousel-dots');
  if (!track) return;

  dotsContainer?.querySelectorAll('.app-aluno__dot').forEach((dot, idx) => {
    dot.addEventListener('click', () => wlCarouselGoTo(idx));
  });

  const total = track.querySelectorAll('.wl-phone-wrap').length;
  let startX = 0;
  let deltaX = 0;
  let dragging = false;

  track.addEventListener('touchstart', (e) => {
    if (window.innerWidth > 768) return;
    startX = e.touches[0].clientX;
    deltaX = 0;
    dragging = true;
    track.style.transition = 'none';
  }, { passive: true });

  track.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    deltaX = e.touches[0].clientX - startX;
    const pct = (deltaX / track.clientWidth) * 100;
    track.style.transform = `translateX(calc(-${wlCarouselIndex * 100}% + ${pct}%))`;
  }, { passive: true });

  track.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    track.style.transition = '';
    const threshold = track.clientWidth * 0.15;
    if (deltaX < -threshold && wlCarouselIndex < total - 1) {
      wlCarouselIndex++;
    } else if (deltaX > threshold && wlCarouselIndex > 0) {
      wlCarouselIndex--;
    }
    applyWlCarousel();
  });
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
  const words = ['PDF no WhatsApp.', 'planilha do Excel.', 'link de pagamento avulso.'];
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
  initCarouselDots();
  initWlCarousel();
});
