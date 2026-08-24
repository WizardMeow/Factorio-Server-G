# Factorio Server G

一个面向 Tailscale 私网的 Factorio / PyMod 服务器控制台。项目由两个 Compose 服务组成：`webui` 持续运行并通过 Docker Compose 控制 `factorio`。

## 本地开发

```bash
npm install
npm run dev
```

前端位于 `http://localhost:3000`，API 默认监听 `3001`。本地开发需要 Docker 与 Docker Compose。

## Compose 运行

```bash
cp .env.example .env
mkdir -p runtime/factorio/saves runtime/imports runtime/backups runtime/webui
docker compose up -d webui
```

启动前把 `.env` 的 `HOST_PROJECT_ROOT` 改成仓库在 Docker 宿主机上的绝对路径。这让 WebUI 容器内发起的 Compose 操作仍能建立正确的宿主机 bind mount。

如果宿主机设置了 `http_proxy`、`https_proxy` 和 `no_proxy`，Compose 会把它们传给镜像构建和 WebUI 的 Mod Portal HTTP 客户端；无需把代理地址写进仓库。

打开 `http://<tailscale-ip>:3000`。Factorio 不会在 WebUI 启动时自动启动；在导入 `save.zip` 后从控制台启动。

所有存档、下载内容和操作状态都位于被 Git 忽略的 `runtime/`。发布配置位于 `config/`。

## 当前能力

- 启动、优雅停止和重启 Factorio，所有变更操作共享一把锁
- 拉取并重建指定的 `latest`、`stable` 或精确版本镜像
- 首屏 500 行 Docker 日志与 SSE 实时跟随
- 导入、备份、下载和恢复固定主存档 `save.zip`
- 只读显示 `server-settings.json` 的非敏感字段
- 操作流水持久化，重启后标记未完成操作为 interrupted
- 输入官方 Mod Portal URL 或模组名并递归解析 required dependencies
- 显式展示 optional/hidden optional dependencies，完整图冲突检测与版本回溯
- 凭据下载、SHA1 校验、generation 原子切换及显式回滚入口
- Mod Portal 与 REST 外部类型均由 Zod schema 推导和运行时校验

声明根模组保存在 `config/mods.json`，精确解析结果保存在 `config/mods.lock.json`。下载凭据只从 `.env` 读取，不写入配置、日志或操作流水。

## 日志追踪

WebUI 服务输出结构化日志，核心字段包括 Fastify `reqId`、`operationId`、`planId`、`generationId`、`kind`、`stage`、`modName` 与 Compose 退出码。Mod Portal 认证参数不会进入日志；错误在写入操作流水及 SSE 前统一脱敏。
