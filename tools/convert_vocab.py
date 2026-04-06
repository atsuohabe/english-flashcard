#!/usr/bin/env python3
"""
Excel (英単語マスタ) → vocab JSON 変換スクリプト
使い方:
  python3 tools/convert_vocab.py
      --xlsx english_words_master.xlsx   # Excelファイルのパス
      --sheet "Sheet1"                   # 対象シート名（省略時は全シート）
      --out  data/vocab.json             # 出力ファイル（省略時は自動分割）
"""
import argparse, json, re, sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl が必要です: pip install openpyxl")

# ────────────────────────────────────────────────
# シート名 → レベル判定
# ────────────────────────────────────────────────
LEVEL_MAP: list[tuple[str, int]] = [
    ("level1", 1), ("level 1", 1), ("レベル1", 1), ("基礎", 1), ("初級", 1), ("beginner", 1),
    ("level2", 2), ("level 2", 2), ("レベル2", 2), ("中級", 2), ("intermediate", 2),
    ("level3", 3), ("level 3", 3), ("レベル3", 3), ("上級", 3), ("advanced", 3),
    ("level4", 4), ("level 4", 4), ("レベル4", 4),
    ("level5", 5), ("level 5", 5), ("レベル5", 5),
]

def sheet_level(sheet_name: str) -> int:
    key = sheet_name.lower().strip()
    for pattern, level in LEVEL_MAP:
        if pattern.lower() in key:
            return level
    return 0  # 不明な場合は☆マークで判定

# ────────────────────────────────────────────────
# カテゴリマッピング
# ────────────────────────────────────────────────
CATEGORY_MAP: dict[str, str] = {
    "動物": "animals",
    "食べ物": "food", "食べ物・飲み物": "food", "飲み物": "food",
    "家族": "family", "家族・人": "family", "人": "family",
    "体": "body", "からだ": "body",
    "色": "colors", "色・形": "colors", "形": "colors",
    "数": "numbers", "数字": "numbers", "数・数え方": "numbers",
    "学校": "school", "教育": "school",
    "自然": "nature", "天気": "nature", "自然・天気": "nature",
    "服": "clothes", "持ち物": "clothes", "服・持ち物": "clothes",
    "動作": "actions", "動詞": "actions",
    "家": "daily", "生活": "daily", "家・生活": "daily", "日常": "daily",
    "あいさつ": "greetings", "表現": "greetings", "あいさつ・表現": "greetings",
}

def normalize_category(raw: str) -> str:
    text = raw.strip()
    # 完全一致
    if text in CATEGORY_MAP:
        return CATEGORY_MAP[text]
    # 部分一致
    for key, cat_id in CATEGORY_MAP.items():
        if key in text:
            return cat_id
    # 英語カテゴリ名がそのまま使われている場合
    lower = text.lower()
    valid_ids = {"animals", "food", "family", "body", "colors", "numbers",
                 "school", "nature", "clothes", "actions", "daily", "greetings"}
    if lower in valid_ids:
        return lower
    return "greetings"  # デフォルト

# ────────────────────────────────────────────────
# 品詞マッピング
# ────────────────────────────────────────────────
POS_MAP: dict[str, str] = {
    "名詞": "noun", "n": "noun", "noun": "noun",
    "動詞": "verb", "v": "verb", "verb": "verb",
    "形容詞": "adjective", "adj": "adjective", "adjective": "adjective",
    "副詞": "adverb", "adv": "adverb", "adverb": "adverb",
    "前置詞": "preposition", "prep": "preposition",
    "接続詞": "conjunction", "conj": "conjunction",
    "間投詞": "interjection", "intj": "interjection",
    "代名詞": "pronoun", "pron": "pronoun",
}

def normalize_pos(raw: str) -> str:
    return POS_MAP.get(raw.strip().lower(), "noun")

# ────────────────────────────────────────────────
# ☆マーク検出
# ────────────────────────────────────────────────
STAR_RE = re.compile(r'[☆★⭐✦✧◆◇]')

def detect_star(text: str) -> tuple[str, bool]:
    """テキストから☆マークを検出し、クリーンなテキストとフラグを返す"""
    has_star = bool(STAR_RE.search(text))
    cleaned = STAR_RE.sub('', text).strip()
    return cleaned, has_star

# ────────────────────────────────────────────────
# ヘッダー列検出
# ────────────────────────────────────────────────
def _header_tokens(cell_str: str) -> list[str]:
    tokens = []
    for part in cell_str.replace('\n', ' ').split():
        tokens.append(part.lower().strip())
    return tokens

def find_col(header: list[str], aliases: list[str]) -> int | None:
    for alias in aliases:
        al = alias.lower().strip()
        for i, h in enumerate(header):
            tokens = _header_tokens(h)
            if al in tokens or al == h.lower().strip():
                return i
    return None

# 列エイリアス定義
WORD_ALIASES     = ["英単語", "english", "word", "単語", "英語", "vocabulary"]
CATEGORY_ALIASES = ["分類", "category", "カテゴリ", "種類"]
MEANING_ALIASES  = ["意味", "meaning", "日本語", "japanese", "和訳", "meaning_ja"]
EXAMPLE_ALIASES  = ["例文", "example", "example sentence", "文例"]
POS_ALIASES      = ["品詞", "part of speech", "pos", "詞類"]
STAR_ALIASES     = ["☆", "★", "star", "初期", "レベル", "level", "優先"]

