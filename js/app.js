/**
 * app.js - 英単語フラッシュカード メインコントローラー
 * v1.0.0
 */

import { Store } from './store.js';
import { Vocab } from './vocab.js';
import { Session } from './session.js';
import { Flashcard, speakWord } from './flashcard.js';
import {
  getMasteredCount, getLearningCount, getDueCardIds, getNewCardIds,
  getCardStateCounts, getMasteryLevel, STATE,
} from './srs.js';
import { renderStats, updateProgressRing, getOverview } from './stats.js';
import {
  showToast, showModal, applyTheme, initTheme, checkMilestone,
  markMilestonesSeen, animateCounter, escapeHTML, ICONS,
} from './ui.js';
import { attachKeyboard } from './gestures.js';

// ─── 定数 ────────────────────────────────────────────────────────────

const VERSION = '1.0.0';

const LEVEL_OPTIONS = [
  { value: 'all',    label: 'All levels' },
  { value: 'level1', label: '☆ Starter' },
  { value: 'level2', label: 'Standard' },
];

// ─── 状態 ────────────────────────────────────────────────────────────

let _currentView = 'home';
let _flashcard = null;
let _keyboardDetach = null;

// ─── 初期化 ────────────────────────────────────────────────────────

async function init() {
  initTheme();

  // ナビゲーション
  _setupNavigation();

  // データロード
  const settings = Store.getSettings();
  const studyLevel = settings.studyLevel || 'all';

  if (studyLevel === 'all') {
    await Vocab.loadAllProgressive();
  } else {
    await Vocab.loadForLevel(studyLevel);
  }

  // バックグラウンドロード完了時にUI更新
  window.addEventListener('vocab-loaded', () => {
    if (_currentView === 'home') _renderHome();
    if (_currentView === 'browse') _renderBrowse();
  });

  // 既達成マイルストーンを記録
  markMilestonesSeen(getMasteredCount());

  // 初期画面
  _navigateTo(window.location.hash.slice(1) || 'home');

  // ウィンドウ閉じ時にセッション保存
  window.addEventListener('beforeunload', () => {
    Session._flushUpdates();
  });

  // Electron バージョン表示
  if (window.__electronAPI?.getVersion) {
    const ver = window.__electronAPI.getVersion();
    const el = document.querySelector('[data-app-version]');
    if (el) el.textContent = `v${ver}`;
  }

  // 自動アップデートトースト
  window.__showUpdateToast = (version) => {
    showToast(`Version v${version} downloaded. Restart to update.`, {
      type: 'info',
      duration: 8000,
    });
  };
}

// ─── ナビゲーション ──────────────────────────────────────────────────

function _setupNavigation() {
  // ナビアイテムにイベント設定
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const view = el.dataset.nav;
      _navigateTo(view);
    });
  });

  // SVG アイコン注入
  document.querySelectorAll('[data-nav]').forEach(el => {
    const iconSpan = el.querySelector('.nav-bottom__icon, .nav-sidebar__icon');
    if (iconSpan && ICONS[el.dataset.nav]) {
      iconSpan.innerHTML = ICONS[el.dataset.nav];
    }
  });

  // ハッシュ変更
  window.addEventListener('hashchange', () => {
    const view = window.location.hash.slice(1) || 'home';
    _navigateTo(view, false);
  });
}

function _navigateTo(view, updateHash = true) {
  // 学習中にナビゲートする場合はセッション終了
  if (_currentView === 'study' && view !== 'study') {
    _endStudySession();
  }

  _currentView = view;

  // ビュー切替
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const viewEl = document.getElementById(`view-${view}`);
  if (viewEl) viewEl.classList.add('active');

  // ナビアクティブ状態
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === view);
  });

  if (updateHash) {
    window.location.hash = view;
  }

  // ビュー描画
  switch (view) {
    case 'home':    _renderHome(); break;
    case 'study':   _startStudy(); break;
    case 'browse':  _renderBrowse(); break;
    case 'stats':   _renderStatsView(); break;
    case 'settings': _renderSettings(); break;
  }
}

// ─── ホーム画面 ──────────────────────────────────────────────────────

