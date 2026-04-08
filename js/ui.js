/**
 * ui.js - UI ユーティリティ
 * トースト通知、マイルストーン、モーダル、テーマ管理、SVGアイコン
 */

import { Store } from './store.js';

// ─── トースト通知 ──────────────────────────────────────────────────────

let _toastContainer = null;

function _ensureToastContainer() {
  if (_toastContainer && document.body.contains(_toastContainer)) return;
  _toastContainer = document.createElement('div');
  _toastContainer.className = 'toast-container';
  document.body.appendChild(_toastContainer);
}

export function showToast(message, { type = 'info', duration = 3000, icon = '' } = {}) {
  _ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const iconMap = { info: 'ℹ️', success: '✅', warning: '⚠️', milestone: '🏆' };
  const displayIcon = icon || iconMap[type] || 'ℹ️';

  toast.innerHTML = `
    <span class="toast__icon">${displayIcon}</span>
    <span class="toast__message">${escapeHTML(message)}</span>
  `;

  _toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── マイルストーン ────────────────────────────────────────────────────

const MILESTONES = [
  { count: 10,  badge: '🌱', label: 'Sprout',  message: 'First 10 words mastered!' },
  { count: 25,  badge: '🌿', label: 'Sapling', message: '25 words done! Keep it up!' },
  { count: 50,  badge: '🌳', label: 'Growing', message: '50 words mastered! Amazing!' },
  { count: 100, badge: '⭐', label: 'Star',    message: '100 words! Great job!' },
  { count: 200, badge: '🌟', label: 'Shining', message: '200 words! Your English is growing!' },
  { count: 300, badge: '💫', label: 'Meteor',  message: '300 words mastered! Wonderful!' },
  { count: 500, badge: '👑', label: 'Master',  message: '500 words! On the road to mastery!' },
];

let _shownMilestones = new Set();

export function initMilestones() {
  // Handled in app.js via markMilestonesSeen()
}

export function checkMilestone(masteredCount) {
  for (const ms of MILESTONES) {
    if (masteredCount >= ms.count && !_shownMilestones.has(ms.count)) {
      _shownMilestones.add(ms.count);
      showToast(`${ms.badge} ${ms.label}: ${ms.message}`, {
        type: 'milestone',
        duration: 5000,
        icon: ms.badge,
      });
      return ms;
    }
  }
  return null;
}

export function markMilestonesSeen(count) {
  for (const ms of MILESTONES) {
    if (count >= ms.count) {
      _shownMilestones.add(ms.count);
    }
  }
}

// ─── モーダル ──────────────────────────────────────────────────────────

export function showModal(title, contentHTML, { onClose } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h2 class="modal__title">${escapeHTML(title)}</h2>
        <button class="btn btn--ghost btn--icon" data-close>✕</button>
      </div>
      <div class="modal__body">${contentHTML}</div>
    </div>
  `;

  const close = () => {
    overlay.remove();
    onClose?.();
  };

  overlay.querySelector('[data-close]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.body.appendChild(overlay);
  return { close, overlay };
}

// ─── テーマ管理 ──────────────────────────────────────────────────────

export function applyTheme(theme) {
  if (!theme || theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export function initTheme() {
  const settings = Store.getSettings();
  applyTheme(settings.theme);
}

// ─── カウンターアニメーション ──────────────────────────────────────

export function animateCounter(element, from, to, duration = 600) {
  const start = performance.now();
  const diff = to - from;

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const value = Math.round(from + diff * eased);
    element.textContent = value.toLocaleString();
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

// ─── スケルトンローダー ──────────────────────────────────────────────

export function createSkeleton(width = '100%', height = '1rem') {
  const el = document.createElement('div');
  el.className = 'skeleton';
  el.style.width = width;
  el.style.height = height;
  return el;
}

// ─── HTML エスケープ ────────────────────────────────────────────────────

export function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── SVG アイコン ────────────────────────────────────────────────────

export const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  study: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  browse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
};
