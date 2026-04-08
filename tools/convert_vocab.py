#!/usr/bin/env python3
"""
Excel (英単語マスタ) → vocab JSON 変換スクリプト
対応形式: .xls (xlrd) / .xlsx (openpyxl)

使い方:
  python3 tools/convert_vocab.py --xlsx R3ver2_Habatanforstudents.xls

列構成（兵庫版）:
  番号 | 単語 | ☆ | 品詞 | 意味 | 用例 | ○ | (番号)
"""
import argparse, json, re, sys
from pathlib import Path

# ────────────────────────────────────────────────
# 品詞マッピング（日本語 → 英語）
# ────────────────────────────────────────────────
POS_MAP: dict[str, str] = {
    "名": "noun",
    "動": "verb",
    "形": "adjective",
    "副": "adverb",
    "前": "preposition",
    "接": "conjunction",
    "代": "pronoun",
    "冠": "determiner",
    "間": "interjection",
    "助": "auxiliary",
    "数": "number",
}

def normalize_pos(raw: str) -> str:
    """日本語品詞表記を英語に変換（複合品詞は最初のもの）"""
    clean = raw.strip().replace('\n', '').replace('　', '').replace(' ', '')
    # 複合品詞（例: "名・形"）→ 最初のものを使用
    first = re.split(r'[・/·]', clean)[0].strip()
    return POS_MAP.get(first, "noun")

# ────────────────────────────────────────────────
# テキストクリーニング
# ────────────────────────────────────────────────
def clean_text(text: str) -> str:
    """改行、全角スペース、余分な空白を除去"""
    text = str(text).strip()
    text = text.replace('\n', ' ').replace('　', ' ')
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def clean_word(text: str) -> str:
    """英単語のクリーニング（括弧内の注記も保持）"""
    text = clean_text(text)
    return text

def clean_meaning(text: str) -> str:
    """意味のクリーニング（全行保持、※注記も保持）"""
    text = str(text).strip()
    text = text.replace('　', ' ')
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    return '\n'.join(lines)

# ────────────────────────────────────────────────
# .xls 読み込み (xlrd)
# ────────────────────────────────────────────────
def read_xls(path: Path) -> list[dict]:
    try:
        import xlrd
    except ImportError:
        sys.exit("xlrd が必要です: pip install xlrd")

    wb = xlrd.open_workbook(str(path))
    words = []
    word_id = 1

    for sheet_idx in range(wb.nsheets):
        sh = wb.sheet_by_index(sheet_idx)
        print(f"   シート: 「{sh.name}」 ({sh.nrows}行)")

        # ヘッダー行を探す（番号/単語 が含まれる行）
        header_row = 0
        for r in range(min(5, sh.nrows)):
            row_vals = [str(sh.cell_value(r, c)).strip() for c in range(sh.ncols)]
            # セル値が単語/word と完全一致するものを探す（タイトル行の「英単語集」等を除外）
            if any(v in ('単語', '単\u3000語', 'word', 'Word', 'english', 'English') for v in row_vals):
                header_row = r
                break

        header = [str(sh.cell_value(header_row, c)).replace('　', '').strip()
                  for c in range(sh.ncols)]
        print(f"   ヘッダー: {header}")

        # 列インデックス検出
        def find_col(aliases):
            for alias in aliases:
                for i, h in enumerate(header):
                    if alias in h.lower() or h == alias:
                        return i
            return None

        ci_word    = find_col(['単語', 'word', 'english', '単\u3000語'])
        ci_star    = find_col(['☆', '★', 'star'])
        ci_pos     = find_col(['品詞', 'pos', 'part'])
        ci_meaning = find_col(['意味', 'meaning', '意\u3000味'])
        ci_example = find_col(['用例', 'example', '用\u3000例'])

        # ヘッダー検出失敗時のフォールバック（固定列）
        # 兵庫版: 番号(0) 単語(1) ☆(2) 品詞(3) 意味(4) 用例(5) ○(6) 番号(7)
        if ci_word is None:
            ci_word = 1
        if ci_star is None:
            ci_star = 2
        if ci_pos is None:
            ci_pos = 3
        if ci_meaning is None:
            ci_meaning = 4
        if ci_example is None:
            ci_example = 5

        print(f"   列検出: word={ci_word} star={ci_star} pos={ci_pos} "
              f"meaning={ci_meaning} example={ci_example}")

        star_count = 0
        skipped = 0

        for r in range(header_row + 1, sh.nrows):
            raw_word = str(sh.cell_value(r, ci_word)).strip()
            if not raw_word or raw_word in ('', 'None'):
                skipped += 1
                continue

            # ☆マーク（専用列）
            star_val = str(sh.cell_value(r, ci_star)).strip()
            is_starter = bool(star_val and star_val not in ('', 'None', '0'))

            word_text = clean_word(raw_word)
            if not word_text:
                skipped += 1
                continue

            meaning_raw = str(sh.cell_value(r, ci_meaning)).strip()
            meaning_ja = clean_meaning(meaning_raw) if meaning_raw else ''

            pos_raw = str(sh.cell_value(r, ci_pos)).strip()
            pos = normalize_pos(pos_raw) if pos_raw and pos_raw != 'None' else 'noun'

            example_raw = str(sh.cell_value(r, ci_example)).strip()
            example = clean_text(example_raw) if example_raw and example_raw != 'None' else ''

            level = 1 if is_starter else 2
            if is_starter:
                star_count += 1

            words.append({
                "id":               word_id,
                "word":             word_text,
                "meaning_ja":       meaning_ja,
                "meaning_kana":     "",
                "part_of_speech":   pos,
                "category":         "general",
                "example_sentence": example,
                "frequency_rank":   word_id,
                "difficulty":       level,
                "level":            level,
                "is_starter":       is_starter,
            })
            word_id += 1

        print(f"   → {word_id - 1} 語（☆: {star_count} 語、スキップ: {skipped} 行）")

    return words