function _renderHome() {
  const container = document.getElementById('view-home');
  if (!container) return;

  const overview = getOverview();
  const settings = Store.getSettings();
  const studyLevel = settings.studyLevel || 'all';
  const totalWords = Vocab.getFilteredWords(studyLevel).length || Vocab.getLoadedCount();
  const dueCount = getDueCardIds().length;
  const newCount = getNewCardIds(Vocab.getFilteredWordIds(studyLevel), settings.dailyNewLimit || 10).length;

  const levelLabel = LEVEL_OPTIONS.find(o => o.value === studyLevel)?.label || '全レベル';

  const circumference = 2 * Math.PI * 65;
  const masteredPct = totalWords > 0 ? overview.mastered / totalWords : 0;
  const learningPct = totalWords > 0 ? overview.learning / totalWords : 0;
  const masteredOffset = circumference * (1 - masteredPct);
  const learningOffset = circumference * (1 - masteredPct - learningPct);

  container.innerHTML = `
    <div class="page page--study">
      <div class="dashboard-hero">
        <span class="level-badge" data-nav="settings">${escapeHTML(levelLabel)}</span>
        <h1 class="dashboard-hero__title">English Flashcards</h1>
        <p class="dashboard-hero__subtitle">Practice every day to master English words</p>

        <div class="dashboard-hero__ring">
          <svg class="progress-ring" viewBox="0 0 160 160">
            <circle class="progress-ring__bg" cx="80" cy="80" r="65"/>
            <circle class="progress-ring__track--learning" cx="80" cy="80" r="65"
              stroke-dasharray="${circumference}" stroke-dashoffset="${learningOffset}"/>
            <circle class="progress-ring__track--mastered" cx="80" cy="80" r="65"
              stroke-dasharray="${circumference}" stroke-dashoffset="${masteredOffset}"/>
            <g class="progress-ring__text">
              <text class="progress-ring__number" x="80" y="75">${overview.mastered}</text>
              <text class="progress-ring__label" x="80" y="95">/ ${totalWords}</text>
            </g>
          </svg>
        </div>

        <div class="queue-row">
          <div class="queue-pill">
            <span class="queue-pill__number">${dueCount}</span>
            <span class="queue-pill__label">Review</span>
          </div>
          <div class="queue-pill">
            <span class="queue-pill__number">${newCount}</span>
            <span class="queue-pill__label">New</span>
          </div>
          <div class="queue-pill queue-pill--mastered">
            <span class="queue-pill__number">${overview.mastered}</span>
            <span class="queue-pill__label">Mastered</span>
          </div>
        </div>

        <button class="btn btn--primary btn--lg btn--full" data-action="start-study">
          Start Study
        </button>
      </div>
    </div>
  `;

  container.querySelector('[data-action="start-study"]')?.addEventListener('click', () => {
    _navigateTo('study');
  });

  // レベルバッジクリックで設定へ
  container.querySelector('.level-badge')?.addEventListener('click', () => {
    _navigateTo('settings');
  });
}

// ─── 学習セッション ──────────────────────────────────────────────────

async function _startStudy() {
  const container = document.getElementById('view-study');
  if (!container) return;

  const settings = Store.getSettings();
  const studyLevel = settings.studyLevel || 'all';

  // 必要なレベルのデータがロード済みか確認
  if (!Vocab.isLevelReady(studyLevel)) {
    await Vocab.loadForLevel(studyLevel);
  }

  const hasCards = await Session.start({ studyLevel });

  if (!hasCards) {
    container.innerHTML = `
      <div class="page page--study">
        <div class="empty-state">
          <div class="empty-state__icon">🎉</div>
          <h2 class="empty-state__title">All done for today!</h2>
          <p class="text-muted">Come back tomorrow</p>
          <button class="btn btn--primary" style="margin-top:var(--space-6)" data-action="go-home">Back to Home</button>
        </div>
      </div>
    `;
    container.querySelector('[data-action="go-home"]')?.addEventListener('click', () => {
      _navigateTo('home');
    });
    return;
  }

  // フラッシュカード初期化
  _flashcard = new Flashcard(container, {
    onRated: (rating) => _onCardRated(rating),
    onUndo: () => _onUndo(),
  });

  // キーボードショートカット
  _keyboardDetach?.detach?.();
  _keyboardDetach = attachKeyboard({
    onFlip: () => _flashcard?.flip(),
    onRemembered: () => {
      if (_flashcard?._isFlipped) _flashcard._handleRating('remembered');
    },
    onNotYet: () => {
      if (_flashcard?._isFlipped) _flashcard._handleRating('not-yet');
    },
    onUndo: () => _onUndo(),
  });

  _showNextCard();
}

