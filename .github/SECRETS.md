# GitHub Secrets 配置指南

为了让 GitHub Actions 自动部署到 Cloudflare，你需要在 GitHub 仓库中配置以下 Secrets。

## 🔐 必需的 Secrets

前往你的 GitHub 仓库 **Settings > Secrets and variables > Actions**，添加以下 Repository secrets：

### 1. CLOUDFLARE_API_TOKEN

**获取方式**：
1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 "Create Token"
3. 使用 "Edit Cloudflare Workers" 模板
4. 或创建自定义 Token，需要以下权限：
   - Account > Cloudflare Workers Scripts > Edit
   - Account > Cloudflare Workers KV Storage > Edit
5. 复制生成的 Token

**在 GitHub 中添加**：
- Name: `CLOUDFLARE_API_TOKEN`
- Value: `你的 API Token`

---

### 2. CLOUDFLARE_ACCOUNT_ID

**获取方式**：
1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 选择任意网站（或点击 Workers & Pages）
3. 在右侧边栏找到 "Account ID"
4. 或从 URL 中获取：`https://dash.cloudflare.com/<ACCOUNT_ID>/...`

**在 GitHub 中添加**：
- Name: `CLOUDFLARE_ACCOUNT_ID`
- Value: `你的 Account ID`

---

### 3. ADMIN_TOKEN

这是管理后台的访问令牌，自己设置一个强密码。

**在 GitHub 中添加**：
- Name: `ADMIN_TOKEN`
- Value: `your-secure-password-here`

**重要**：这个密码用于访问 `/admin` 管理界面，请设置复杂密码。

---

## 📝 配置 KV Namespace

### 创建 KV Namespace

在本地运行：

```bash
# 安装 wrangler（如果还没安装）
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 创建生产环境 KV
wrangler kv:namespace create "BOOKMARKS"
# 记录输出的 id: xxxxxxxx

# 创建预览环境 KV
wrangler kv:namespace create "BOOKMARKS" --preview
# 记录输出的 preview_id: yyyyyyyy
```

### 更新 wrangler.toml

在本地更新 `wrangler.toml`，然后提交到 GitHub：

```toml
name = "zero-nav"
main = "src/index.ts"
compatibility_date = "2025-11-20"

[[kv_namespaces]]
binding = "BOOKMARKS_KV"
id = "xxxxxxxx"              # 替换为你的生产 KV ID

# ADMIN_TOKEN 从 GitHub Secrets 注入，不要在这里设置
```

提交更改：

```bash
git add wrangler.toml
git commit -m "Update KV namespace IDs"
git push
```

---

## 🚀 触发部署

### 自动部署

推送到 `main` 分支会自动触发部署：

```bash
git push origin main
```

### 手动部署

在 GitHub 仓库的 **Actions** 页面：
1. 选择 "Deploy to Cloudflare Workers" workflow
2. 点击 "Run workflow"
3. 选择分支并运行

---

## 📋 完整配置检查清单

- [ ] 创建 Cloudflare API Token
- [ ] 添加 `CLOUDFLARE_API_TOKEN` 到 GitHub Secrets
- [ ] 添加 `CLOUDFLARE_ACCOUNT_ID` 到 GitHub Secrets
- [ ] 添加 `ADMIN_TOKEN` 到 GitHub Secrets
- [ ] 创建 KV Namespace（生产 + 预览）
- [ ] 更新 `wrangler.toml` 中的 KV IDs
- [ ] 推送代码到 `main` 分支
- [ ] 检查 GitHub Actions 运行状态

---

## 🔍 验证部署

部署成功后：

1. **访问首页**：`https://zero-nav.<your-subdomain>.workers.dev`
2. **访问管理**：`https://zero-nav.<your-subdomain>.workers.dev/admin`
3. 使用你设置的 `ADMIN_TOKEN` 登录

---

## 🛠️ 故障排除

### 部署失败：401 Unauthorized

检查 `CLOUDFLARE_API_TOKEN` 是否正确，Token 权限是否足够。

### 部署失败：KV namespace not found

检查 `wrangler.toml` 中的 KV namespace ID 是否正确。

### 管理后台无法登录

检查 `ADMIN_TOKEN` Secret 是否正确设置。

### 查看详细日志

在 GitHub Actions 页面查看每个步骤的详细输出。

---

## 🔒 安全建议

1. **不要**将敏感信息提交到 Git
2. **定期轮换** Cloudflare API Token
3. **使用强密码**作为 ADMIN_TOKEN
4. **限制** API Token 权限（只给必需的权限）
5. **启用** Cloudflare Workers 的访问控制（可选）

---

## 📚 相关文档

- [Cloudflare API Tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [Wrangler Commands](https://developers.cloudflare.com/workers/wrangler/commands/)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Cloudflare Workers Deployment](https://developers.cloudflare.com/workers/platform/deployments/)
