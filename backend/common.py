"""共享工具函数"""
import json
from datetime import datetime
from pathlib import Path
from typing import List
from dateutil import parser as date_parser


def parse_timestamp(ts: str) -> datetime:
    """解析时间戳"""
    try:
        return date_parser.parse(ts)
    except Exception:
        return datetime.now()


def parse_jsonl_file(file_path: Path) -> List[dict]:
    """解析单个 JSONL 文件"""
    records: List[dict] = []
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        records.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        print(f"Error parsing {file_path}: {e}")
    return records