function _showNextCard() {
  const card = Session.getCurrentCard();
  if (!card) {
    _showSessionComplete();
    return;
  }

  const total = Session.getTotalCount();
  const current = total - Session.getRemainingCount() + 1;

  _flashcard.render(card.word, { total, current, isNew: card.isNew });
  _flashcard.updateProgress(current - 1, total);
}

function _onCardRated(rating) {
  Session.submitRating(rating);

  // マイルストーンチェック
  if (rating === 'remembered') {
    checkMilestone(getMasteredCount());
  }

  setTimeout(() => _showNextCard(), 50);
}

function _onUndo() {
  if (Session.undo()) {
    _showNextCard();
    showToast('Undone', { type: 'info', duration: 1500 });
  }
}

function _showSessionComplete() {
  const stats = Session.end();
  const container = document.getElementById('view-study');

  container.innerHTML = `
    <div class="page page--study">
      <div class="session-complete">
        <div class="session-complete__emoji">🎊</div>
        <h2 class="session-complete__title">Session complete!</h2>
        <div class="session-complete__stats">
          <div class="session-complete__stat">
            <div class="session-complete__stat-number">${stats.reviewed}</div>
            <div class="session-complete__stat-label">Reviewed</div>
          </div>
          <div class="session-complete__stat">
            <div class="session-complete__stat-number">${stats.retention}%</div>
            <div class="session-complete__stat-label">Accuracy</div>
          </div>
          <div class="session-complete__stat">
            <div class="session-complete__stat-number">${stats.newCards}</div>
            <div class="session-complete__stat-label">New</div>
          </div>
        </div>
        <button class="btn btn--primary btn--full" data-action="go-home" style="margin-top:var(--space-6)">Back to Home</button>
        <button class="btn btn--secondary btn--full" data-action="study-again" style="margin-top:var(--space-3)">Study again</button>
      </div>
    </div>
  `;

  container.querySelector('[data-action="go-home"]')?.addEventListener('click', () => {
    _navigateTo('home');
  });
  container.querySelector('[data-action="study-again"]')?.addEventListener('click', () => {
    _startStudy();
  });

  _keyboardDetach?.detach?.();
}

function _endStudySession() {
  if (_flashcard) {
    Session._flushUpdates();
    _flashcard.destroy();
    _flashcard = null;
  }
  _keyboardDetach?.detach?.();
  _keyboardDetach = null;
}

// ─── 単語一覧（ブラウズ） ──────────────────────────────────────────

