/**
 * srs.js - SM-2 改アルゴリズム
 * 間隔反復スケジューリングの全ロジックを担当する
 */

import { Store } from './store.js';

// ─── 定数 ────────────────────────────────────────────────────────────

const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;
const MATURE_INTERVAL = 21;
const BURNED_INTERVAL = 90;
const MAX_INTERVAL = 180;

/** 評価値（0-3）の定義 */
export const RATING = { AGAIN: 0, HARD: 1, GOOD: 2, EASY: 3 };

/** カード状態 */
export const STATE = {
  NEW: 'new',
  LEARNING: 'learning',
  YOUNG: 'young',
  MATURE: 'mature',
  BURNED: 'burned',
  RELEARN: 'relearn',
};

// ─── 新規カードのデフォルト SRS データ ───────────────────────────────

export function newCardData(wordId) {
  return {
    wordId,
    interval: 0,
    repetitions: 0,
    easeFactor: DEFAULT_EASE,
    dueDate: new Date().toISOString(),
    lastReviewed: null,
    firstSeen: null,
    streak: 0,
    lapses: 0,
    state: STATE.NEW,
  };
}

// ─── SM-2 コア計算 ────────────────────────────────────────────────────

export function calculateNextReview(card, rating) {
  let { interval, repetitions, easeFactor, lapses, streak } = card;

  const now = new Date();

  if (rating === RATING.AGAIN) {
    repetitions = 0;
    interval = 1;
    lapses += 1;
    streak = 0;
    easeFactor = Math.max(MIN_EASE, easeFactor - 0.2);
    return {
      ...card,
      interval,
      repetitions,
      easeFactor,
      lapses,
      streak,
      state: STATE.RELEARN,
      dueDate: addDays(now, interval).toISOString(),
      lastReviewed: now.toISOString(),
      firstSeen: card.firstSeen || now.toISOString(),
    };
  }

  const easeAdjust = {
    [RATING.HARD]: -0.15,
    [RATING.GOOD]: 0,
    [RATING.EASY]: 0.15,
  }[rating];

  easeFactor = Math.max(MIN_EASE, easeFactor + easeAdjust);
  streak += 1;

  if (repetitions === 0) {
    interval = 1;
  } else if (repetitions === 1) {
    interval = 6;
  } else {
    const jitter = 0.9 + Math.random() * 0.2;
    interval = Math.max(1, Math.round(interval * easeFactor * jitter));
  }

  if (rating === RATING.EASY) {
    interval = Math.round(interval * 1.3);
  }

  if (rating === RATING.HARD) {
    interval = Math.max(1, Math.round(interval * 0.8));
  }

  interval = Math.min(MAX_INTERVAL, interval);

  repetitions += 1;

  const state = classifyState(interval);

  return {
    ...card,
    interval,
    repetitions,
    easeFactor,
    lapses,
    streak,
    state,
    dueDate: addDays(now, interval).toISOString(),
    lastReviewed: now.toISOString(),
    firstSeen: card.firstSeen || now.toISOString(),
  };
}

// ─── カード状態分類 ────────────────────────────────────────────────────

export function classifyState(interval) {
  if (interval === 0) return STATE.NEW;
  if (interval >= BURNED_INTERVAL) return STATE.BURNED;
  if (interval >= MATURE_INTERVAL) return STATE.MATURE;
  if (interval >= 7) return STATE.YOUNG;
  return STATE.LEARNING;
}

export function isMastered(card) {
  return (
    card.interval >= MATURE_INTERVAL &&
    card.repetitions >= 3 &&
    card.lapses <= 2
  );
}

export function getMasteryLevel(card) {
  if (!card || card.state === STATE.NEW) return 0;
  if (card.state === STATE.BURNED) return 4;
  if (card.state === STATE.MATURE) return 3;
  if (card.state === STATE.YOUNG) return 2;
  return 1;
}

// ─── デューキュー生成 ──────────────────────────────────────────────────

export function getDueCardIds(limit = 200) {
  const allCards = Store.getAllCards();
  const now = new Date();

  const due = Object.entries(allCards)
    .filter(([, card]) =>
      card.state !== STATE.NEW &&
      new Date(card.dueDate) <= now
    )
    .sort(([, a], [, b]) => new Date(a.dueDate) - new Date(b.dueDate))
    .map(([id]) => id);

  return due.slice(0, limit);
}

export function getNewCardIds(allWordIds, limit = 10) {
  const allCards = Store.getAllCards();
  const newIds = allWordIds.filter(id => !allCards[String(id)]);
  return newIds.slice(0, limit);
}

// ─── 統計向け集計 ──────────────────────────────────────────────────────

export function getCardStateCounts() {
  const allCards = Store.getAllCards();
  const counts = {
    [STATE.NEW]: 0,
    [STATE.LEARNING]: 0,
    [STATE.YOUNG]: 0,
    [STATE.MATURE]: 0,
    [STATE.BURNED]: 0,
    [STATE.RELEARN]: 0,
  };
  for (const card of Object.values(allCards)) {
    const s = card.state || STATE.LEARNING;
    if (counts[s] !== undefined) counts[s]++;
  }
  return counts;
}

export function getMasteredCount() {
  const allCards = Store.getAllCards();
  return Object.values(allCards).filter(isMastered).length;
}

export function getLearningCount() {
  const allCards = Store.getAllCards();
  return Object.values(allCards).filter(c =>
    !isMastered(c) && c.state !== STATE.NEW
  ).length;
}

export function getForecast(days = 14) {
  const allCards = Store.getAllCards();
  const forecast = [];

  for (let i = 0; i < days; i++) {
    const target = addDays(new Date(), i);
    const targetStr = target.toDateString();
    const count = Object.values(allCards).filter(card => {
      if (!card.dueDate) return false;
      return new Date(card.dueDate).toDateString() === targetStr;
    }).length;
    forecast.push({ date: target.toISOString(), count });
  }

  return forecast;
}

// ─── 覚えた/まだまだ方式 ─────────────────────────────────────────────

export function calculateNextReviewSimple(card, sessionAttempts) {
  const rating = sessionAttempts <= 1 ? RATING.GOOD
               : sessionAttempts === 2 ? RATING.GOOD
               : sessionAttempts === 3 ? RATING.HARD
               : RATING.AGAIN;
  return calculateNextReview(card, rating);
}

// ─── 次回インターバルのプレビュー ────────────────────────────────────

export function previewIntervals(card) {
  const cardData = card || { interval: 0, repetitions: 0, easeFactor: DEFAULT_EASE, lapses: 0, streak: 0, state: STATE.NEW };
  return {
    [RATING.AGAIN]: calculateNextReview(cardData, RATING.AGAIN).interval,
    [RATING.HARD]: calculateNextReview(cardData, RATING.HARD).interval,
    [RATING.GOOD]: calculateNextReview(cardData, RATING.GOOD).interval,
    [RATING.EASY]: calculateNextReview(cardData, RATING.EASY).interval,
  };
}

// ─── ユーティリティ ──────────────────────────────────────────────────

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function intervalToLabel(days) {
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}
