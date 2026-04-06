/**
 * vocab.js - 単語データローダー・フィルター
 * レベル別 JSON の遅延読み込みと単語クエリを担当する
 */

import { Store } from './store.js';

// ─── データキャッシュ ────────────────────────────────────────────────

let wordsMap = {};     // id → word object
let loadedChunks = new Set();

// レベル別チャンクファイル
const CHUNK_FILES = {
  level1: './data/vocab-level1.json',
  level2: './data/vocab-level2.json',
};

// studyLevel → 必要チャンク名
const LEVEL_CHUNKS = {
  level1: ['level1'],
  level2: ['level2'],
  all:    ['level1', 'level2'],
};

// ─── 読み込み ────────────────────────────────────────────────────────

export const Vocab = {
  /**
   * studyLevel に必要なチャンクをロード
   */
  async loadForLevel(studyLevel) {
    const chunks = LEVEL_CHUNKS[studyLevel] || LEVEL_CHUNKS.all;
    await Promise.all(chunks.map(name => _loadChunk(name)));
  },

  /**
   * studyLevel='all' の段階的ロード
   */
  async loadAllProgressive() {
    // Phase 1: level1（初期レベル）
    await _loadChunk('level1');

    // Phase 2: level2（通常レベル）— バックグラウンド
    _loadChunk('level2')
      .then(() => {
        window.dispatchEvent(new CustomEvent('vocab-loaded'));
      });
  },

  /** 全単語を一括ロード */
  async loadAll() {
    await Promise.all(
      Object.keys(CHUNK_FILES).map(name => _loadChunk(name))
    );
  },

  /** 指定 studyLevel の全チャンクがロード済みか */
  isLevelReady(studyLevel) {
    const chunks = LEVEL_CHUNKS[studyLevel] || LEVEL_CHUNKS.all;
    return chunks.every(name => loadedChunks.has(name));
  },

  // ─── クエリ ────────────────────────────────────────────────────

  /** 全単語を frequency_rank 順に返す */
  getAllWords() {
    return Object.values(wordsMap).sort(
      (a, b) => (a.frequency_rank || a.id) - (b.frequency_rank || b.id)
    );
  },

  /** 全単語の ID 一覧を frequency_rank 順に返す */
  getAllWordIds() {
    return this.getAllWords().map(w => w.id);
  },

  /** ID で単語を取得 */
  getWord(id) {
    return wordsMap[id] || null;
  },

  /** レベルでフィルタ */
  getByLevel(level) {
    return Object.values(wordsMap)
      .filter(w => w.level === level)
      .sort((a, b) => (a.frequency_rank || a.id) - (b.frequency_rank || b.id));
  },

  /**
   * studyLevel 設定に基づいてフィルタした単語一覧を返す
   */
  getFilteredWords(studyLevel) {
    if (!studyLevel || studyLevel === 'all') return this.getAllWords();
    if (studyLevel === 'level1') return this.getByLevel(1);
    if (studyLevel === 'level2') return this.getByLevel(2);
    return this.getAllWords();
  },

  /** studyLevel 設定に基づいた単語 ID 一覧 */
  getFilteredWordIds(studyLevel) {
    return this.getFilteredWords(studyLevel).map(w => w.id);
  },

  /**
   * フルテキスト検索（英単語・日本語意味）
   */
  search(query) {
    if (!query) return [];
    const q = query.toLowerCase();
    return Object.values(wordsMap).filter(w =>
      w.word.toLowerCase().includes(q) ||
      (w.meaning_ja && w.meaning_ja.includes(q))
    );
  },

  /**
   * SRS データを付与した単語オブジェクトを返す
   */
  getWordWithSRS(wordId) {
    const word = this.getWord(wordId);
    if (!word) return null;
    const srs = Store.getCard(String(wordId));
    return { ...word, srs };
  },

  /** ロード済みの単語数を返す */
  getLoadedCount() {
    return Object.keys(wordsMap).length;
  },
};

// ─── プライベート ────────────────────────────────────────────────────

async function _loadChunk(name) {
  if (loadedChunks.has(name)) return;
  const url = CHUNK_FILES[name];
  if (!url) return;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    const data = await resp.json();
    const words = Array.isArray(data) ? data : data.words || [];
    for (const word of words) {
      wordsMap[word.id] = word;
    }
    loadedChunks.add(name);
  } catch (e) {
    console.error(`Failed to load vocab chunk "${name}":`, e);
  }
}
