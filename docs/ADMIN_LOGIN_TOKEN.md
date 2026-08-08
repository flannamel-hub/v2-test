# Admin 一键登录 · JWT 协议（Phase A）

与商户系统（pro-merchant-v3，`https://store.proplus.onl`）联调约定。  
Blog 侧通过 **Vercel env** 验签，**不**读取商户数据库。

---

## 流程

1. 商家在商户系统点击「进入后台」
2. 商户系统 `POST /api/merchant/blog/login-link`，Body: `{ "serviceId": "<uuid>" }`
3. 响应 `{ "url": "https://{host}/admin?login_token=...", "aud": "...", "expiresInSec": 300 }`
4. 浏览器打开 URL → Blog middleware 验签 → 写入 `internal_auth` Cookie → 302 到 `/admin`（无 query）
5. 后续 `/admin` 页面走 Cookie / Basic Auth；Admin API 必须由各路由执行明确的管理员或服务端鉴权，不能只依赖 middleware matcher

---

## 环境变量（Blog / Vercel）

| 变量 | 必填 | 说明 |
|------|------|------|
| `BLOG_LOGIN_JWT_SECRET` | JWT 登录时必填 | HS256 密钥；商户部署或首次「进入后台」时写入本 Project |
| `AUTH_USER` | 是 | 须与 JWT `sub` 一致 |
| `AUTH_PASS` | 是 | Cookie / Basic Auth 用（JWT 不含密码） |
| `DISABLE_LEGACY_URL_PASSWORD` | 否 | `true` / `1` 时关闭 `?auth_u=&auth_p=`；默认 **开启** legacy |

---

## JWT 规范

| 项 | 值 |
|----|-----|
| 算法 | HS256 |
| Query 参数 | `login_token` |
| `iss` | `pro-merchant` |
| `sub` | 等于该站 `AUTH_USER`（通常 `admin`） |
| `aud` | 当前 Blog 的 Host，小写、无协议（如 `z4sobc.vercel.app`） |
| `purpose` | `admin_login` |
| `site_id` | `merchant_services.id`（UUID；Phase A Blog 不校验） |
| `exp` | `iat + 300` 秒 |
| `jti` | UUID（Phase A 不校验单次使用） |

### 示例 Payload

```json
{
  "iss": "pro-merchant",
  "sub": "admin",
  "aud": "z4sobc.vercel.app",
  "purpose": "admin_login",
  "site_id": "550e8400-e29b-41d4-a716-446655440000",
  "iat": 1717500000,
  "exp": 1717500300,
  "jti": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
}
```

---

## Blog Middleware 校验顺序

1. 读取 `login_token`
2. HS256 验签（`BLOG_LOGIN_JWT_SECRET`）
3. `exp` 未过期（`jose` 自动校验）
4. `iss === "pro-merchant"`
5. `purpose === "admin_login"`
6. `aud === request Host`（小写）
7. `sub === AUTH_USER`
8. 若配置了 `BLOG_SITE_ID`：`site_id === BLOG_SITE_ID`
9. 设置 `internal_auth` Cookie，302 到 `/admin`（去掉 token）

实现：`src/middleware.ts`、`src/lib/admin/loginToken.ts`

### Admin API 当前边界

- middleware 的 matcher 包含 `/api/admin/:path*`，但实现分支当前只处理 `/admin` 页面。
- `/api/admin/upload` 与 `/api/admin/crawler-ingest` 已在路由内调用 `verifyAdminRequest(req)`，接受 Basic 或 `internal_auth` Cookie。
- 平台服务端调用的友链、公告、贩售机和 revalidate 接口尚待独立服务到服务鉴权；在该协议落地前，不得通过扩大 middleware 分支统一拦截全部 Admin API。

---

## Legacy URL 密码登录

在 `DISABLE_LEGACY_URL_PASSWORD` 未开启时，仍支持：

```
/admin?auth_u={AUTH_USER}&auth_p={AUTH_PASS}
```

商户 UI Phase A 已改为 JWT，legacy 仅供迁移期手工联调。

---

## 联调清单（试点 SRV-Z4SOBC）

1. Blog 部署含 JWT middleware 的版本
2. Vercel Project 存在 `BLOG_LOGIN_JWT_SECRET`（商户侧点「进入后台」可懒写入）
3. 商户系统 → 进入后台 → 应无密码进入 admin
4. 过期 token → 401
5. `aud` 与 Host 不一致 → 401
6. 未配置 `BLOG_LOGIN_JWT_SECRET` 时带 token → 401

---

## Phase A 范围外

- 每租户独立 Supabase
- `GALLERY_QUOTA_GB`
- `GET /api/health`（可选）

---

## 商户系统职责（Blog 不实现）

- `blog_site_secrets` 表加密存 JWT secret
- 新部署 / 懒写入 Vercel `BLOG_LOGIN_JWT_SECRET`
- 签发 `login_token` 并返回 URL

详见商户仓库 `docs/ADMIN_LOGIN_TOKEN.md`。
