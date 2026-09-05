# 单 B 参考：统计口径权威定义（复制自主站 lib/stats/metrics.ts，勿改动）

> 来源：pro-merchant-v3/lib/stats/metrics.ts（2026-09-05 单 A 定稿）。
> 本文件供单 B 实现 `src/lib/stats/classify.ts` 时**照抄**集合与规则；两端必须保持一致。
> 若未来修改口径：先改主站 metrics.ts，再同步本文件与模板实现，最后同步 flush RPC 校验集。

## 1. UA 分类（VISIT_UA_CLASSES）

```
'desktop' | 'mobile' | 'tablet' | 'bot' | 'other'
```

classifyUserAgent(ua)：
1. trim 后为空 → `other`
2. `/bot|crawler|spider|crawling|headless/i` 命中 → `bot`
3. `/ipad|tablet/i` 命中 → `tablet`
4. `/mobile|iphone|android/i` 命中 → `mobile`
5. 否则 → `desktop`

## 2. Referrer 分类（VISIT_REFERRER_CLASSES）

```
'engine' | 'social' | 'direct'
```

**engine**（host 一级标签前缀匹配；覆盖国家域 google.com.hk / yandex.ru）：

```
google.  bing.  duckduckgo.  yandex.
```

**social**：

```
facebook.  instagram.  x.com  twitter.  t.co  telegram.  qq.com  weixin.  wechat.
weibo.  zhihu.  reddit.  youtube.  tiktok.  douyin  linkedin.  pinterest.  discord.
```

classifyReferrerHost(host)：
1. `host` trim+lowercase，去 `www.` 前缀 → normalized；空 → `direct`
2. normalized 以任一 engine 前缀开头 → `engine`
3. 否则以任一 social 前缀开头 → `social`
4. 其余（含友链等外链）→ `direct`

## 3. HMAC ip_hmac（单一权威算法）

```
ip_hmac = hex( HMAC-SHA256( key = String(STATS_HMAC_SALT env), message = clientIp ) )
```

- 输出 = 64 个 hex 小写字符（flush RPC 校验 `^[0-9a-f]{64}$`）
- clientIp 取值顺序与现有 pv-flush `getClientIp` 一致（x-forwarded-for 第一项 → x-real-ip → socket）
- **无 STATS_HMAC_SALT env → 跳过 visit RPC**（保留旧路径），不报错

## 4. RPC 签名（单 A 定稿，勿改）

```
flush_blog_visit_events(p_events jsonb)
```

payload 元素键名（精确）：
`{ "site_id": "...", "ip_hmac": "64hex", "ua_class": "desktop|mobile|tablet|bot|other",
   "referrer_class": "engine|social|direct", "ts": "ISO8601", "pv_count": 1 }`

- site_id = 本站 BLOG_SITE_ID（uuid 字符串）
- pv_count ∈ [1, 1000]；ts 窗口 ±48h~5min；坏载荷 RPC 内拒绝（rejected 计数）
- 单批 ≤200 条（单 B 当前一次 1 条即可）
