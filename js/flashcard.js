/**
 * flashcard.js - カード描画・インタラクション
 * 英単語カードの表示、フリップ、評価ボタン、音声読み上げを担当する
 */

import { Store } from './store.js';
import { attachGestures } from './gestures.js';
import { rubyText } from './ui.js';

// ─── 音声読み上げ ──────────────────────────────────────────────────────

let _voicesReady = false;
let _voice = null;

function _findEnglishVoice() {
  const voices = speechSynthesis.getVoices();
  _voice = voices.find(v => v.lang === 'en-US') ||
           voices.find(v => v.lang === 'en-GB') ||
           voices.find(v => v.lang.startsWith('en')) ||
           null;
  _voicesReady = voices.length > 0;
}

speechSynthesis.addEventListener?.('voiceschanged', _findEnglishVoice);
_findEnglishVoice();

if (!_voicesReady) {
  let retries = 0;
  const poll = setInterval(() => {
    _findEnglishVoice();
    retries++;
    if (_voicesReady || retries > 20) clearInterval(poll);
  }, 250);
}

export function speakWord(text) {
  if (!text) return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  if (_voice) utter.voice = _voice;
  const settings = Store.getSettings();
  utter.rate = settings.ttsRate ?? 1.0;
  speechSynthesis.speak(utter);
}

// ─── HTML エスケープ ────────────────────────────────────────────────────

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── 品詞の日本語表示 ──────────────────────────────────────────────────

const POS_LABELS = {
  noun: '名詞', verb: '動詞', adjective: '形容詞', adverb: '副詞',
  preposition: '前置詞', conjunction: '接続詞', interjection: '間投詞', pronoun: '代名詞',
};

function posLabel(pos) {
  return POS_LABELS[pos] || pos || '';
}

// ─── Flashcard クラス ──────────────────────────────────────────────────

export class Flashcard {
  constructor(container, { onRated, onUndo }) {
    this._container = container;
    this._onRated = onRated;
    this._onUndo = onUndo;
    this._isFlipped = false;
    this._currentWord = null;
    this._gestureDetach = null;

    this._build();
  }

  _build() {
    this._container.innerHTML = '';

    // 全体レイアウトラッパー（評価ボタンをカードの3Dコンテキスト外に分離）
    const layout = document.createElement('div');
    layout.className = 'study-layout';
    this._container.appendChild(layout);

    // プログレスバー
    this._progressBar = document.createElement('div');
    this._progressBar.className = 'study-progress-bar';
    this._progressBar.innerHTML = '<div class="study-progress-bar__fill" style="width:0%"></div>';
    layout.appendChild(this._progressBar);

    // カードシーン
    const scene = document.createElement('div');
    scene.className = 'card-scene';

    this._card = document.createElement('div');
    this._card.className = 'card';

    // 表面（英単語）
    const front = document.createElement('div');
    front.className = 'card__face card__face--front';
    front.innerHTML = `
      <div class="card__front">
        <div class="card__front-meta">
          <span class="card__badge" data-pos></span>
          <span class="card__number" data-number></span>
        </div>
        <div class="card__word-main" data-word></div>
        <div class="card__hint">タップしてめくる ▶</div>
      </div>
    `;

    // 裏面（日本語意味）
    const back = document.createElement('div');
    back.className = 'card__face card__face--back';
    back.innerHTML = `
      <div class="card__back">
        <div class="card__word-small" data-word-back></div>
        <button class="speak-btn" data-speak aria-label="発音">🔊</button>
        <div class="card__meaning" data-meaning></div>
        <div class="card__example" data-example style="display:none">
          <div class="card__example-hanzi" data-example-en></div>
          <div class="card__example-meaning" data-example-ja></div>
        </div>
      </div>
    `;

    this._card.appendChild(front);
    this._card.appendChild(back);
    scene.appendChild(this._card);
    layout.appendChild(scene);

    // スワイプインジケーター（カード内）
    const rightInd = document.createElement('div');
    rightInd.className = 'swipe-indicator swipe-indicator--right';
    rightInd.textContent = '覚えた ✓';
    this._card.appendChild(rightInd);
    this._rightIndicator = rightInd;

    const leftInd = document.createElement('div');
    leftInd.className = 'swipe-indicator swipe-indicator--left';
    leftInd.textContent = 'まだまだ ✗';
    this._card.appendChild(leftInd);
    this._leftIndicator = leftInd;

    // 評価ボタン（layoutに直接追加 — カードの3D空間外）
    this._ratingContainer = document.createElement('div');
    this._ratingContainer.className = 'rating-container';
    this._ratingContainer.innerHTML = `
      <button class="rating-btn rating-btn--not-yet" data-rating="not-yet">まだまだ</button>
      <button class="rating-btn rating-btn--remembered" data-rating="remembered"><ruby>覚<rt>おぼ</rt></ruby>えた！</button>
    `;
    layout.appendChild(this._ratingContainer);

    this._setupEvents();
  }

