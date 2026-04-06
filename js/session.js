/**
 * session.js - 学習セッション管理
 * カードキューの管理、評価の処理、セッション統計を担当する
 */

import { Store } from './store.js';
import { Vocab } from './vocab.js';
import {
  calculateNextReviewSimple,
  getDueCardIds,
  getNewCardIds,
  newCardData,
} from './srs.js';

// ─── セッション状態 ───────────────────────────────────────────────────

let _queue = [];
let _currentIndex = 0;
let _history = [];
let _sessionStats = {
  reviewed: 0,
  correct: 0,
  newCards: 0,
  startTime: null,
};
let _pendingUpdates = {};
let _lastSessionWordIds = [];

// ─── セッション API ───────────────────────────────────────────────────

export const Session = {
  async start(options = {}) {
    const settings = Store.getSettings();
    const dailyNewLimit = options.dailyNewLimit ?? settings.dailyNewLimit ?? 10;

    const todayNewCount = _getTodayNewCount();
    const remainingNew = Math.max(0, dailyNewLimit - todayNewCount);

    const dailyReviewLimit = settings.dailyReviewLimit ?? 100;
    const todayReviewCount = _getTodayReviewCount();
    const remainingReviews = Math.max(0, dailyReviewLimit - todayReviewCount);

    let dueIds = getDueCardIds(remainingReviews);

    const studyLevel = options.studyLevel ?? settings.studyLevel ?? 'all';
    let allWordIds = Vocab.getFilteredWordIds(studyLevel);

    if (studyLevel !== 'all') {
      const filteredSet = new Set(allWordIds.map(String));
      dueIds = dueIds.filter(id => filteredSet.has(String(id)));
    }

    const cardOrder = settings.cardOrder || 'sequential';
    const newIds = _selectNewCards(allWordIds, remainingNew, cardOrder, studyLevel);

    _queue = _buildQueue(dueIds, newIds);
    _lastSessionWordIds = [...new Set(_queue.map(item => item.wordId))];
    _currentIndex = 0;
    _history = [];
    _pendingUpdates = {};
    _sessionStats = {
      reviewed: 0,
      correct: 0,
      newCards: 0,
      startTime: Date.now(),
    };

    return _queue.length > 0;
  },

  getCurrentCard() {
    if (_currentIndex >= _queue.length) return null;
    const item = _queue[_currentIndex];
    const word = Vocab.getWord(item.wordId);
    if (!word) return null;
    return { word, srsData: item.srsData, isNew: item.isNew };
  },

  getRemainingCount() {
    return Math.max(0, _queue.length - _currentIndex);
  },

  getTotalCount() {
    return _queue.length;
  },

  isComplete() {
    return _currentIndex >= _queue.length;
  },

  submitRating(rating) {
    if (this.isComplete()) return;

    const item = _queue[_currentIndex];

    if (rating === 'not-yet') {
      _queue.push({
        ...item,
        isNew: false,
        attemptCount: (item.attemptCount || 0) + 1,
      });
      _currentIndex++;
      _sessionStats.reviewed++;
      return;
    }

    const attempts = (item.attemptCount || 0) + 1;
    const updatedSRS = calculateNextReviewSimple(item.srsData, attempts);

    _history.push({ wordId: item.wordId, rating, srsData: updatedSRS });
    _pendingUpdates[String(item.wordId)] = updatedSRS;

    _sessionStats.reviewed++;
    _sessionStats.correct++;
    if (item.isNew) _sessionStats.newCards++;

    _currentIndex++;

    if (_sessionStats.reviewed % 5 === 0) {
      this._flushUpdates();
    }
  },

  undo() {
    if (_history.length === 0 || _currentIndex === 0) return false;

    _currentIndex--;
    const last = _history.pop();

    _queue[_currentIndex].srsData = Store.getCard(String(last.wordId)) || _queue[_currentIndex].srsData;
    _queue[_currentIndex].attemptCount = 0;
    delete _pendingUpdates[String(last.wordId)];

    _sessionStats.reviewed = Math.max(0, _sessionStats.reviewed - 1);

    return true;
  },

  getLastSessionWordIds() {
    return [..._lastSessionWordIds];
  },

  async startWithIds(wordIds) {
    const allCards = Store.getAllCards();
    _queue = wordIds.map(id => {
      const srsData = allCards[String(id)] || newCardData(Number(id));
      const isNew = !allCards[String(id)];
      return { wordId: Number(id), srsData, isNew };
    });
    _lastSessionWordIds = [...wordIds];
    _currentIndex = 0;
    _history = [];
    _pendingUpdates = {};
    _sessionStats = {
      reviewed: 0,
      correct: 0,
      newCards: 0,
      startTime: Date.now(),
    };
    return _queue.length > 0;
  },

  end() {
    this._flushUpdates();

    const durationMs = Date.now() - (_sessionStats.startTime || Date.now());
    Store.recordSession({
      date: new Date().toISOString(),
      reviewed: _sessionStats.reviewed,
      correct: _sessionStats.correct,
      newCards: _sessionStats.newCards,
      timeMs: durationMs,
    });

    return this.getSessionStats();
  },

  getSessionStats() {
    const durationMs = Date.now() - (_sessionStats.startTime || Date.now());
    const retention = _sessionStats.reviewed > 0
      ? Math.round((_sessionStats.correct / _sessionStats.reviewed) * 100)
      : 0;
    return {
      reviewed: _sessionStats.reviewed,
      correct: _sessionStats.correct,
      newCards: _sessionStats.newCards,
      retention,
      durationMs,
      durationMin: Math.round(durationMs / 60000),
    };
  },

  _flushUpdates() {
    if (Object.keys(_pendingUpdates).length === 0) return;
    Store.setCards(_pendingUpdates);
    _pendingUpdates = {};
  },
};

