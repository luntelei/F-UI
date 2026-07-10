# F-UI

F-UI 是一个用于学习 Cloudflare Workers、D1、KV、Vue、身份认证、访问控制和审计日志相关技术的开源代码项目。作者只发布源码，不提供线上实例、托管部署、公共访问、商业运营、网络接入或代理/VPN 服务。

本项目仅用于源码学习、技术交流、学术研究和受控实验。任何人自行下载、克隆、部署、修改、分发或使用本项目，都必须自行承担全部风险，并自行确认所在地法律法规、监管要求、Cloudflare 条款、数据保护要求、第三方权利和业务资质要求。

如本 README 与 [DISCLAIMER.md](DISCLAIMER.md)、[LEGAL.md](LEGAL.md) 或其他合规文件存在理解差异，应以更严格的限制性、风险提示性和禁止性表述为准。本 README 不构成法律意见、合规意见、安全承诺或运营建议。

请先阅读：

- [DISCLAIMER.md](DISCLAIMER.md)
- [LEGAL.md](LEGAL.md)
- [PRIVACY.md](PRIVACY.md)
- [TERMS_OF_USE.md](TERMS_OF_USE.md)
- [SECURITY.md](SECURITY.md)

## 项目定位

- 仅作为源码学习、技术交流、学术研究和受控实验项目。
- 作者不提供托管实例、线上运营、商业服务、盈利机制、客服支持或可用性保证。
- 本项目及作者行为不构成公共代理服务、VPN 服务、电信服务、网络接入服务、商业转售服务或托管网络服务。
- 不针对任何特定网络环境提供突破、绕过、规避、加速、接入或可用性保证。
- 本项目不内置任何可用节点、代理服务器、账号凭据、订阅地址、域名、Cloudflare 资源、Token 或 Secret。
- 第三方自行部署、修改、传播、教学、演示、售卖、宣传、导流或使用本项目产生的任何后果，均由第三方自行承担，且不代表作者授权、认可、协助、参与或共同运营。

## 代码模块概览

以下内容描述的是源码中包含的技术模块，不表示作者提供可用服务，也不表示可以用于公开运营或任何违法违规用途：

- 账号注册、登录、邀请码和访问凭据管理示例
- 私有实验配置管理示例，涉及 VLESS WebSocket 和 SOCKS5 链式转发相关代码
- 配置导出和格式转换示例，涉及 mixed、Clash 和 sing-box 格式
- Cloudflare 配额与资源状态读取示例
- Telegram 通知、Turnstile 人机验证和网站公告示例
- 操作日志、敏感参数拦截和日志脱敏示例
- 多语言前端界面示例

不得将上述模块用于提供公开代理、公共 VPN、网络接入、电信业务、商业转售、托管运营、规避访问控制、违反平台条款或其他违法违规活动。

## 技术栈

- Frontend: Vue 3, Vite, Element Plus
- Backend: Cloudflare Workers, Hono
- Storage: Cloudflare D1, Workers KV, Worker Secrets
- Security: JWT, Turnstile, RBAC, audit log redaction

## 目录结构

```text
.
├─ f-vue/                # 前端管理界面
├─ f-worker/             # Cloudflare Worker 后端
├─ scripts/              # Windows cmd 辅助脚本
├─ doc/                  # 项目设计和安全说明
├─ DISCLAIMER.md         # 免责声明
├─ LEGAL.md              # 法律与合规说明
├─ PRIVACY.md            # 隐私说明模板
├─ TERMS_OF_USE.md       # 第三方自部署条款模板
├─ SECURITY.md           # 安全策略
└─ LICENSE               # Apache License 2.0
```

## 默认资源名

| 资源 | 默认名称 |
|------|----------|
| Worker | `f-ui` |
| KV 资源默认名 | `f-ui-kv` |
| D1 数据库默认名 | `f-ui-db` |
| KV 代码绑定名 | `F_UI_KV` |
| D1 代码绑定名 | `F_UI_DB` |
| Worker 环境变量 | `WORKER_NAME = "f-ui"` |

Cloudflare 资源名称和绑定名不是一回事：资源名称用于 Cloudflare 控制台中识别资源，绑定名用于 Worker 代码访问资源。

## 本地开发

本地开发仅用于源码阅读、构建验证和受控实验。进入项目根目录后执行：

```cmd
scripts\build.cmd
scripts\dev.cmd
```

手动运行也可以：

```cmd
cd f-vue
npm install
npm run build

cd ..\f-worker
npm install
npm run dev
```

本地访问：

```text
http://127.0.0.1:8787/login
http://127.0.0.1:8787/health
```

## Cloudflare 受控实验部署

只阅读源码或本地学习时，不需要部署到 Cloudflare。若你在自己的受控实验环境中部署，请先确认用途符合所在地法律法规、监管要求、Cloudflare 当前条款、数据保护要求和第三方权利要求。

实验部署应至少满足以下边界：

- 不向公众开放注册、登录、订阅、节点配置或任何访问能力。
- 不发布、销售、出租、转售、推广或导流任何基于本项目的服务。
- 不处理无合法依据、无必要性或未经授权的个人信息、日志、账号数据、网络数据或第三方数据。
- 不将 Cloudflare、Telegram 或其他第三方平台用于违反其服务条款、可接受使用政策、配额限制或风控规则的用途。
- 不使用本项目绕过、规避或破坏法律法规、监管要求、平台规则、网络访问控制或安全机制。

首次配置：

```cmd
scripts\setup-cloudflare.cmd
```

脚本会引导填写 Cloudflare 账号、域名、管理员邮箱、D1、KV 和 Secret 等配置。仓库只提交 `f-worker/wrangler.toml.example`，真实的 `f-worker/wrangler.toml` 会在本地生成并被 Git 忽略。

脚本规则：

- Worker 名称默认 `f-ui`
- D1 数据库默认 `f-ui-db`
- KV 命名空间默认 `f-ui-kv`
- 有默认值的输入项直接回车使用默认值
- 多选项使用数字选择，例如 `1/2/3`
- 域名和管理员邮箱必须在运行脚本时录入
- `jwt_secret` 和 `turnstile_secret` 通过 Wrangler Secret 输入，不写入普通配置文件

受控实验环境中的后续更新：

```cmd
scripts\deploy.cmd
```

实验环境更新完成后，仅在你控制的非公开访问范围内验证：

```text
https://你的域名/login
https://你的域名/health
```

## 受控实验账号初始化

1. 打开 `https://你的域名/register`
2. 使用部署脚本中填写的管理员邮箱注册首个账号
3. 首个账号会成为 Super Admin
4. 登录管理台后生成仅用于封闭实验对象的邀请码
5. 授权实验账号可在控制台查看自己的实验配置或订阅格式输出

必须保持邀请注册，不开放公开注册；只在合法、授权、非公开、可控的实验环境中使用。不得将账号、邀请码、订阅地址、配置文件或访问凭据公开传播、销售、出租、转售、导流或用于任何违法违规目的。

## 常用命令

```cmd
scripts\build.cmd
scripts\dev.cmd
scripts\deploy.cmd
scripts\check-sec12.cmd
```

## 许可证

本项目使用 [Apache License 2.0](LICENSE)。
