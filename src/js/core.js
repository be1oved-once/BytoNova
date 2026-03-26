// ═══════════════════════════════════════════════════════════════
// BytoNova — core.js
// Theme · Nav · Toast · Modals · OneSignal · Newsletter permission
// ═══════════════════════════════════════════════════════════════

const BYTONOVA = {
  WORKER_URL:        'https://bytonova-worker.contact-globalratings.workers.dev',
  ONESIGNAL_APP_ID:  'ab2231a2-2402-4a0a-afb4-f8c1ba2e6f7b',
  SITE_URL:          '*',
  CACHE_TTL:         3 * 60 * 1000, // 3 min
};

window.BN = BYTONOVA;

// ── Simple in-memory cache ──────────────────────────────────────
const _cache = {};
function cacheGet(k) {
  const e = _cache[k];
  if (!e || Date.now() - e.t > BYTONOVA.CACHE_TTL) { delete _cache[k]; return null; }
  return e.d;
}
function cacheSet(k, d) { _cache[k] = { d, t: Date.now() }; }
window.cacheGet = cacheGet;
window.cacheSet = cacheSet;

// ── API fetch helper ────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const url = `${BYTONOVA.WORKER_URL}${path}`;
  const res  = await fetch(url, opts);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}
window.apiFetch = apiFetch;

// ── Theme ───────────────────────────────────────────────────────
const Theme = {
  init() {
    const saved = localStorage.getItem('bn-theme') || 'dark';
    this.apply(saved);
    document.getElementById('themeBtn')?.addEventListener('click', () => this.toggle());
  },
  toggle() { this.apply(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); },
  apply(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('bn-theme', t);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = t === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
  },
};

// ── Mobile menu ─────────────────────────────────────────────────
const Menu = {
  btn: null, nav: null,
  init() {
    this.btn = document.getElementById('menuBtn');
    this.nav = document.getElementById('mobileNav');
    if (!this.btn || !this.nav) return;
    this.btn.addEventListener('click', e => { e.stopPropagation(); this.isOpen() ? this.close() : this.open(); });
    document.addEventListener('click', e => { if (!this.btn.contains(e.target) && !this.nav.contains(e.target)) this.close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
  },
  isOpen() { return this.nav.classList.contains('open'); },
  open()  { this.nav.style.display = 'flex'; requestAnimationFrame(() => { this.nav.classList.add('open'); this.btn.classList.add('open'); }); },
  close() { this.nav.classList.remove('open'); this.btn.classList.remove('open'); setTimeout(() => { if (!this.isOpen()) this.nav.style.display = ''; }, 240); },
};

// ── Toast system ────────────────────────────────────────────────
const Toast = {
  container: null,
  icons: { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warn: 'fa-triangle-exclamation' },
  init() {
    if (!document.getElementById('toastContainer')) {
      this.container = document.createElement('div');
      this.container.id = 'toastContainer';
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    } else {
      this.container = document.getElementById('toastContainer');
    }
  },
  show(type, title, msg, duration = 4000) {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `
      <i class="fa-solid ${this.icons[type] || this.icons.info} toast-icon"></i>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
        <div class="toast-progress"></div>
      </div>
      <button class="toast-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
    `;
    t.querySelector('.toast-close').addEventListener('click', () => this.dismiss(t));
    this.container.appendChild(t);
    const timer = setTimeout(() => this.dismiss(t), duration);
    t._timer = timer;
    return t;
  },
  dismiss(t) {
    clearTimeout(t._timer);
    t.classList.add('leaving');
    setTimeout(() => t.remove(), 260);
  },
  success: function(title, msg) { this.show('success', title, msg); },
  error:   function(title, msg) { this.show('error',   title, msg); },
  info:    function(title, msg) { this.show('info',    title, msg); },
  warn:    function(title, msg) { this.show('warn',    title, msg); },
};
window.Toast = Toast;

// ── Modal helper ────────────────────────────────────────────────
function showModal({ icon, title, body, confirmText, cancelText, onConfirm, onCancel }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-icon">${icon || ''}</div>
      <h3>${title}</h3>
      <p>${body}</p>
      <div class="modal-btns">
        <button class="btn-ghost" id="modalCancel">${cancelText || 'Not now'}</button>
        <button class="btn-primary" id="modalConfirm">${confirmText || 'OK'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const close = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 280); };
  overlay.querySelector('#modalConfirm').addEventListener('click', () => { close(); onConfirm?.(); });
  overlay.querySelector('#modalCancel').addEventListener('click',  () => { close(); onCancel?.(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) { close(); onCancel?.(); } });
}
window.showModal = showModal;

// ── OneSignal Push Notifications ────────────────────────────────
const PushNotifications = {
  STORAGE_KEY:       'bn-push-state',      // 'granted' | 'denied' | null
  LAST_ASKED_KEY:    'bn-push-last-asked',
  RETRY_DAYS:        15,

  init() {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
    if (Notification.permission === 'granted') return; // already have permission
    if (Notification.permission === 'denied')  return; // browser blocked

    const lastAsked = localStorage.getItem(this.LAST_ASKED_KEY);
    if (lastAsked) {
      const daysSince = (Date.now() - parseInt(lastAsked)) / (1000 * 60 * 60 * 24);
      if (daysSince < this.RETRY_DAYS) return;
    }

    // Ask at a random time between 20-50 seconds after page load
    const delay = 20000 + Math.random() * 30000;
    setTimeout(() => this.ask(), delay);
  },

  ask() {
    localStorage.setItem(this.LAST_ASKED_KEY, Date.now().toString());
    showModal({
      icon:        '<i class="fa-solid fa-bell" style="color:var(--accent)"></i>',
      title:       'Stay in the loop',
      body:        'Get notified when BytoNova publishes a new tech story. No spam — only fresh articles, every few hours.',
      confirmText: '<i class="fa-solid fa-bell"></i> Allow Notifications',
      cancelText:  'Maybe later',
      onConfirm:   () => this.requestPermission(),
      onCancel:    () => { /* retry in 15 days — already set lastAsked */ },
    });
  },

  async requestPermission() {
    try {
      // Load OneSignal SDK
      if (!window.OneSignal) {
        await loadScript('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js');
      }
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async function(OneSignal) {
        await OneSignal.init({ appId: BYTONOVA.ONESIGNAL_APP_ID, notifyButton: { enable: false } });
        await OneSignal.Notifications.requestPermission();
        const granted = await OneSignal.Notifications.permission;
        if (granted) {
          localStorage.setItem('bn-push-state', 'granted');
          Toast.success('Notifications on!', 'You\'ll get the latest BytoNova stories.');
        }
      });
    } catch (e) {
      console.warn('[Push] Error:', e.message);
      Toast.error('Could not enable', 'Push notifications failed to activate.');
    }
  },
};

