/**
 * store.js - LocalStorage 永続化レイヤー
 * カード進捗、設定、学習履歴、連続学習日数を管理する
 */

// ─── ストレージキー ────────────────────────────────────────────────────

const KEY_CARDS    = 'efc-cards';
const KEY_SETTINGS = 'efc-settings';
const KEY_HISTORY  = 'efc-history';
const KEY_STREAK   = 'efc-streak';
const KEY_VERSION  = 'efc-schema';

const CURRENT_SCHEMA = 1;

// ─── デフォルト設定 ────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  dailyNewLimit: 10,
  dailyReviewLimit: 100,
  theme: 'auto',
  autoplayAudio: false,
  ttsRate: 1.0,
  studyLevel: 'all',
  cardOrder: 'sequential',
};

// ─── 公開 API ────────────────────────────────────────────────────────

export const Store = {
  // ─── カード（SRS データ）──────────────────────────────────────────

  getCard(wordId) {
    const all = _get(KEY_CARDS) || {};
    return all[String(wordId)] || null;
  },

  setCard(wordId, data) {
    const all = _get(KEY_CARDS) || {};
    all[String(wordId)] = { ...data, _updated: Date.now() };
    _set(KEY_CARDS, all);
  },

  getAllCards() {
    return _get(KEY_CARDS) || {};
  },

  setCards(updates) {
    const all = _get(KEY_CARDS) || {};
    const now = Date.now();
    for (const [id, data] of Object.entries(updates)) {
      all[String(id)] = { ...data, _updated: now };
    }
    _set(KEY_CARDS, all);
  },

  // ─── 設定 ────────────────────────────────────────────────────────

  getSettings() {
    const saved = _get(KEY_SETTINGS) || {};
    return { ...DEFAULT_SETTINGS, ...saved };
  },

  setSetting(key, value) {
    const saved = _get(KEY_SETTINGS) || {};
    saved[key] = value;
    _set(KEY_SETTINGS, saved);
  },

  // ─── 学習履歴 ────────────────────────────────────────────────────

  getHistory() {
    return _get(KEY_HISTORY) || [];
  },

  recordSession(record) {
    const history = this.getHistory();
    history.push(record);
    // 最大365日分
    if (history.length > 365) {
      history.splice(0, history.length - 365);
    }
    _set(KEY_HISTORY, history);
    this._updateStreak();
  },

  // ─── 連続学習日数 ────────────────────────────────────────────────

  getStreak() {
    return _get(KEY_STREAK) || { current: 0, longest: 0, lastDate: null };
  },

  _updateStreak() {
    const history = this.getHistory();
    const streak = this.getStreak();
    const today = new Date().toDateString();

    const studyDates = [...new Set(
      history.map(r => new Date(r.date).toDateString())
    )].sort((a, b) => new Date(b) - new Date(a));

    if (studyDates.length === 0) {
      _set(KEY_STREAK, { current: 0, longest: 0, lastDate: null });
      return;
    }

    let current = 1;
    for (let i = 0; i < studyDates.length - 1; i++) {
      const d1 = new Date(studyDates[i]);
      const d2 = new Date(studyDates[i + 1]);
      const diff = (d1 - d2) / (1000 * 60 * 60 * 24);
      if (Math.round(diff) === 1) {
        current++;
      } else {
        break;
      }
    }

    // 今日学習していない場合、昨日までのストリークを確認
    if (studyDates[0] !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (studyDates[0] !== yesterday.toDateString()) {
        current = 0;
      }
    }

    const longest = Math.max(streak.longest, current);
    _set(KEY_STREAK, { current, longest, lastDate: studyDates[0] });
  },

  // ─── エクスポート / インポート ────────────────────────────────────

  exportData() {
    return JSON.stringify({
      version: CURRENT_SCHEMA,
      cards: _get(KEY_CARDS) || {},
      settings: _get(KEY_SETTINGS) || {},
      history: _get(KEY_HISTORY) || [],
      streak: _get(KEY_STREAK) || {},
      exportedAt: new Date().toISOString(),
    });
  },

  importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.cards)    _set(KEY_CARDS, data.cards);
      if (data.settings) _set(KEY_SETTINGS, data.settings);
      if (data.history)  _set(KEY_HISTORY, data.history);
      if (data.streak)   _set(KEY_STREAK, data.streak);
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  },

  // ─── リセット ────────────────────────────────────────────────────

  resetAll() {
    localStorage.removeItem(KEY_CARDS);
    localStorage.removeItem(KEY_SETTINGS);
    localStorage.removeItem(KEY_HISTORY);
    localStorage.removeItem(KEY_STREAK);
    localStorage.removeItem(KEY_VERSION);
  },
};

// ─── プライベートヘルパー ─────────────────────────────────────────────

function _get(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error(`Store._get(${key}) failed:`, e);
    return null;
  }
}

function _set(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Store._set(${key}) failed:`, e);
    if (e.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded');
    }
  }
}
