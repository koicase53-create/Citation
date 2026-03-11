from __future__ import annotations

from collections import defaultdict
from functools import lru_cache
import os
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

import pandas as pd


LATEST_LEVELS = ("CSSCI", "C扩", "集刊")
LEVEL_TO_TYPE = {
    "CSSCI": "外语C刊",
    "C扩": "外语核心期刊",
    "集刊": "外语C集刊",
    "普刊": "普刊",
    "未知": "未知",
}

LEVEL_TO_UI_LABEL = {
    "CSSCI": "CSSCI 来源期刊(C刊)",
    "C扩": "CSSCI 扩展版来源期刊(C扩)",
    "集刊": "CSSCI 集刊",
}


PROMOTED_TO_CSSCI = {
    "当代外语研究": 2025,
    "华文教学与研究": 2025,
    "解放军外国语学院学报": 2023,
    "外语导刊": 2023,
}

PROMOTED_TO_C_EXT = {
    "山东外语教学": 2025,
    "北京第二外国语学院学报": 2025,
}

LEGACY_CSSCI_JOURNALS = {
    "当代修辞学",
    "当代语言学",
    "方言",
    "汉语学报",
    "汉语学习",
    "民族语文",
    "上海翻译",
    "世界汉语教学",
    "外国语",
    "外语电化教学",
    "外语教学",
    "外语教学理论与实践",
    "外语教学与研究",
    "外语教育研究前沿",
    "外语界",
    "外语与外语教学",
    "现代外语",
    "语文研究",
    "语言教学与研究",
    "语言科学",
    "语言文字应用",
    "语言研究",
    "中国翻译",
    "中国外语",
    "中国语文",
    "当代外国文学",
    "国外文学",
    "外国文学",
    "外国文学动态研究",
    "外国文学评论",
    "外国文学研究",
    "语言与文化论坛",
    "阿拉伯研究论丛",
    "英语研究",
    "圣经文学研究",
    "英美文学研究论丛",
    "复旦外国语言文学论丛",
    "励耘学刊",
    "阿来研究",
    "当代比较文学",
    "跨文化研究",
    "现代中国文化与文学",
    "汉语史学报",
    "汉语史研究集刊",
    "励耘语言学刊",
    "民俗典籍文字研究",
    "南开语言学刊",
    "语言学论丛",
    "语言学研究",
    "语言研究集刊",
    "中国文字研究",
    "对外汉语研究",
    "中国语言文学研究",
    "词学",
    "古代文学理论研究",
    "文学研究",
    "域外汉籍研究集刊",
    "中国诗歌研究",
    "中国诗学研究",
    "中国文学研究",
    "现代传记研究",
    "乐府学",
    "中国现代文学论丛",
}

LEGACY_C_EXT_JOURNALS = {
    "当代外语研究",
    "古汉语研究",
    "华文教学与研究",
    "解放军外国语学院学报",
    "日语学习与研究",
    "外语学刊",
    "外语研究",
    "西安外国语大学学报",
    "语言与翻译",
    "语言战略研究",
    "中国俄语教学",
    "山东外语教学",
    "北京第二外国语学院学报",
    "俄罗斯文艺",
    "红楼梦学刊",
    "鲁迅研究月刊",
    "上海文化",
    "文艺论坛",
    "文艺评论",
    "长江学术",
}

JOURNAL_ALIASES = {
    "外语导刊": "解放军外国语学院学报",
    "外语导刊(解放军外国语学院学报)": "解放军外国语学院学报",
    "外语导刊（解放军外国语学院学报）": "解放军外国语学院学报",
    "外国语(上海外国语大学学报)": "外国语",
    "外国语（上海外国语大学学报）": "外国语",
    "上海翻译(中英文)": "上海翻译",
    "上海翻译（中英文）": "上海翻译",
    "跨文化研究": "跨文化研究论丛",
}


def normalize_journal_name(journal_name: Any) -> str:
    if journal_name is None or pd.isna(journal_name):
        return ""

    name = str(journal_name).strip()
    if not name:
        return ""

    name = name.replace("（", "(").replace("）", ")")
    name = name.replace(" ", " ")  # non-breaking space
    name = " ".join(name.split())

    if "解放军外国语学院学报" in name or name == "外语导刊":
        return "解放军外国语学院学报"

    if name.startswith("外国语("):
        return "外国语"

    return JOURNAL_ALIASES.get(name, name)