# ────────────────────────────────────────────────
# シート解析
# ────────────────────────────────────────────────

def parse_sheet(sheet, default_level: int, start_id: int) -> list[dict]:
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return []

    # ヘッダー行を探す
    header_idx = 0
    for idx, row in enumerate(rows[:5]):
        tokens_in_row = []
        for c in row:
            if c:
                tokens_in_row.extend(_header_tokens(str(c)))
        if any(a.lower() in tokens_in_row for a in ["英単語", "english", "word", "単語"]):
            header_idx = idx
            break

    header = [str(c).strip() if c else "" for c in rows[header_idx]]

    ci_word     = find_col(header, WORD_ALIASES)
    ci_category = find_col(header, CATEGORY_ALIASES)
    ci_meaning  = find_col(header, MEANING_ALIASES)
    ci_example  = find_col(header, EXAMPLE_ALIASES)
    ci_pos      = find_col(header, POS_ALIASES)
    ci_star     = find_col(header, STAR_ALIASES)

    print(f"     列検出: word={ci_word} category={ci_category} meaning={ci_meaning} "
          f"example={ci_example} pos={ci_pos} star={ci_star}")

    if ci_word is None:
        print(f"  ⚠️  英単語列が見つかりません（シート: {sheet.title}）。スキップします。")
        print(f"     ヘッダー: {header}")
        return []

    def cell(row, idx) -> str:
        if idx is None or idx >= len(row) or row[idx] is None:
            return ""
        return str(row[idx]).strip()

    words = []
    word_id = start_id
    for row in rows[header_idx + 1:]:
        if not row:
            continue
        raw_word = cell(row, ci_word)
        if not raw_word:
            continue

        # ☆マーク検出（英単語列から）
        word_text, has_star_in_word = detect_star(raw_word)

        # 専用☆列がある場合
        has_star_in_col = False
        if ci_star is not None:
            star_val = cell(row, ci_star)
            has_star_in_col = bool(STAR_RE.search(star_val)) or star_val in ('1', 'yes', 'YES', 'Yes', '○', '◯', 'TRUE', 'true')

        is_starter = has_star_in_word or has_star_in_col

        # レベル判定: ☆あり → level 1, なし → default_level or 2
        level = 1 if is_starter else (default_level if default_level > 0 else 2)

        category_raw = cell(row, ci_category)
        pos_raw = cell(row, ci_pos)

        words.append({
            "id":               word_id,
            "word":             word_text,
            "meaning_ja":       cell(row, ci_meaning),
            "part_of_speech":   normalize_pos(pos_raw) if pos_raw else "noun",
            "category":         normalize_category(category_raw) if category_raw else "greetings",
            "example_sentence": cell(row, ci_example),
            "frequency_rank":   word_id,
            "difficulty":       level,
            "level":            level,
            "is_starter":       is_starter,
        })
        word_id += 1

    return words

# ────────────────────────────────────────────────
# メイン
# ────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Excel → vocab JSON 変換")
    parser.add_argument("--xlsx",  default="english_words_master.xlsx", help="Excelファイルのパス")
    parser.add_argument("--sheet", default=None,                        help="対象シート名（省略時は全シート）")
    parser.add_argument("--out",   default=None,                        help="出力JSONパス（省略時は自動分割）")
    args = parser.parse_args()

    xlsx_path = Path(args.xlsx)
    if not xlsx_path.exists():
        sys.exit(f"❌  Excelファイルが見つかりません: {xlsx_path}")

    print(f"📂  {xlsx_path} を読み込み中...")
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    print(f"   シート一覧: {wb.sheetnames}")

    words: list[dict] = []
    word_id = 1

    for sheet in wb.worksheets:
        if args.sheet and sheet.title != args.sheet:
            continue
        default_level = sheet_level(sheet.title)
        print(f"   処理中: 「{sheet.title}」 (default_level={default_level})")
        sheet_words = parse_sheet(sheet, default_level, word_id)
        print(f"   → {len(sheet_words)} 語（☆初期: {sum(1 for w in sheet_words if w['is_starter'])} 語）")
        words.extend(sheet_words)
        word_id += len(sheet_words)

    wb.close()

    if not words:
        sys.exit("❌  単語が1件も取得できませんでした。")

    print(f"\n合計 {len(words)} 語を読み込みました")
    print(f"  ☆初期レベル: {sum(1 for w in words if w['level'] == 1)} 語")
    print(f"  通常レベル:   {sum(1 for w in words if w['level'] == 2)} 語")

    out_dir = Path("data")
    out_dir.mkdir(exist_ok=True)

    if args.out:
        out_path = Path(args.out)
        out_path.write_text(json.dumps(words, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"✅  {out_path}: {len(words)} 語")
    else:
        # レベル別に分割
        levels_found = sorted(set(w["level"] for w in words))
        for lvl in levels_found:
            chunk = [w for w in words if w["level"] == lvl]
            if chunk:
                path = out_dir / f"vocab-level{lvl}.json"
                path.write_text(json.dumps(chunk, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"✅  {path}: {len(chunk)} 語")


if __name__ == "__main__":
    main()