// ── Newsletter permission ────────────────────────────────────────
const Newsletter = {
  SHOWN_KEY: 'bn-nl-shown',

  init() {
    if (localStorage.getItem(this.SHOWN_KEY)) return;
    // Ask after 45 seconds, only on index page
    if (!document.getElementById('heroSection')) return;
    setTimeout(() => this.ask(), 45000);
  },

  ask() {
    localStorage.setItem(this.SHOWN_KEY, '1');
    showModal({
      icon:        '<i class="fa-solid fa-envelope-open" style="color:var(--accent)"></i>',
      title:       'BytoNova Newsletter',
      body:        'Get a weekly digest of the best tech stories straight to your inbox. No spam. Unsubscribe any time.',
      confirmText: '<i class="fa-solid fa-paper-plane"></i> Yes, subscribe me',
      cancelText:  'No thanks',
      onConfirm:   () => {
        // Scroll to newsletter bar and focus email
        const bar = document.getElementById('newsletterBar');
        if (bar) { bar.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => bar.querySelector('input')?.focus(), 600); }
      },
    });
  },

  async submit(email, name = '') {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Toast.error('Invalid email', 'Please enter a valid email address.'); return false;
    }
    try {
      const res = await apiFetch('/api/newsletter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      if (res.success) {
        Toast.success('Subscribed!', 'Welcome to BytoNova. Great choice.');
        return true;
      }
      throw new Error(res.error || 'Failed');
    } catch (e) {
      Toast.error('Could not subscribe', e.message);
      return false;
    }
  },
};
window.Newsletter = Newsletter;

// ── Page transitions (fast navigation) ──────────────────────────
const Router = {
  init() {
    document.addEventListener('click', e => {
      const link = e.target.closest('a[data-page]');
      if (!link) return;
      e.preventDefault();
      const href = link.getAttribute('href');
      if (href) { history.pushState(null, '', href); this.navigate(href); }
    });
    window.addEventListener('popstate', () => this.navigate(location.pathname));
  },
  navigate(path) {
    document.body.style.opacity = '0.7';
    document.body.style.transition = 'opacity 0.15s ease';
    setTimeout(() => {
      window.location.href = path;
    }, 100);
  },
};

// ── Utility ─────────────────────────────────────────────────────
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
window.loadScript = loadScript;

function formatRelTime(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60)   return 'Just now';
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
window.formatRelTime = formatRelTime;

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
window.formatDate = formatDate;

function getCatClass(cat) {
  const m = { AI:'cat-ai', Technology:'cat-technology', Gadgets:'cat-gadgets', Mobile:'cat-mobile', Gaming:'cat-gaming', Science:'cat-science' };
  return m[cat] || 'cat-technology';
}
window.getCatClass = getCatClass;

function getCatIcon(cat) {
  const m = { AI:'fa-robot', Technology:'fa-microchip', Gadgets:'fa-plug', Mobile:'fa-mobile-screen', Gaming:'fa-gamepad', Science:'fa-flask' };
  return m[cat] || 'fa-newspaper';
}
window.getCatIcon = getCatIcon;

function buildCard(a, large = false) {
  const cat   = getCatClass(a.category);
  const icon  = getCatIcon(a.category);
  const time  = formatRelTime(a.published_at || a.publishedAt || '');
  const tags  = Array.isArray(a.tags) ? a.tags : [];
  const img   = a.image_url || a.imageUrl || '';

  return `
    <a class="card" href="/articles/${a.slug}" data-cat="${a.category}" aria-label="${a.title}">
      <div class="card-img-wrap" style="position:relative">
        ${img
          ? `<img class="card-img" src="${img}" alt="${a.title}" loading="lazy"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
          : ''}
        <div class="card-img-placeholder" style="${img ? 'display:none' : ''}">
          <i class="fa-solid ${icon}"></i>
        </div>
      </div>
      <div class="card-body">
        <span class="card-cat ${cat}"><i class="fa-solid ${icon}"></i>${a.category}</span>
        <h3 class="card-title">${a.title}</h3>
        <p class="card-excerpt">${a.meta || ''}</p>
        <div class="card-footer">
          <span class="card-meta"><i class="fa-regular fa-clock"></i>${time}</span>
          <span class="card-meta"><i class="fa-solid fa-book-open"></i>${a.read_time || a.readTime || 4} min</span>
        </div>
      </div>
    </a>`;
}
window.buildCard = buildCard;

function setFooterYear() {
  document.querySelectorAll('.footer-year').forEach(el => { el.textContent = new Date().getFullYear(); });
}

// ── Init on DOM ready ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  Menu.init();
  Toast.init();
  PushNotifications.init();
  Newsletter.init();
  setFooterYear();
});
