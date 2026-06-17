"""MySQL 数据库连接与初始化"""

import os
from pathlib import Path

import pymysql
from dotenv import load_dotenv
from pymysql.cursors import DictCursor

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS ai_users (
  client_id VARCHAR(64) PRIMARY KEY COMMENT '匿名用户ID',
  first_seen_at DATETIME NOT NULL COMMENT '首次使用时间',
  last_seen_at DATETIME NOT NULL COMMENT '最近使用时间',
  total_events INT NOT NULL DEFAULT 0 COMMENT '总事件数',
  total_sessions INT NOT NULL DEFAULT 0 COMMENT '优化流程次数',
  total_optimize_clicks INT NOT NULL DEFAULT 0 COMMENT '点击优化次数',
  total_analyze_success INT NOT NULL DEFAULT 0 COMMENT '分析成功次数',
  total_complete_success INT NOT NULL DEFAULT 0 COMMENT '补全成功次数',
  total_send_success INT NOT NULL DEFAULT 0 COMMENT '发送成功次数',
  total_tokens INT NOT NULL DEFAULT 0 COMMENT '累计Token消耗',
  total_cost DECIMAL(12,6) NOT NULL DEFAULT 0 COMMENT '累计API花费(元)',
  max_session_duration_sec INT NOT NULL DEFAULT 0 COMMENT '单次最长流程时长(秒)',
  consecutive_days INT NOT NULL DEFAULT 1 COMMENT '连续活跃天数',
  last_active_date DATE COMMENT '最近活跃日期',
  primary_platform VARCHAR(32) COMMENT '主要使用平台'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_sessions (
  session_id VARCHAR(64) PRIMARY KEY COMMENT '单次优化流程ID',
  client_id VARCHAR(64) NOT NULL,
  platform VARCHAR(32),
  started_at DATETIME NOT NULL,
  ended_at DATETIME,
  duration_sec INT NOT NULL DEFAULT 0 COMMENT '流程时长(秒)',
  event_count INT NOT NULL DEFAULT 0,
  tokens_used INT NOT NULL DEFAULT 0,
  cost DECIMAL(12,6) NOT NULL DEFAULT 0,
  INDEX idx_ai_sessions_client (client_id),
  INDEX idx_ai_sessions_started (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  session_id VARCHAR(64),
  client_id VARCHAR(64),
  platform VARCHAR(32),
  properties JSON,
  tokens_prompt INT NOT NULL DEFAULT 0,
  tokens_completion INT NOT NULL DEFAULT 0,
  cost DECIMAL(12,6) NOT NULL DEFAULT 0 COMMENT '本次API花费(元)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_events_type (event_type),
  INDEX idx_ai_events_client (client_id),
  INDEX idx_ai_events_session (session_id),
  INDEX idx_ai_events_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_api_keys (
  key_hash VARCHAR(64) PRIMARY KEY COMMENT 'API Key SHA256',
  key_prefix VARCHAR(16) NOT NULL COMMENT 'Key 前缀（脱敏展示）',
  label VARCHAR(64) NOT NULL DEFAULT '' COMMENT '备注/用户标识',
  daily_limit INT NOT NULL DEFAULT 50 COMMENT '日调用上限',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_api_keys_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_rate_limits (
  key_hash VARCHAR(64) NOT NULL,
  usage_date DATE NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (key_hash, usage_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""


def get_db_config() -> dict:
  return {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "poem"),
    "password": os.getenv("DB_PASSWORD", "poem"),
    "database": os.getenv("DB_NAME", "poem"),
    "charset": "utf8mb4",
    "cursorclass": DictCursor,
    "autocommit": False,
  }


def get_connection():
  return pymysql.connect(**get_db_config())


def init_db() -> None:
  conn = get_connection()
  try:
    with conn.cursor() as cur:
      for stmt in SCHEMA_SQL.split(";"):
        sql = stmt.strip()
        if sql:
          cur.execute(sql)
    conn.commit()
  finally:
    conn.close()