def get_journal_name_variants(journal_name: Any) -> List[str]:
    normalized = normalize_journal_name(journal_name)
    if not normalized:
        return []

    variants = {normalized}

    if "(" in normalized:
        variants.add(normalized.split("(", 1)[0].strip())

    if normalized == "解放军外国语学院学报":
        variants.add("外语导刊")

    if normalized == "外国语":
        variants.add("外国语(上海外国语大学学报)")
        variants.add("外国语（上海外国语大学学报）")

    if normalized == "上海翻译":
        variants.add("上海翻译(中英文)")
        variants.add("上海翻译（中英文）")

    if normalized == "跨文化研究论丛":
        variants.add("跨文化研究")

    return sorted(v for v in variants if v)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _legacy_level_by_year(normalized_name: str, year: Any) -> str:
    article_year = _safe_int(year, default=0)

    if normalized_name in PROMOTED_TO_CSSCI:
        if article_year >= PROMOTED_TO_CSSCI[normalized_name]:
            return "CSSCI"
        if normalized_name in LEGACY_C_EXT_JOURNALS:
            return "C扩"

    if normalized_name in PROMOTED_TO_C_EXT:
        if article_year >= PROMOTED_TO_C_EXT[normalized_name]:
            return "C扩"
        return "普刊"

    if normalized_name in LEGACY_CSSCI_JOURNALS:
        return "CSSCI"

    if normalized_name in LEGACY_C_EXT_JOURNALS:
        return "C扩"

    return "普刊"


def classify_journal(journal_name: Any, year: Any, latest_levels: Dict[str, str]) -> Tuple[str, str, str]:
    normalized_name = normalize_journal_name(journal_name)
    if not normalized_name:
        return "未知", LEVEL_TO_TYPE["未知"], "none"

    latest_level = latest_levels.get(normalized_name)
    if latest_level in LATEST_LEVELS:
        return latest_level, LEVEL_TO_TYPE[latest_level], "latest"

    legacy_level = _legacy_level_by_year(normalized_name, year)
    return legacy_level, LEVEL_TO_TYPE.get(legacy_level, "普刊"), "legacy"


@lru_cache(maxsize=4)
def load_catalog(catalog_path: str) -> Dict[str, Any]:
    latest_levels: Dict[str, str] = {}
    display_names_by_norm: Dict[str, Set[str]] = defaultdict(set)
    ui_categories: Dict[str, Dict[str, Dict[str, List[Dict[str, str]]]]] = {
        LEVEL_TO_UI_LABEL[level]: {"subcategories": defaultdict(list)}
        for level in LATEST_LEVELS
    }

    if os.path.exists(catalog_path):
        df = pd.read_excel(catalog_path)
        if {"期刊等级", "期刊方向", "期刊名"}.issubset(set(df.columns)):
            df["期刊等级"] = df["期刊等级"].ffill()
            df["期刊方向"] = df["期刊方向"].ffill()
            df = df[df["期刊等级"].isin(LATEST_LEVELS)]

            for _, row in df.iterrows():
                level = row["期刊等级"]
                direction = str(row["期刊方向"]).strip() if pd.notna(row["期刊方向"]) else "未分类"
                display_name = str(row["期刊名"]).strip() if pd.notna(row["期刊名"]) else ""
                if not display_name:
                    continue

                normalized_name = normalize_journal_name(display_name)
                if not normalized_name:
                    continue

                # 同名刊跨等级时，以表格靠后的行覆盖（即新目录最终呈现优先）
                latest_levels[normalized_name] = level
                display_names_by_norm[normalized_name].add(display_name)

                level_label = LEVEL_TO_UI_LABEL[level]
                subcats = ui_categories[level_label]["subcategories"]
                existing = subcats[direction]
                if not any(item.get("cnTitle") == display_name for item in existing):
                    existing.append({"cnTitle": display_name})

    ui_categories_output: Dict[str, Dict[str, Dict[str, List[Dict[str, str]]]]] = {}
    for level in LATEST_LEVELS:
        label = LEVEL_TO_UI_LABEL[level]
        subcategories = ui_categories[label]["subcategories"]
        if subcategories:
            ui_categories_output[label] = {"subcategories": dict(subcategories)}

    all_known_norms = set(latest_levels.keys())
    all_known_norms.update(normalize_journal_name(name) for name in LEGACY_CSSCI_JOURNALS)
    all_known_norms.update(normalize_journal_name(name) for name in LEGACY_C_EXT_JOURNALS)
    all_known_norms = {name for name in all_known_norms if name}

    return {
        "latest_levels": latest_levels,
        "display_names_by_norm": {k: sorted(v) for k, v in display_names_by_norm.items()},
        "ui_categories": ui_categories_output,
        "all_known_norms": all_known_norms,
    }


def get_catalog_path(base_dir: str) -> str:
    env_path = os.environ.get("LATEST_JOURNAL_CATALOG")
    if env_path:
        return env_path

    default_file = "（最新目录）2025-2026 CSSCI及扩展版期刊目录（语言文学类）.xlsx"
    return os.path.join(base_dir, default_file)


def get_frontend_categories(catalog: Dict[str, Any]) -> Dict[str, Any]:
    return catalog.get("ui_categories", {})


def get_normalized_input_journals(journals: Iterable[str]) -> List[str]:
    return sorted({normalize_journal_name(name) for name in journals if normalize_journal_name(name)})