function _renderBrowse() {
  const container = document.getElementById('view-browse');
  if (!container) return;

  const settings = Store.getSettings();
  const studyLevel = settings.studyLevel || 'all';
  let words = Vocab.getFilteredWords(studyLevel);

  container.innerHTML = `
    <div class="page">
      <h1 class="page-title">Word List</h1>
      <div class="browse-search-wrap">
        <input class="browse-search" type="search" placeholder="Search words..." data-search>
      </div>
      <div class="category-pills-scroll" data-filters></div>
      <div class="text-sm text-muted" style="margin:var(--space-2) 0" data-count>${words.length} words</div>
      <div class="card-grid" data-word-list></div>
      <div class="text-center" style="margin-top:var(--space-4)" data-load-more-wrap></div>
    </div>
  `;

  const searchInput = container.querySelector('[data-search]');
  const wordList = container.querySelector('[data-word-list]');
  const countEl = container.querySelector('[data-count]');
  const filterContainer = container.querySelector('[data-filters]');
  const loadMoreWrap = container.querySelector('[data-load-more-wrap]');

  let selectedFilter = '';
  let displayLimit = 200;

  // SRS状態フィルタピル
  _renderSRSFilterPills(filterContainer, (filter) => {
    selectedFilter = filter;
    displayLimit = 200;
    filterAndRender();
  });

  function filterAndRender() {
    const query = searchInput.value.trim();
    let filtered = query ? Vocab.search(query) : Vocab.getFilteredWords(studyLevel);

    if (selectedFilter) {
      filtered = filtered.filter(w => {
        const srs = Store.getCard(String(w.id));
        if (selectedFilter === 'new') return !srs;
        if (selectedFilter === 'learning') return srs && [STATE.LEARNING, STATE.YOUNG, STATE.RELEARN].includes(srs.state);
        if (selectedFilter === 'mastered') return srs && [STATE.MATURE, STATE.BURNED].includes(srs.state);
        return true;
      });
    }

    countEl.textContent = `${filtered.length} words`;
    _renderWordCards(wordList, filtered.slice(0, displayLimit));

    // 「もっと見る」ボタン
    if (filtered.length > displayLimit) {
      loadMoreWrap.innerHTML = `<button class="btn btn--secondary btn--sm" data-action="load-more">Load more (${filtered.length - displayLimit} remaining)</button>`;
      loadMoreWrap.querySelector('[data-action="load-more"]').addEventListener('click', () => {
        displayLimit += 200;
        filterAndRender();
      });
    } else {
      loadMoreWrap.innerHTML = '';
    }
  }

  searchInput.addEventListener('input', () => {
    displayLimit = 200;
    filterAndRender();
  });
  filterAndRender();
}

function _renderSRSFilterPills(container, onSelect) {
  const filters = [
    { value: '', label: 'All' },
    { value: 'new', label: 'New' },
    { value: 'learning', label: 'Learning' },
    { value: 'mastered', label: 'Mastered' },
  ];

  let html = '';
  for (const f of filters) {
    html += `<button class="category-pill${f.value === '' ? ' active' : ''}" data-filter="${f.value}">${escapeHTML(f.label)}</button>`;
  }
  container.innerHTML = html;

  container.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-filter]');
    if (!pill) return;
    container.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    onSelect(pill.dataset.filter || '');
  });
}

function _renderWordCards(container, words) {
  const settings = Store.getSettings();
  let html = '';
  for (const w of words) {
    const srs = Store.getCard(String(w.id));
    const stateClass = srs ? `word-card__state--${srs.state || 'new'}` : 'word-card__state--new';
    const meaning = (settings.showFurigana && w.meaning_kana) ? w.meaning_kana : (w.meaning_ja || '');

    html += `
      <div class="word-card" data-word-id="${w.id}">
        <div class="word-card__header">
          <div class="word-card__word">${escapeHTML(w.word)}</div>
          <button class="word-card__speak-btn" data-speak="${escapeHTML(w.word)}">🔊</button>
        </div>
        <div class="word-card__meaning">${escapeHTML(meaning).replace(/\n/g, '<br>')}</div>
        <span class="word-card__state ${stateClass}"></span>
      </div>
    `;
  }
  container.innerHTML = html;

  // 音声ボタン
  container.addEventListener('click', (e) => {
    const speakBtn = e.target.closest('[data-speak]');
    if (speakBtn) {
      e.stopPropagation();
      speakWord(speakBtn.dataset.speak);
      return;
    }
  });
}

// ─── 統計 ──────────────────────────────────────────────────────────

function _renderStatsView() {
  const container = document.getElementById('view-stats');
  if (!container) return;
  renderStats(container);
}

// ─── 設定 ──────────────────────────────────────────────────────────

