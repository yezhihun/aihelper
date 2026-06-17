#!/usr/bin/env python3
"""创建 API Key 并写入数据库

用法:
  cd server && python3 scripts/create_api_key.py --label "内测用户A" --limit 100
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv()

from database.db import init_db
from services.auth import generate_api_key, insert_api_key


def main() -> None:
  parser = argparse.ArgumentParser(description="创建问得好 API Key")
  parser.add_argument("--label", required=True, help="用户/用途标识")
  parser.add_argument("--limit", type=int, default=None, help="日调用上限")
  args = parser.parse_args()

  init_db()
  key = generate_api_key()
  insert_api_key(key, args.label, args.limit)

  print("API Key 已创建（请妥善保存，仅显示一次）：")
  print(key)
  print(f"标签: {args.label}")
  if args.limit:
    print(f"日限额: {args.limit}")


if __name__ == "__main__":
  main()
