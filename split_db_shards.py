#!/usr/bin/env python3
from __future__ import annotations

import argparse
import math
import os
import shutil
import sqlite3
from pathlib import Path
from typing import Iterable, List, Sequence, Tuple

import pandas as pd

from convert_csv_to_db import create_database


def table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    ).fetchone()
    return bool(row)


def chunk_evenly(values: Sequence[int], chunks: int) -> List[Tuple[int, int]]:
    total = len(values)
    if total == 0:
        return []

    ranges: List[Tuple[int, int]] = []
    base = total // chunks
    extra = total % chunks
    start = 0
    for i in range(chunks):
        size = base + (1 if i < extra else 0)
        if size <= 0:
            continue
        end = start + size
        subset = values[start:end]
        ranges.append((subset[0], subset[-1]))
        start = end
    return ranges


def fetch_alias_rows(conn: sqlite3.Connection) -> List[Tuple[str, str, str, str]]:
    if not table_exists(conn, "journal_aliases"):
        return []
    rows = conn.execute(
        "SELECT alias, normalized, journal_level, journal_type FROM journal_aliases"
    ).fetchall()
    return [tuple(row) for row in rows]


def fetch_links_rows(
    conn: sqlite3.Connection,
    has_links: bool,
    min_id: int,
    max_id: int,
) -> List[Tuple[int, str, str]]:
    if not has_links:
        return []
    rows = conn.execute(
        """
        SELECT article_id, journal_normalized, journal_display
        FROM article_journal_links
        WHERE article_id BETWEEN ? AND ?
        """,
        (min_id, max_id),
    ).fetchall()
    return [tuple(row) for row in rows]


def write_manifest(output_dir: Path, shard_paths: Iterable[Path], max_size_mb: float) -> None:
    shard_paths = list(shard_paths)
    env_line = "CITATIONS_DB_FILES=" + ",".join(str(p.resolve()) for p in shard_paths)
    lines = [
        "# SQLite shard manifest",
        f"max_size_mb={max_size_mb}",
        f"shard_count={len(shard_paths)}",
        "",
        "# Use this env var to start app.py in shard mode:",
        env_line,
        "",
        "# Files:",
    ]
    for p in shard_paths:
        size_mb = p.stat().st_size / 1024 / 1024
        lines.append(f"- {p.name}: {size_mb:.2f} MB")

    (output_dir / "manifest.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_shards(
    input_db: Path,
    output_dir: Path,
    max_size_mb: float,
    max_attempts: int,
) -> List[Path]:
    if not input_db.exists():
        raise FileNotFoundError(f"Input DB not found: {input_db}")

    with sqlite3.connect(str(input_db)) as src_conn:
        src_conn.row_factory = sqlite3.Row
        article_ids = [
            int(row["Article_ID"])
            for row in src_conn.execute("SELECT Article_ID FROM articles ORDER BY Article_ID").fetchall()
        ]
        if not article_ids:
            raise RuntimeError("Source DB has no rows in articles table.")

        alias_rows = fetch_alias_rows(src_conn)
        has_links = table_exists(src_conn, "article_journal_links")

        source_size_mb = input_db.stat().st_size / 1024 / 1024
        shard_count = max(1, math.ceil(source_size_mb / max_size_mb))

        for attempt in range(max_attempts):
            current_shards = shard_count + attempt
            attempt_dir = output_dir.parent / f"{output_dir.name}.attempt_{current_shards}"
            if attempt_dir.exists():
                shutil.rmtree(attempt_dir)
            attempt_dir.mkdir(parents=True, exist_ok=True)

            print(f"Trying shard_count={current_shards}")
            ranges = chunk_evenly(article_ids, current_shards)
            shard_paths: List[Path] = []
            too_large = False

            for i, (min_id, max_id) in enumerate(ranges, start=1):
                articles_df = pd.read_sql_query(
                    "SELECT * FROM articles WHERE Article_ID BETWEEN ? AND ? ORDER BY Article_ID",
                    src_conn,
                    params=(min_id, max_id),
                )
                links_rows = fetch_links_rows(src_conn, has_links, min_id, max_id)

                shard_path = attempt_dir / f"citations_shard_{i:02d}.db"
                create_database(str(shard_path), articles_df, alias_rows, links_rows)
                shard_paths.append(shard_path)

                shard_size_mb = shard_path.stat().st_size / 1024 / 1024
                print(f"  shard {i:02d}: ids {min_id}-{max_id}, size={shard_size_mb:.2f} MB")
                if shard_size_mb > max_size_mb:
                    too_large = True

            if too_large:
                shutil.rmtree(attempt_dir)
                continue

            if output_dir.exists():
                shutil.rmtree(output_dir)
            attempt_dir.rename(output_dir)
            write_manifest(output_dir, sorted(output_dir.glob("*.db")), max_size_mb)
            return sorted(output_dir.glob("*.db"))

    raise RuntimeError(
        f"Unable to create shards under {max_size_mb} MB after {max_attempts} attempts. "
        "Try lowering max-size target or increasing max-attempts."
    )


def parse_args() -> argparse.Namespace:
    base = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Split citations.db into multiple SQLite shards under size limit.")
    parser.add_argument("--input", default=str(base / "citations.db"), help="Input SQLite DB path")
    parser.add_argument("--output-dir", default=str(base / "db_shards"), help="Output directory for shards")
    parser.add_argument("--max-size-mb", type=float, default=95.0, help="Maximum size per shard (MB)")
    parser.add_argument("--max-attempts", type=int, default=10, help="How many shard-count attempts")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_db = Path(args.input).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()

    shard_paths = build_shards(
        input_db=input_db,
        output_dir=output_dir,
        max_size_mb=float(args.max_size_mb),
        max_attempts=int(args.max_attempts),
    )

    print("\nDone.")
    print(f"Shards written to: {output_dir}")
    print("Use env var from manifest.txt to run app in sharded mode.")


if __name__ == "__main__":
    main()
