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
```

在仓库根目录新建 `.dev.vars`（已在 `.gitignore` 中，不要提交）：

```bash
ADMIN_TOKEN=dev-token
```

启动本地 Worker 和本地 KV：

```bash
npx wrangler dev
```

打开 http://localhost:8787 和 http://localhost:8787/admin

## 部署

### 1. 创建 KV namespace

```bash
npx wrangler login
npx wrangler kv namespace create BOOKMARKS_KV
```

命令会输出一个 namespace `id`，记下来。

### 2. 填写 wrangler.toml 占位符

`wrangler.toml` 里有 `YOUR_ACCOUNT_ID` 和 `YOUR_KV_NAMESPACE_ID` 两个占位符（顶层配置和 `[env.production]` 各一份）：

- `YOUR_ACCOUNT_ID`：Cloudflare Dashboard 里 Workers & Pages 页面右侧的 Account ID，或 URL `https://dash.cloudflare.com/<ACCOUNT_ID>/...` 中的那一段。
- `YOUR_KV_NAMESPACE_ID`：上一步 `wrangler kv namespace create` 输出的 `id`。

### 3. 设置管理令牌

```bash
npx wrangler secret put ADMIN_TOKEN
```

本地开发用 `.dev.vars`，生产用 secret，不要把 token 写进 `wrangler.toml` 的 `[vars]`。

### 4. 部署

```bash
npm run deploy
```

KV 沿用现有 namespace（binding `BOOKMARKS_KV`）。主 key 改为 `nav:data`，旧的 `site:bookmarks` 在首次读取时会自动迁移。

Worker 名是 `zero-nav`（不再用 OpenNext 的 `zero-nav-next`）。

### GitHub Actions

`main` 推送后自动 `wrangler deploy`（`cloudflare/wrangler-action@v4` + wrangler v4）。

需要的 Repository secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ADMIN_TOKEN`

还需要 Repository variable：

- `BOOKMARKS_KV_ID`：生产 KV namespace id。

工作流会在部署前用 `preCommands` 把 `wrangler.toml` 里的 `YOUR_ACCOUNT_ID` / `YOUR_KV_NAMESPACE_ID` 替换成 `CLOUDFLARE_ACCOUNT_ID` 和 `BOOKMARKS_KV_ID`，因此仓库里可以安全地保留占位符。

## 数据

主文档 `nav:data`：

```ts
{
  v: 1,
  rev: number,
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
npx wrangler kv key put nav:data --path=nav-data.json --binding=BOOKMARKS_KV --local
```

`--local` 写入本地 `wrangler dev` 的 KV；写远程 KV 时去掉 `--local`。

自定义输入：

```bash
npx tsx scripts/migrate-from-zero-nav.ts config.yml nav-data.json
npx tsx scripts/migrate-from-zero-nav.ts bookmarks.json nav-data.json
```

## 数据一致性与限制

- **缓存与最终一致**：KV 是最终一致的；后台保存后，其他地区最多约 60 秒才能看到新数据。前台首页不再额外加 30 秒浏览器缓存（`Cache-Control: public, max-age=0`），刷新即回源。
- **20 MiB 写入上限**：整个文档存在单个 KV value 里，Cloudflare 硬上限是 25 MiB。写入前会序列化检查，超过 20 MiB 直接返回 HTTP 413。优先使用图标 URL，避免把大段内联 SVG 存进文档。
- **空分类不展示**：首页只显示至少有一条可见链接的分类；空分类（或全部链接被隐藏的分类）仍保留在后台，可继续编辑。
- **并发与 rev**：主文档带 `rev`，每次成功写入加 1。写接口（`/api/admin/*`）接受可选的客户端版本号：JSON body 里的 `rev` 字段，或 `If-Match` 请求头。版本过期时返回 `409 {"error":"conflict","rev":<当前版本>}`，不会静默覆盖。后台遇到 409 会提示“数据已在别处修改，请刷新页面后重试”。不传 rev 时按服务端读取到的最新版本写入。

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
