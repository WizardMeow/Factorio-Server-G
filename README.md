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

启动前把 `.env` 的 `HOST_PROJECT_ROOT` 改成仓库在 Docker 宿主机上的绝对路径，并把 `FACTORIO_ADDRESS` 设置为该服务器的 Tailscale IP 或 MagicDNS 名称。这让 WebUI 容器内发起的 Compose 操作仍能建立正确的宿主机 bind mount，同时避免把浏览器访问地址误当成 Factorio 联机地址。未配置时 WebUI 会明确提示，不会生成 JOIN 按钮。

如果服务器需要代理访问 Docker Hub 或 Mod Portal，在 `.env` 中显式配置 `OUTBOUND_HTTP_PROXY`、`OUTBOUND_HTTPS_PROXY` 和 `OUTBOUND_NO_PROXY`。宿主机 shell 的代理不会被默认透传。

打开 `http://<tailscale-ip>:3000`。Factorio 不会在 WebUI 启动时自动启动；没有现有 autosave 时，应先通过 WebUI 导入存档并将其选为下次启动存档。

所有存档、下载内容和操作状态都位于被 Git 忽略的 `runtime/`。发布配置位于 `config/`。

## 当前能力

- 启动、优雅停止和重启 Factorio，所有变更操作共享一把锁
- `latest`、`stable` 仅作为在线版本定位标签，配置与镜像锁始终记录精确的 `x.y.z`
- 配置变更只写入待启动状态；点击启动/重启时才拉取精确版本镜像、下载并校验 Mod，然后重建容器
- 游戏日志与 Docker Compose 操作分窗展示；游戏输出和 WebUI 发起的命令、stdout、stderr、退出结果分别通过 SSE 实时跟随
- 独立运行观察页展示容器状态、实际镜像、健康状态、当前 Profile、已安装 Mod 数量和下次启动存档
- Profile 隔离游戏版本、Mod、存档和下次启动选择
- 独立存档管理页把 autosave、导入和备份统一作为“下次启动存档”候选；任意存档可单独备份，导入和备份可删除
- 一键导入会读取存档 `level-init.dat` 中的精确游戏版本和 Mod 版本，生成待启动配置并自动选中该导入存档
- 存档、导入和备份按修改时间倒序展示，并显示完整修改时间与文件大小
- 只读显示 `server-settings.json` 的非敏感字段
- 操作流水持久化，重启后标记未完成操作为 interrupted
- 渲染已声明根模组与托管依赖；新增、指定版本更新、启用、禁用和删除均先解析完整依赖图，再确认原子应用
- 显式展示 optional/hidden optional dependencies，完整图冲突检测与版本回溯
- 凭据下载、SHA1 校验、generation 原子切换及显式回滚入口
- Mod Portal 与 REST 外部类型均由 Zod schema 推导和运行时校验
- Profile 配置、启动选择、操作流水和 Docker Compose inspect 输出等外部持久化数据也通过 Zod 校验

默认 Profile 位于 `config/profiles/default/`；声明根模组保存在其中的 `mods.json`，精确解析结果保存在 `mods.lock.json`。下载凭据只从 `.env` 读取，不写入配置、日志或操作流水。`level-init.dat` 是存档创建阶段写入的元数据，可能落后于该存档最后一次实际使用的 Mod 状态，因此导入结果会在 UI 中明确提示这一限制。

新运行目录会从 `config/server-settings.json` 初始化为非公开、非 LAN 广播模式，供 Tailscale 地址直连且不要求 Factorio Token。已有 `runtime/factorio/config/server-settings.json` 不会被覆盖。

## 日志追踪

WebUI 服务输出结构化日志，核心字段包括 Fastify `reqId`、`operationId`、`planId`、`generationId`、`kind`、`stage`、`modName` 与 Compose 退出码。Mod Portal 认证参数不会进入日志；错误在写入操作流水及 SSE 前统一脱敏。
