# 问得好 - 生产部署指南

> 正式域名：**wenhaode.com** · API：**api.wenhaode.com**

---

## 零、DNS 配置（域名已购 wenhaode.com）

在域名注册商 DNS 控制台添加：

| 类型 | 主机记录 | 记录值 | 说明 |
|------|----------|--------|------|
| A | `@` | 你的服务器 IP | 主站（可选，后期官网） |
| A | `api` | 你的服务器 IP | **API 服务（必配）** |
| A | `www` | 你的服务器 IP | 可选，跳转到主站 |

生效后验证：

```bash
ping api.wenhaode.com
curl https://api.wenhaode.com/health
```

---

## 一、你需要准备的账号与资源

| 项目 | 说明 | 参考费用 |
|------|------|----------|
| 域名 | **wenhaode.com**（已购），API 子域名 **api.wenhaode.com** | 已就绪 |
| 云服务器 | 2核4G 起，Ubuntu 22.04+ | ¥100–300/月 |
| DeepSeek API | [platform.deepseek.com](https://platform.deepseek.com) 充值 | 按量，建议预充 ¥100 |
| Chrome 开发者 | [Chrome Web Store 开发者](https://chrome.google.com/webstore/devconsole) | $5 一次性 |
| SSL 证书 | 推荐 Caddy / Certbot 免费证书 | 免费 |

---

## 二、服务器部署（Docker 推荐）

### 1. 克隆代码并配置环境

```bash
git clone <your-repo> aihelper && cd aihelper

cp server/.env.example server/.env
# 编辑 server/.env，至少修改：
# - DEEPSEEK_API_KEY
# - ADMIN_TOKEN（随机长字符串）
# - DB_PASSWORD
# - APP_ENV=production
# - API_AUTH_ENABLED=true
# - DOCS_ENABLED=false
```

### 2. 启动服务

```bash
docker compose up -d --build
```

验证：

```bash
curl https://api.wenhaode.com/health
# {"status":"ok","env":"production"}
```

### 3. HTTPS 反向代理（Nginx 示例）

```nginx
server {
    listen 443 ssl http2;
    server_name api.wenhaode.com;

    ssl_certificate     /etc/letsencrypt/live/api.wenhaode.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.wenhaode.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }
}
```

或使用 Caddy（自动 HTTPS）：

```
api.wenhaode.com {
    reverse_proxy localhost:8000
}
```

---

## 三、API Key 管理

### 创建用户 Key

```bash
cd server
python3 scripts/create_api_key.py --label "内测用户张三" --limit 100
```

输出示例（**仅显示一次，请发给用户**）：

```
wh_xxxxxxxxxxxxxxxxxxxx
```

### 或通过环境变量批量配置

`server/.env`：

```env
API_KEYS=内测A:100:wh_aaa,内测B:50:wh_bbb
```

### 限流规则

- `analyze` 和 `complete` **各计 1 次**
- 一次完整优化 ≈ 2 次配额
- 默认每 Key 日限额 100（约 50 次完整优化）
- 可在 `.env` 调整 `DEFAULT_DAILY_LIMIT`

---

## 四、管理后台

访问：`https://api.wenhaode.com/stats`

1. 输入 `ADMIN_TOKEN`（与 `.env` 中一致）
2. 点击「保存并加载」

也可 URL 直达：`https://api.wenhaode.com/stats?token=你的ADMIN_TOKEN`

---

## 五、插件生产构建

### 1. 配置构建环境

```bash
cd extension
cp .env.production.example .env.production
# 修改 VITE_API_BASE、VITE_PRIVACY_URL、VITE_TERMS_URL 为你的域名
```

### 2. 构建

```bash
npm install
npm run build
```

产物在 `extension/dist/`，会自动把 `VITE_API_BASE` 加入 `host_permissions`。

### 3. 打包上架 Chrome Web Store

```bash
cd extension/dist && zip -r ../wenhaode-extension.zip .
```

商店需提交：

- zip 包
- 图标 128×128
- 截图 3–5 张
- **隐私政策 URL**：`https://api.wenhaode.com/privacy`
- 权限说明（读取 ChatGPT/DeepSeek 输入框用于优化提问）

### 4. 用户首次配置

用户安装后点击插件图标，填入：

- **API 地址**：`https://api.wenhaode.com`
- **API Key**：你分发的 `wh_xxx`

---

## 六、法律页面

已内置，部署后可直接访问：

- 隐私政策：`/privacy`
- 用户协议：`/terms`

上线前请修改 `server/.env` 中的 `SITE_URL` 和 `CONTACT_EMAIL`，并同步更新 HTML 中的联系邮箱（如需要）。

---

## 七、安全检查清单

- [ ] `API_AUTH_ENABLED=true`
- [ ] `ADMIN_TOKEN` 已设为强随机字符串
- [ ] `DOCS_ENABLED=false`（关闭公开 API 文档）
- [ ] `/stats` 需 Token 才能访问
- [ ] DeepSeek 账户设置余额告警
- [ ] MySQL 不暴露公网 3306
- [ ] `.env` 不提交到 Git

---

## 八、本地开发（鉴权关闭）

`server/.env`：

```env
APP_ENV=development
API_AUTH_ENABLED=false
DOCS_ENABLED=true
```

插件 Popup 可不填 API Key，API 地址填 `http://localhost:8000`。

---

## 九、故障排查

| 现象 | 处理 |
|------|------|
| 401 缺少 API Key | 插件 Popup 填写 Key |
| 429 次数达上限 | 提高 `--limit` 或等次日重置 |
| 403 stats 无权 | 检查 ADMIN_TOKEN |
| 无法连接服务 | 检查 HTTPS、manifest host_permissions、防火墙 |

---

## 十、后续可扩展（暂未实现）

- 用户注册/登录自助领 Key
- 微信/支付宝订阅
- 多模型切换
- Redis 限流（高并发场景）