# ────────────────────────────────────────────────
# .xlsx 読み込み (openpyxl)
# ────────────────────────────────────────────────
def read_xlsx(path: Path) -> list[dict]:
    try:
        import openpyxl
    except ImportError:
        sys.exit("openpyxl が必要です: pip install openpyxl")

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    words = []
    word_id = 1

    for sheet in wb.worksheets:
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            continue
        print(f"   シート: 「{sheet.title}」 ({len(rows)}行)")

        # ヘッダー行を探す
        header_idx = 0
        for idx, row in enumerate(rows[:5]):
            tokens = [str(c).strip() for c in row if c]
            # セル値が単語/word と完全一致するものを探す
            if any(t in ('単語', '単\u3000語', 'word', 'Word', 'english', 'English') for t in tokens):
                header_idx = idx
                break

        header = [str(c).strip() if c else '' for c in rows[header_idx]]

        ci_word = ci_star = ci_pos = ci_meaning = ci_example = None
        for i, h in enumerate(header):
            hl = h.lower().replace('　', '').replace(' ', '')
            if '単語' in hl or hl in ('word', 'english'):
                ci_word = i
            elif '☆' in h or '★' in h:
                ci_star = i
            elif '品詞' in hl or 'pos' in hl:
                ci_pos = i
            elif '意味' in hl or 'meaning' in hl:
                ci_meaning = i
            elif '用例' in hl or 'example' in hl:
                ci_example = i

        if ci_word is None:
            ci_word = 1
        if ci_star is None:
            ci_star = 2
        if ci_pos is None:
            ci_pos = 3
        if ci_meaning is None:
            ci_meaning = 4
        if ci_example is None:
            ci_example = 5

        star_count = 0
        for row in rows[header_idx + 1:]:
            def cell(idx):
                if idx is None or idx >= len(row) or row[idx] is None:
                    return ''
                return str(row[idx]).strip()

            raw_word = cell(ci_word)
            if not raw_word:
                continue

            star_val = cell(ci_star)
            is_starter = bool(star_val and star_val not in ('', '0'))

            word_text = clean_word(raw_word)
            if not word_text:
                continue

            meaning_ja = clean_meaning(cell(ci_meaning))
            pos = normalize_pos(cell(ci_pos)) if cell(ci_pos) else 'noun'
            example = clean_text(cell(ci_example)) if cell(ci_example) else ''

            level = 1 if is_starter else 2
            if is_starter:
                star_count += 1

            words.append({
                "id":               word_id,
                "word":             word_text,
                "meaning_ja":       meaning_ja,
                "meaning_kana":     "",
                "part_of_speech":   pos,
                "category":         "general",
                "example_sentence": example,
                "frequency_rank":   word_id,
                "difficulty":       level,
                "level":            level,
                "is_starter":       is_starter,
            })
            word_id += 1

        print(f"   → {word_id - 1} 語（☆: {star_count} 語）")

    wb.close()
    return words

# ────────────────────────────────────────────────
# メイン
# ────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Excel → vocab JSON 変換")
    parser.add_argument("--xlsx", default="R3ver2_Habatanforstudents.xls",
                        help="Excelファイルのパス")
    parser.add_argument("--out", default=None, help="出力JSONパス（省略時は自動分割）")
    args = parser.parse_args()

    xlsx_path = Path(args.xlsx)
    if not xlsx_path.exists():
        sys.exit(f"❌  Excelファイルが見つかりません: {xlsx_path}")

    print(f"📂  {xlsx_path} を読み込み中...")

    suffix = xlsx_path.suffix.lower()
    if suffix == '.xls':
        words = read_xls(xlsx_path)
    elif suffix in ('.xlsx', '.xlsm'):
        words = read_xlsx(xlsx_path)
    else:
        sys.exit(f"❌  未対応のファイル形式: {suffix}")

    if not words:
        sys.exit("❌  単語が1件も取得できませんでした。")

    total = len(words)
    level1 = sum(1 for w in words if w['level'] == 1)
    level2 = sum(1 for w in words if w['level'] == 2)
    print(f"\n合計 {total} 語")
    print(f"  ☆ レベル1（初期）: {level1} 語")
    print(f"  　 レベル2（通常）: {level2} 語")

    out_dir = Path("data")
    out_dir.mkdir(exist_ok=True)

    if args.out:
        out_path = Path(args.out)
        out_path.write_text(json.dumps(words, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"✅  {out_path}: {total} 語")
    else:
        for lvl in sorted(set(w['level'] for w in words)):
            chunk = [w for w in words if w['level'] == lvl]
            path = out_dir / f"vocab-level{lvl}.json"
            path.write_text(json.dumps(chunk, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"✅  {path}: {len(chunk)} 語")

    # サンプル表示
    print("\n=== 変換サンプル（最初の3件）===")
    for w in words[:3]:
        print(json.dumps(w, ensure_ascii=False))


if __name__ == "__main__":
    main()
