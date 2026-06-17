"""API 费用估算"""

import os


def calc_cost(prompt_tokens: int, completion_tokens: int) -> float:
  """按 DeepSeek 单价估算（元/百万 Token，可在 .env 配置）"""
  input_price = float(os.getenv("DEEPSEEK_INPUT_PRICE_PER_M", "1.0"))
  output_price = float(os.getenv("DEEPSEEK_OUTPUT_PRICE_PER_M", "2.0"))
  return round(
    (prompt_tokens * input_price + completion_tokens * output_price) / 1_000_000,
    6,
  )