function _renderSettings() {
  const container = document.getElementById('view-settings');
  if (!container) return;

  const settings = Store.getSettings();

  container.innerHTML = `
    <div class="page">
      <h1 class="page-title">Settings</h1>

      <div class="surface-card">
        <div class="settings-row">
          <div>
            <div class="settings-row__label">Study Level</div>
            <div class="settings-row__desc">Word range to study</div>
          </div>
          <select class="select" data-setting="studyLevel">
            ${LEVEL_OPTIONS.map(o =>
              `<option value="${o.value}" ${settings.studyLevel === o.value ? 'selected' : ''}>${escapeHTML(o.label)}</option>`
            ).join('')}
          </select>
        </div>

        <div class="settings-row">
          <div>
            <div class="settings-row__label">Daily New Cards</div>
            <div class="settings-row__desc">Max new words per day</div>
          </div>
          <select class="select" data-setting="dailyNewLimit">
            ${[5, 10, 15, 20, 30].map(n =>
              `<option value="${n}" ${settings.dailyNewLimit === n ? 'selected' : ''}>${n} cards</option>`
            ).join('')}
          </select>
        </div>

        <div class="settings-row">
          <div>
            <div class="settings-row__label">Daily Review Limit</div>
            <div class="settings-row__desc">Max reviews per day</div>
          </div>
          <select class="select" data-setting="dailyReviewLimit">
            ${[10, 20, 50, 100, 150, 200].map(n =>
              `<option value="${n}" ${settings.dailyReviewLimit === n ? 'selected' : ''}>${n} cards</option>`
            ).join('')}
          </select>
        </div>

        <div class="settings-row">
          <div>
            <div class="settings-row__label">Card Order</div>
          </div>
          <select class="select" data-setting="cardOrder">
            <option value="sequential" ${settings.cardOrder === 'sequential' ? 'selected' : ''}>Sequential</option>
            <option value="random" ${settings.cardOrder === 'random' ? 'selected' : ''}>Random</option>
          </select>
        </div>

        <div class="divider"></div>

        <div class="settings-row">
          <div>
            <div class="settings-row__label">Theme</div>
          </div>
          <select class="select" data-setting="theme">
            <option value="auto" ${settings.theme === 'auto' ? 'selected' : ''}>Auto</option>
            <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Light</option>
            <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
          </select>
        </div>

        <div class="settings-row">
          <div>
            <div class="settings-row__label">Auto Speech</div>
            <div class="settings-row__desc">Auto-play pronunciation when card is shown</div>
          </div>
          <label class="toggle">
            <input class="toggle__input" type="checkbox" data-setting="autoplayAudio" ${settings.autoplayAudio ? 'checked' : ''}>
            <span class="toggle__slider"></span>
          </label>
        </div>

        <div class="settings-row">
          <div>
            <div class="settings-row__label">Speech Rate</div>
          </div>
          <select class="select" data-setting="ttsRate">
            ${[0.7, 0.8, 0.9, 1.0, 1.1, 1.2].map(r =>
              `<option value="${r}" ${settings.ttsRate === r ? 'selected' : ''}>${r}x</option>`
            ).join('')}
          </select>
        </div>

        <div class="settings-row">
          <div>
            <div class="settings-row__label">Kana Mode</div>
            <div class="settings-row__desc">Show meanings in hiragana/katakana (when available)</div>
          </div>
          <label class="toggle">
            <input class="toggle__input" type="checkbox" data-setting="showFurigana" ${settings.showFurigana ? 'checked' : ''}>
            <span class="toggle__slider"></span>
          </label>
        </div>

        <div class="divider"></div>

        <div class="settings-row">
          <div>
            <div class="settings-row__label">Share App</div>
            <div class="settings-row__desc">Tell friends about this app</div>
          </div>
          <button class="btn btn--secondary btn--sm" data-action="share">
            ${ICONS.share} Share
          </button>
        </div>

        <div class="settings-row">
          <div>
            <div class="settings-row__label">Update App</div>
            <div class="settings-row__desc">Check for updates</div>
          </div>
          <button class="btn btn--secondary btn--sm" data-action="update-app">Update</button>
        </div>

        <div class="divider"></div>

        <div class="settings-row">
          <div>
            <div class="settings-row__label">Export Data</div>
            <div class="settings-row__desc">Save progress as JSON</div>
          </div>
          <button class="btn btn--secondary btn--sm" data-action="export">
            ${ICONS.download} Export
          </button>
        </div>

        <div class="settings-row">
          <div>
            <div class="settings-row__label">Import Data</div>
            <div class="settings-row__desc">Restore saved progress</div>
          </div>
          <button class="btn btn--secondary btn--sm" data-action="import">
            ${ICONS.upload} Import
          </button>
        </div>

        <div class="settings-row">
          <div>
            <div class="settings-row__label">Reset Data</div>
            <div class="settings-row__desc">Delete all study data</div>
          </div>
          <button class="btn btn--secondary btn--sm" style="color:#F44336" data-action="reset">Reset</button>
        </div>
      </div>

      <div class="text-center text-xs text-muted" style="margin-top:var(--space-6)">
        English Flashcards v${VERSION}
        <span data-app-version></span>
      </div>
    </div>
  `;

  // 設定変更イベント
  container.querySelectorAll('[data-setting]').forEach(el => {
    const key = el.dataset.setting;
    const event = el.type === 'checkbox' ? 'change' : 'change';

    el.addEventListener(event, () => {
      let value;
      if (el.type === 'checkbox') {
        value = el.checked;
      } else if (['dailyNewLimit', 'dailyReviewLimit'].includes(key)) {
        value = parseInt(el.value, 10);
      } else if (key === 'ttsRate') {
        value = parseFloat(el.value);
      } else {
        value = el.value;
      }

      Store.setSetting(key, value);

      if (key === 'theme') {
        applyTheme(value);
      }

      if (key === 'showFurigana') {
        showToast(value ? 'Kana mode ON' : 'Kana mode OFF', { type: 'info', duration: 1500 });
      }

      if (key === 'studyLevel') {
        Vocab.loadForLevel(value).then(() => {
          showToast('Study level changed', { type: 'success', duration: 2000 });
        });
      }
    });
  });

  // 共有
  container.querySelector('[data-action="share"]')?.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'English Flashcards',
          text: 'Learn English words the fun way!',
          url: window.location.href,
        });
      } catch (e) {
        if (e.name !== 'AbortError') {
          showToast('Share failed', { type: 'warning' });
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        showToast('URL copied', { type: 'success' });
      } catch {
        showToast('Copy failed', { type: 'warning' });
      }
    }
  });

  // アプリ更新
  container.querySelector('[data-action="update-app"]')?.addEventListener('click', async () => {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
      }
      showToast('Updating... page will reload', { type: 'info' });
      setTimeout(() => window.location.reload(), 1000);
    } catch (e) {
      console.error('Update failed:', e);
      window.location.reload();
    }
  });

  // エクスポート
  container.querySelector('[data-action="export"]')?.addEventListener('click', () => {
    const data = Store.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `efc-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported', { type: 'success' });
  });

  // インポート
  container.querySelector('[data-action="import"]')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (Store.importData(reader.result)) {
          showToast('Imported. Page will reload.', { type: 'success' });
          setTimeout(() => window.location.reload(), 1500);
        } else {
          showToast('Import failed', { type: 'warning' });
        }
      };
      reader.readAsText(file);
    });
    input.click();
  });

  // リセット
  container.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
    showModal('Reset Data', `
      <p style="margin-bottom:var(--space-4)">All study data will be deleted. This cannot be undone.</p>
      <div style="display:flex;gap:var(--space-3)">
        <button class="btn btn--secondary btn--full" data-modal-cancel>Cancel</button>
        <button class="btn btn--primary btn--full" style="background:#F44336;border-color:#F44336" data-modal-confirm>Reset</button>
      </div>
    `, {
      onClose: () => {},
    });

    document.querySelector('[data-modal-confirm]')?.addEventListener('click', () => {
      Store.resetAll();
      showToast('Data has been reset', { type: 'success' });
      setTimeout(() => window.location.reload(), 1000);
    });

    document.querySelector('[data-modal-cancel]')?.addEventListener('click', () => {
      document.querySelector('.modal-overlay')?.remove();
    });
  });
}

// ─── Service Worker 登録 ──────────────────────────────────────────

if ('serviceWorker' in navigator && !window.__electronAPI) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}

// ─── 起動 ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    const container = document.getElementById('view-home');
    if (container) {
      container.style.display = 'block';
      container.innerHTML = `<div style="padding:2rem;color:#fff;font-family:sans-serif">
        <h2>⚠️ Startup Error</h2>
        <pre style="white-space:pre-wrap;font-size:12px;margin-top:1rem">${err?.stack || err}</pre>
      </div>`;
    }
    console.error('init() failed:', err);
  });
});