// ─── プライベートヘルパー ─────────────────────────────────────────────

function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function _buildQueue(dueIds, newIds) {
  const queue = [];
  const allCards = Store.getAllCards();

  const shuffledDueIds = _shuffle([...dueIds]);

  for (const id of shuffledDueIds) {
    const srsData = allCards[String(id)] || newCardData(Number(id));
    queue.push({ wordId: Number(id), srsData, isNew: false });
  }

  for (const id of newIds) {
    const srsData = newCardData(id);
    queue.push({ wordId: id, srsData, isNew: true });
  }

  if (newIds.length > 0 && shuffledDueIds.length > 0) {
    const newItems = queue.splice(shuffledDueIds.length);
    const step = Math.max(3, Math.floor(shuffledDueIds.length / newIds.length));
    for (let i = 0; i < newItems.length; i++) {
      const insertAt = Math.min(step * (i + 1), queue.length);
      queue.splice(insertAt + i, 0, newItems[i]);
    }
  }

  return queue;
}

function _selectNewCards(allWordIds, limit, cardOrder, studyLevel) {
  const allCards = Store.getAllCards();
  const unseenIds = allWordIds.filter(id => !allCards[String(id)]);

  if (cardOrder !== 'random') {
    return unseenIds.slice(0, limit);
  }

  if (studyLevel !== 'all') {
    return _shuffle([...unseenIds]).slice(0, limit);
  }

  // 全体 + ランダム: 最低のレベルから選ぶ
  for (let lvl = 1; lvl <= 5; lvl++) {
    const lvlUnseen = unseenIds.filter(id => {
      const word = Vocab.getWord(id);
      return word && word.level === lvl;
    });
    if (lvlUnseen.length > 0) {
      return _shuffle([...lvlUnseen]).slice(0, limit);
    }
  }
  return _shuffle([...unseenIds]).slice(0, limit);
}

function _getTodayNewCount() {
  const history = Store.getHistory();
  const today = new Date().toDateString();
  const todayRecords = history.filter(
    r => new Date(r.date).toDateString() === today
  );
  return todayRecords.reduce((sum, r) => sum + (r.newCards || 0), 0);
}

function _getTodayReviewCount() {
  const history = Store.getHistory();
  const today = new Date().toDateString();
  const todayRecords = history.filter(
    r => new Date(r.date).toDateString() === today
  );
  return todayRecords.reduce(
    (sum, r) => sum + Math.max(0, (r.reviewed || 0) - (r.newCards || 0)),
    0
  );
}
