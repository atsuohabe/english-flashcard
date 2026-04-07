/**
 * stats.js - 統計ダッシュボード
 * 習得状況、ヒートマップ、予測チャート、連続日数を描画する
 */

import { Store } from './store.js';
import { getCardStateCounts, getMasteredCount, getLearningCount, getForecast, STATE } from './srs.js';
import { animateCounter, escapeHTML } from './ui.js';
import { Vocab } from './vocab.js';

// ─── 統計取得 ──────────────────────────────────────────────────────────

export function getOverview() {
  const history = Store.getHistory();
  const totalReviewed = history.reduce((s, r) => s + (r.reviewed || 0), 0);
  const mastered = getMasteredCount();
  const learning = getLearningCount();
  const streak = Store.getStreak();
  const totalMinutes = history.reduce((s, r) => s + ((r.timeMs || 0) / 60000), 0);

  return {
    totalReviewed,
    mastered,
    learning,
    streak: streak.current,
    longestStreak: streak.longest,
    totalMinutes: Math.round(totalMinutes),
    totalWords: Vocab.getLoadedCount(),
  };
}

export function getRetentionRate() {
  const history = Store.getHistory();
  const last30 = history.slice(-30);
  const totalReviewed = last30.reduce((s, r) => s + (r.reviewed || 0), 0);
  const totalCorrect = last30.reduce((s, r) => s + (r.correct || 0), 0);
  return totalReviewed > 0 ? Math.round((totalCorrect / totalReviewed) * 100) : 0;
}

export function getStreakInfo() {
  return Store.getStreak();
}

export function getTotalStudyMinutes() {
  const history = Store.getHistory();
  return Math.round(history.reduce((s, r) => s + ((r.timeMs || 0) / 60000), 0));
}

export function getHeatmapData(days = 365) {
  const history = Store.getHistory();
  const data = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toDateString();
    const count = history.filter(r =>
      new Date(r.date).toDateString() === dateStr
    ).reduce((s, r) => s + (r.reviewed || 0), 0);

    let level = 0;
    if (count > 0) level = 1;
    if (count >= 10) level = 2;
    if (count >= 30) level = 3;
    if (count >= 50) level = 4;

    data.push({ date: d.toISOString(), count, level });
  }

  return data;
}

// ─── 統計画面描画 ──────────────────────────────────────────────────────