  _setupEvents() {
    this._ratingContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-rating]');
      if (!btn) return;
      this._handleRating(btn.dataset.rating);
    });

    this._card.querySelector('[data-speak]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._currentWord) speakWord(this._currentWord.word);
    });

    this._gestureDetach = attachGestures(this._card, {
      onTap: () => this.flip(),
      onFlip: () => this.flip(),
      onRemembered: () => {
        if (this._isFlipped) this._handleRating('remembered');
      },
      onNotYet: () => {
        if (this._isFlipped) this._handleRating('not-yet');
      },
      onDrag: (dx, dy) => this._onDrag(dx, dy),
    });
  }

  render(wordData, { total, current, isNew } = {}) {
    this._currentWord = wordData;
    this._isFlipped = false;
    this._card.classList.remove('is-flipped', 'dismiss-right', 'dismiss-left');
    this._ratingContainer.classList.remove('visible');

    // 表面: 英単語
    const wordEl = this._card.querySelector('[data-word]');
    wordEl.textContent = wordData.word;

    const len = wordData.word.length;
    wordEl.style.whiteSpace = 'nowrap';
    if (len > 20) {
      wordEl.style.fontSize = 'clamp(18px, 5vw, 28px)';
    } else if (len > 15) {
      wordEl.style.fontSize = 'clamp(22px, 6vw, 34px)';
    } else if (len > 12) {
      wordEl.style.fontSize = 'clamp(28px, 7vw, 44px)';
    } else if (len > 8) {
      wordEl.style.fontSize = 'clamp(36px, 9vw, 56px)';
    } else {
      wordEl.style.fontSize = '';
    }

    // 品詞バッジ
    const posEl = this._card.querySelector('[data-pos]');
    if (wordData.part_of_speech) {
      posEl.textContent = posLabel(wordData.part_of_speech);
      posEl.style.display = '';
    } else {
      posEl.style.display = 'none';
    }

    // カード番号
    if (total && current !== undefined) {
      this._card.querySelector('[data-number]').textContent = `${current}/${total}`;
    }

    // 裏面
    this._card.querySelector('[data-word-back]').textContent = wordData.word;
    const settings = Store.getSettings();
    const meaningRaw = wordData.meaning_ja || '';
    let meaningHTML = escapeHTML(meaningRaw).replace(/\n/g, '<br>');
    // ふりがなモード: 意味テキストにもrubyを適用
    if (settings.showFurigana) {
      meaningHTML = rubyText(meaningRaw.replace(/\n/g, '<br>'));
    }
    this._card.querySelector('[data-meaning]').innerHTML = meaningHTML;

    const exEl = this._card.querySelector('[data-example]');
    if (wordData.example_sentence) {
      exEl.style.display = '';
      this._card.querySelector('[data-example-en]').textContent = wordData.example_sentence;
      const jaEl = this._card.querySelector('[data-example-ja]');
      const jaText = wordData.example_sentence_ja || '';
      jaEl.textContent = jaText;
      jaEl.style.display = jaText ? '' : 'none';
    } else {
      exEl.style.display = 'none';
    }

    // アニメーション
    this._card.style.animation = 'slideInRight 0.3s ease';
    setTimeout(() => { this._card.style.animation = ''; }, 300);

    // 自動音声
    if (settings.autoplayAudio) {
      setTimeout(() => speakWord(wordData.word), 200);
    }
  }

  flip() {
    if (this._isFlipped) return;
    this._isFlipped = true;
    this._card.classList.add('is-flipped');
    this._ratingContainer.classList.add('visible');

    const settings = Store.getSettings();
    if (settings.autoplayAudio && this._currentWord) {
      setTimeout(() => speakWord(this._currentWord.word), 300);
    }
  }

  _handleRating(rating) {
    if (!this._isFlipped) return;

    const animClass = rating === 'remembered' ? 'dismiss-right' : 'dismiss-left';
    this._card.classList.add(animClass);
    this._ratingContainer.classList.remove('visible');

    setTimeout(() => {
      this._onRated?.(rating);
    }, 280);
  }

  _onDrag(dx, dy) {
    if (!this._isFlipped) return;

    const threshold = 30;
    if (dx > threshold) {
      this._card.classList.add('swipe-right');
      this._card.classList.remove('swipe-left');
      this._rightIndicator.classList.add('visible');
      this._leftIndicator.classList.remove('visible');
    } else if (dx < -threshold) {
      this._card.classList.add('swipe-left');
      this._card.classList.remove('swipe-right');
      this._leftIndicator.classList.add('visible');
      this._rightIndicator.classList.remove('visible');
    } else {
      this._card.classList.remove('swipe-left', 'swipe-right');
      this._rightIndicator.classList.remove('visible');
      this._leftIndicator.classList.remove('visible');
    }

    if (dx === 0 && dy === 0) {
      this._card.classList.remove('swipe-left', 'swipe-right', 'is-dragging');
      this._rightIndicator.classList.remove('visible');
      this._leftIndicator.classList.remove('visible');
    } else {
      this._card.classList.add('is-dragging');
    }
  }

  updateProgress(current, total) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    const fill = this._progressBar.querySelector('.study-progress-bar__fill');
    if (fill) fill.style.width = `${pct}%`;
  }

  destroy() {
    this._gestureDetach?.detach?.();
    this._container.innerHTML = '';
  }
}
