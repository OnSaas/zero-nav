# zero-nav

Cloudflare Worker 上的个人导航站：Hono 直接吐 HTML，数据在 KV。前台首屏就是完整页面；后台改完刷新即可见。

## 功能

- 公开导航：分类 + 链接，服务端渲染
- 管理后台：登录、分类/链接 CRUD、排序、显隐、搜索、批量移动/删除
- 导入 JSON / YAML（含旧 `config.yml`）/ 浏览器书签 HTML，支持预览
- 导出 JSON / YAML
- 写入前自动备份，30 天 TTL，可回滚
- 粘贴 URL 后抓取标题和 favicon

## 技术栈

| 层 | 选择 |
|---|---|
| 运行时 | Cloudflare Worker + Hono |
| 数据 | KV 主文档 `nav:data` + `nav:history:*` |
| 前台 | Worker 拼 HTML（zero-nav 原视觉） |
| 后台 | HTML + 原生 JS |
| 鉴权 | `ADMIN_TOKEN` secret + HttpOnly Cookie |

## 本地开发

```bash
npm install
# 在 .dev.vars 里写：
# ADMIN_TOKEN=dev-token
npx wrangler dev
```

打开 http://localhost:8787 和 http://localhost:8787/admin

## 部署

```bash
npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

KV 沿用现有 namespace（binding `BOOKMARKS_KV`）。主 key 改为 `nav:data`，旧的 `site:bookmarks` 在首次读取时会自动迁移。

Worker 名是 `zero-nav`（不再用 OpenNext 的 `zero-nav-next`）。

GitHub Actions：`main` 推送后 `wrangler deploy`，注入 `ADMIN_TOKEN`。

需要的 Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`ADMIN_TOKEN`。

## 数据

主文档 `nav:data`：

```ts
{
  v: 1,
  updatedAt: string,
  site: { title, headerText, footerText, themeColor, showDescription, showCategoryTitle },
  categories: [{ id, name, icon?, order, visible, items: [{ id, title, url, description, icon, order, visible }] }]
}
```

分类是一等公民，不再用 `tags[0]`。

## 迁移

1. 若 KV 里已有 `site:bookmarks`：部署后第一次读前台/后台会自动转成 `nav:data`。
2. 若 KV 从未写成功，用仓库里的 `config.yml`：

```bash
npm run migrate
# 生成 nav-data.json
npx wrangler kv key put nav:data --path=nav-data.json --binding=BOOKMARKS_KV
```

自定义输入：

```bash
npx tsx scripts/migrate-from-zero-nav.ts config.yml nav-data.json
npx tsx scripts/migrate-from-zero-nav.ts bookmarks.json nav-data.json
```

## 鉴权

- 后台页面：登录后 Cookie `nav_session`（HttpOnly）。写操作带 CSRF。
- 脚本：请求头 `x-admin-token` 仍可用（curl），这种模式不走 CSRF。
- 登录失败按 IP 计数，5 次锁定 15 分钟。

不要把 token 放进 `wrangler.toml` 的 `[vars]`。

## 常用路径

```
/                    公开导航
/admin               工作台（左分类右链接）
/admin/login
/admin/categories
/admin/items
/admin/items/new
/admin/settings
/admin/import
/admin/export
/admin/history
GET /api/public/nav
```