export function renderStats(container) {
  const overview = getOverview();
  const counts = getCardStateCounts();
  const forecast = getForecast(14);
  const heatmap = getHeatmapData(90);
  const retention = getRetentionRate();

  container.innerHTML = '';

  const page = document.createElement('div');
  page.className = 'page';

  // タイトル
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'とうけい';
  page.appendChild(title);

  // 概要グリッド
  const grid = document.createElement('div');
  grid.className = 'stats-grid';
  grid.innerHTML = `
    <div class="stat-tile">
      <div class="stat-tile__value" data-stat="reviewed">${overview.totalReviewed.toLocaleString()}</div>
      <div class="stat-tile__label">ふくしゅう かいすう</div>
    </div>
    <div class="stat-tile">
      <div class="stat-tile__value" data-stat="mastered">${overview.mastered}</div>
      <div class="stat-tile__label">しゅうとくずみ</div>
    </div>
    <div class="stat-tile">
      <div class="stat-tile__value" data-stat="streak">${overview.streak}</div>
      <div class="stat-tile__label">れんぞく にっすう</div>
    </div>
    <div class="stat-tile">
      <div class="stat-tile__value" data-stat="time">${overview.totalMinutes}</div>
      <div class="stat-tile__label">がくしゅう じかん(ふん)</div>
    </div>
  `;
  page.appendChild(grid);

  // カード状態ブレークダウン
  const breakdown = document.createElement('div');
  breakdown.className = 'surface-card surface-card--sm';
  breakdown.style.marginTop = 'var(--space-6)';

  const stateLabels = [
    { state: STATE.NEW, label: 'みがくしゅう', color: '#CBD5E1' },
    { state: STATE.LEARNING, label: 'がくしゅうちゅう', color: '#93C5FD' },
    { state: STATE.YOUNG, label: 'おぼえた（れんしゅうちゅう）', color: '#60A5FA' },
    { state: STATE.MATURE, label: 'しゅうとくずみ', color: '#2563EB' },
    { state: STATE.BURNED, label: 'かんぜん ていちゃく', color: '#1D4ED8' },
  ];

  let breakdownHTML = '<div class="donut-legend">';
  for (const { state, label, color } of stateLabels) {
    breakdownHTML += `
      <div class="donut-legend__item">
        <span class="donut-legend__color" style="background:${color}"></span>
        <span class="donut-legend__label">${label}</span>
        <span class="donut-legend__value">${counts[state] || 0}</span>
      </div>
    `;
  }
  breakdownHTML += '</div>';
  breakdown.innerHTML = breakdownHTML;
  page.appendChild(breakdown);

  // 予測チャート
  const forecastSection = document.createElement('div');
  forecastSection.className = 'surface-card surface-card--sm';
  forecastSection.style.marginTop = 'var(--space-6)';

  const maxForecast = Math.max(1, ...forecast.map(f => f.count));
  let forecastHTML = '<div class="section-header"><h3 class="section-title">こんご14にちの ふくしゅうよそく</h3></div>';
  forecastHTML += '<div class="forecast-chart__bars">';
  for (let i = 0; i < forecast.length; i++) {
    const pct = Math.round((forecast[i].count / maxForecast) * 100);
    const isToday = i === 0;
    forecastHTML += `<div class="forecast-chart__bar${isToday ? ' forecast-chart__bar--today' : ''}" style="height:${Math.max(2, pct)}%"><span class="forecast-chart__bar-tooltip">${forecast[i].count}枚</span></div>`;
  }
  forecastHTML += '</div>';
  forecastSection.innerHTML = forecastHTML;
  page.appendChild(forecastSection);

  // ヒートマップ
  const heatmapSection = document.createElement('div');
  heatmapSection.className = 'surface-card surface-card--sm';
  heatmapSection.style.marginTop = 'var(--space-6)';

  let heatmapHTML = '<div class="section-header"><h3 class="section-title">がくしゅうカレンダー（90にち）</h3></div>';
  heatmapHTML += '<div class="heatmap-grid">';
  // 先頭の空セルで曜日を揃える
  const firstDate = new Date(heatmap[0]?.date || new Date());
  const startDay = firstDate.getDay();
  for (let i = 0; i < startDay; i++) {
    heatmapHTML += '<div class="heatmap__day" style="opacity:0"></div>';
  }
  for (const day of heatmap) {
    heatmapHTML += `<div class="heatmap__day heatmap__day--level-${day.level}" title="${new Date(day.date).toLocaleDateString('ja-JP')}: ${day.count}回"></div>`;
  }
  heatmapHTML += '</div>';
  heatmapSection.innerHTML = heatmapHTML;
  page.appendChild(heatmapSection);

  container.appendChild(page);
}

export function updateProgressRing(svg, counts) {
  // プログレスリング更新用（ホーム画面から呼ばれる場合）
  if (!svg) return;
  const totalWords = Vocab.getLoadedCount() || 1;
  const mastered = getMasteredCount();
  const learning = getLearningCount();

  const circumference = 2 * Math.PI * 65;
  const masteredPct = mastered / totalWords;
  const learningPct = learning / totalWords;

  const masteredCircle = svg.querySelector('.progress-ring__track--mastered');
  const learningCircle = svg.querySelector('.progress-ring__track--learning');

  if (masteredCircle) {
    masteredCircle.style.strokeDashoffset = circumference * (1 - masteredPct);
  }
  if (learningCircle) {
    learningCircle.style.strokeDashoffset = circumference * (1 - masteredPct - learningPct);
  }
}
