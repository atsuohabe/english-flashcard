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
  const heatmap = getHeatmapData();
  const retention = getRetentionRate();

  container.innerHTML = '';

  const page = document.createElement('div');
  page.className = 'page';

  // タイトル
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = '統計';
  page.appendChild(title);

  // 概要グリッド
  const grid = document.createElement('div');
  grid.className = 'stats-grid';
  grid.innerHTML = `
    <div class="stat-tile">
      <div class="stat-tile__number" data-stat="reviewed">${overview.totalReviewed.toLocaleString()}</div>
      <div class="stat-tile__label">復習回数</div>
    </div>
    <div class="stat-tile">
      <div class="stat-tile__number" data-stat="mastered">${overview.mastered}</div>
      <div class="stat-tile__label">習得済み</div>
    </div>
    <div class="stat-tile">
      <div class="stat-tile__number" data-stat="streak">${overview.streak}</div>
      <div class="stat-tile__label">連続日数</div>
    </div>
    <div class="stat-tile">
      <div class="stat-tile__number" data-stat="time">${overview.totalMinutes}</div>
      <div class="stat-tile__label">学習時間(分)</div>
    </div>
  `;
  page.appendChild(grid);

  // プログレスリング
  const ringSection = document.createElement('div');
  ringSection.className = 'progress-ring-container';
  ringSection.style.marginTop = 'var(--space-6)';

  const totalWords = overview.totalWords || 1;
  const masteredPct = Math.round((overview.mastered / totalWords) * 100);
  const learningPct = Math.round((overview.learning / totalWords) * 100);

  const circumference = 2 * Math.PI * 65;
  const masteredOffset = circumference * (1 - masteredPct / 100);
  const learningOffset = circumference * (1 - (masteredPct + learningPct) / 100);

  ringSection.innerHTML = `
    <svg class="progress-ring" viewBox="0 0 160 160">
      <circle class="progress-ring__bg" cx="80" cy="80" r="65"/>
      <circle class="progress-ring__track--learning" cx="80" cy="80" r="65"
        stroke-dasharray="${circumference}" stroke-dashoffset="${learningOffset}"/>
      <circle class="progress-ring__track--mastered" cx="80" cy="80" r="65"
        stroke-dasharray="${circumference}" stroke-dashoffset="${masteredOffset}"/>
      <g class="progress-ring__text" transform="rotate(90 80 80)">
        <text class="progress-ring__number" x="80" y="75">${overview.mastered}</text>
        <text class="progress-ring__label" x="80" y="95">/ ${totalWords} 語</text>
      </g>
    </svg>
  `;
  page.appendChild(ringSection);

  // カード状態ブレークダウン
  const breakdown = document.createElement('div');
  breakdown.className = 'surface-card surface-card--sm';
  breakdown.style.marginTop = 'var(--space-6)';

  const stateLabels = [
    { state: STATE.NEW, label: '未学習', color: '#D8D8D8' },
    { state: STATE.LEARNING, label: '学習中', color: '#9E9E9E' },
    { state: STATE.YOUNG, label: '覚えた（練習中）', color: '#616161' },
    { state: STATE.MATURE, label: '習得済み', color: '#1A1A1A' },
    { state: STATE.BURNED, label: '完全定着', color: '#000000' },
  ];

  let breakdownHTML = '<div class="donut-legend">';
  for (const { state, label, color } of stateLabels) {
    breakdownHTML += `
      <div class="donut-legend__item">
        <span class="donut-legend__dot" style="background:${color}"></span>
        <span>${label}</span>
        <span class="donut-legend__count">${counts[state] || 0}</span>
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
  let forecastHTML = '<div class="section-header"><h3 class="section-title">今後14日の復習予測</h3></div>';
  forecastHTML += '<div class="forecast-chart">';
  for (let i = 0; i < forecast.length; i++) {
    const pct = Math.round((forecast[i].count / maxForecast) * 100);
    const isToday = i === 0;
    forecastHTML += `<div class="forecast-bar${isToday ? ' today' : ''}" style="height:${Math.max(2, pct)}%" title="${forecast[i].count}枚"></div>`;
  }
  forecastHTML += '</div>';
  forecastSection.innerHTML = forecastHTML;
  page.appendChild(forecastSection);

  // ヒートマップ
  const heatmapSection = document.createElement('div');
  heatmapSection.className = 'surface-card surface-card--sm';
  heatmapSection.style.marginTop = 'var(--space-6)';

  let heatmapHTML = '<div class="section-header"><h3 class="section-title">学習カレンダー</h3></div>';
  heatmapHTML += '<div class="heatmap">';
  // 先頭の空セルで曜日を揃える
  const firstDate = new Date(heatmap[0]?.date || new Date());
  const startDay = firstDate.getDay();
  for (let i = 0; i < startDay; i++) {
    heatmapHTML += '<div class="heatmap__cell heatmap__cell--empty"></div>';
  }
  for (const day of heatmap) {
    heatmapHTML += `<div class="heatmap__cell" data-level="${day.level}" title="${new Date(day.date).toLocaleDateString('ja-JP')}: ${day.count}回"></div>`;
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
