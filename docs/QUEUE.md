# Mewo 云端队列自部署指南

云端队列用于协调使用同一把 API Key 的 Mewo 生图任务，让它们依次获得发送许可。它只负责排队，**不生成图片，也不转发生图请求**。

如果只是使用别人已经部署好的队列，可以直接跳到[在插件中填写地址](#在插件中填写地址)。需要自己部署时，按下面的 Cloudflare Workers 步骤操作。

## 部署前准备

你需要一个 Cloudflare 账号，以及安装了 Git 和 Node.js 的电脑。Node.js 请使用 [Wrangler 当前支持的版本](https://developers.cloudflare.com/workers/wrangler/install-and-update/#supported-nodejs-versions)。

仓库已包含完整的 Worker 与 SQLite Durable Object 配置，不需要另外购买服务器、创建 D1 数据库或填写 NovelAI Key。Durable Object 会保存队列状态，由部署命令按仓库配置创建和绑定。[Cloudflare 官方入门说明](https://developers.cloudflare.com/durable-objects/get-started/)

队列会消耗你账号的 Workers 和 Durable Objects 用量。是否收费、可用额度及超额处理以账号套餐为准，部署后请关注 Cloudflare 后台用量：[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)、[Durable Objects 定价](https://developers.cloudflare.com/durable-objects/platform/pricing/)。

## Cloudflare Workers 部署

### 1. 下载仓库

打开终端，执行：

```sh
git clone --branch test --single-branch https://github.com/AYUUKI-K/Mewo-Text-to-Image.git
cd Mewo-Text-to-Image
```

本指南使用 `test` 分支。后续更新插件与队列时，请使用相互兼容的版本。

### 2. 检查配置

打开仓库根目录的 [wrangler.jsonc](../wrangler.jsonc)。首次独立部署通常可直接使用现有配置：

| 配置 | 仓库中的值 | 用途 |
| --- | --- | --- |
| `name` | `miao-image-queue` | 你账号内的 Worker 名称 |
| `main` | `cloudflare/worker.js` | 服务入口 |
| Durable Object 绑定名 | `MIAO_KEY_QUEUE` | Worker 访问队列状态 |
| Durable Object 类名 | `MiaoKeyQueue` | 队列实现 |
| 首次迁移 | `v1` / `new_sqlite_classes` | 创建 SQLite Durable Object |

如果账号里已有同名 Worker，首次部署前可更改 `name`，避免覆盖其他服务。其余绑定名、类名、迁移配置和兼容性配置按仓库原样保留。

**升级已有队列时，不要为了重新部署而改名、删除 Durable Object 或清空迁移配置。** 请继续使用原 Worker、原账号和原有绑定，以保留正在排队的任务。

### 3. 登录并部署

在仓库根目录执行：

```sh
npx wrangler login
npx wrangler deploy --config wrangler.jsonc
```

首次运行时，`npx` 可能询问是否安装 Wrangler；按提示完成登录和部署。部署命令见 [Wrangler 官方说明](https://developers.cloudflare.com/workers/wrangler/commands/)。

部署成功后，终端会输出类似地址：

```text
https://miao-image-queue.<你的子域名>.workers.dev
```

记下这个 **HTTPS 根地址**，后面要填入 Mewo。这里是你自己账号下的地址，不是仓库作者的公共服务地址。

如果使用 Cloudflare 的 Git 仓库集成，请连接你有权限使用的仓库副本，选择对应分支，将项目根目录设为仓库根目录，部署命令填写 `npx wrangler deploy --config wrangler.jsonc`。不要只复制 `worker.js` 到网页编辑器；它还依赖仓库里的队列与协议模块。

### 4. 验证部署

在浏览器打开刚才地址的 `/ping`，例如：

```text
https://miao-image-queue.<你的子域名>.workers.dev/ping
```

当前仓库的 Cloudflare 服务正常时应返回类似内容：

```json
{
  "ready": true,
  "version": "0.7.0",
  "capabilities": [
    "two-phase-generation-v1",
    "bounded-uncertain-v1",
    "shared-nai-cooldown-v1",
    "in-place-retry-v1"
  ],
  "runtime": "cloudflare",
  "relay": 1
}
```

确认 `ready` 为 `true`，没有 `maintenance: true`，并包含上面的四项 `capabilities`。版本号未来可能变化，**不能只看版本号判断是否兼容**。如果只出现欢迎页、HTML、登录页或旧版响应，请先检查部署的代码与地址。

打开 `/ping` 或检查队列连接不会调用生图接口，也不会消耗生图额度；它只能验证队列服务，不能证明 NovelAI 或自定义生图接口可用。

## 在插件中填写地址

1. 打开 Mewo 的「生成」页，先配置并保存当前使用的官方 NovelAI 或自定义连接凭证。
2. 在「共享 Key 排队」中，将「队列服务地址」改为你部署得到的 **HTTPS 根地址**。不要追加 `/ping`、`/relay` 或生图路径，也不要填写带查询参数的地址。
3. 点击该区域的「测试连接」，确认显示「连接正常」。
4. 确认「启用云端排队」已勾选，并保存设置。新安装默认开启，已有用户保留原选择。

请区分两种地址：

| 设置 | 应填写的内容 |
| --- | --- |
| 队列服务地址 | 本指南部署的队列根地址 |
| 自定义连接的生图完整 URL | 第三方站点提供的生图端点，与队列地址无关 |

同一把 Key 的使用者应填写**同一个队列地址**。不同队列服务之间不会共享排队状态；同一个服务可以处理多把 Key，无需为每把 Key 单独部署。

更换 Key 后，请在 Mewo 中重新保存凭证。已经排队的任务固定使用提交时的连接信息；切换连接或修改地址、凭证后，旧任务可能取消，需要重新提交。

「实际测试生图」会调用生图接口，可能消耗额度；它与队列区域的「测试连接」是两个不同操作。

## 排队与重试设置

云端排队和自动重试是两个独立开关。新安装默认开启云端排队、关闭自动重试，不会因为开启排队而自动开启重试。

- 多张图片仍在本地依次处理。无论是否开启云端排队，每次实际发送生图请求前都会随机等待 **2～4 秒**，包括自动重试。
- 开启「遇到占线自动重试」后，只有符合条件的明确拒绝（HTTP 409、423、429）才会等待至少 **10 秒**后重试，最多额外 3 次。服务要求更久时遵守其等待时间；超过 120 秒则停止。
- 单张生图默认等待 **60 秒**。超时、断网和未知的服务错误不会自动重新生图；服务端可能已经开始处理或计费。此时队列会保留有限时间的保护，之后自动放行，不需要手动删除队列状态。

队列不能协调官网、其他插件或未使用同一队列的请求；不同 Key 即使属于同一账号，也仍可能受到站点的账号级限制。它不代替第三方站点的额度、参数或调用频率要求。

## 更新已有服务

使用首次部署时的仓库副本和 Cloudflare 账号，更新代码后，再执行同一条部署命令：

```sh
git pull --ff-only
npx wrangler deploy --config wrangler.jsonc
```

如果你修改过配置，请先核对并保留自己的 Worker 名称与绑定；若 Git 提示冲突，先处理冲突，不要直接覆盖配置。更新后重新检查 `/ping`。当新版插件要求新的队列能力时，应先更新队列服务，再更新插件。

普通更新不需要清空状态。若需要回退到不兼容的旧服务版本，应先在部署配置中设置 `QUEUE_MAINTENANCE=true` 并部署，暂停新任务，等在途任务与保护状态全部结束后再回退。`/ping` 不提供全量排空状态，等待几秒或看到 `ready: true` 都不能证明已经排空；不确定时请联系维护者，不要删除状态或重建服务强行放行。维护结束后移除该变量或设为 `false`，重新部署。

## 常见问题

| 现象 | 检查方法 |
| --- | --- |
| 部署时报找不到文件或模块 | 确认下载了完整仓库，并在包含 `wrangler.jsonc` 的根目录执行命令。 |
| Durable Object 创建或绑定失败 | 检查账号权限与平台错误信息；核对绑定名、类名和迁移配置是否仍与仓库一致。 |
| `/ping` 返回 HTML、404 或登录页 | 检查是否用了正确的已部署根地址，是否被代理或访问认证页面拦截。 |
| 提示队列服务不兼容、需要更新 Worker | 更新服务端代码，确认 `/ping` 包含四项所需能力；只改版本号没有作用。 |
| 提示队列维护中 | 检查 `QUEUE_MAINTENANCE`；维护完成后关闭该变量并重新部署。 |
| 浏览器能打开 `/ping`，插件仍连接失败 | 在实际使用插件的设备上检查网络、代理和 HTTPS 证书；普通 ST 可能通过电脑酒馆转接队列请求，TT 需要设备能直接连接队列。不要把网页可打开等同于插件请求已成功。 |
| 队列连接正常，生图仍失败 | 队列和生图接口是独立连接。检查生图端点、凭证、站点权限、额度和返回错误；队列不会修复 CORS 或 iOS 对 HTTP 的限制。 |
| 任务超时后，下一位没有马上开始 | 上一张的结果可能仍不确定，队列会保留短暂保护；等待界面刷新，不要反复重发生图。 |
| 同一 Key 仍出现占线 | 检查大家是否使用同一个队列，是否有人在官网、其他插件或不同队列生成。 |
| 队列返回 429／503 | 这可能是队列容量、维护、平台额度或存储故障，不等于生图接口返回同样的错误。查看 Cloudflare 用量及 Worker 日志。 |

不要给队列 URL 前面加网页登录、验证码或交互式访问验证；插件需要直接获得 JSON 响应。公开部署会消耗你的平台用量，请根据实际使用人数关注后台指标，不要将免费额度理解为无限容量。

## 备选：Node、Render 或 Docker

Cloudflare 版持久保存队列状态。下面的 Node 版本是**内存队列**：只运行一个实例，不要开启多副本或多进程负载均衡；重启会丢失当前排队状态，因此不适合依赖持久排队的多人服务。它也不提供 Cloudflare 版的电脑酒馆转接能力。

### 本地运行 Node 服务

仓库的 Docker 和 Render 配置使用 Node.js 22。在仓库根目录执行：

```sh
node queue-service/service.mjs
```

默认监听 `0.0.0.0:7860`，本机可访问 `http://127.0.0.1:7860/ping` 检查。需要时通过环境变量 `HOST` 和 `PORT` 调整监听地址与端口。

这个回环地址只适用于同一设备本地调试。给手机或其他用户使用时，需要为服务配置可访问的 **HTTPS 根地址**，再填入插件；手机的 `127.0.0.1` 指向手机自身。Node 版的 `/ping` 不含 `runtime` 和 `relay` 字段，但应包含 `ready: true` 和相同的四项能力。

### Render

仓库提供 [render.yaml](../render.yaml)，也可按以下配置创建 Web Service：

| 项目 | 值 |
| --- | --- |
| 代码仓库／分支 | 你的仓库副本／`test` |
| Runtime | Node |
| Node 版本 | 22 |
| Build Command | `node --check queue-service/service.mjs` |
| Start Command | `node queue-service/service.mjs` |
| Health Check Path | `/ping` |

仓库配置使用免费实例。平台可用套餐与休眠规则以 [Render 官方说明](https://render.com/docs/free) 为准；如果实例休眠，唤醒期间可能无法及时取得排队许可。部署后使用平台提供的 HTTPS 根地址，并按前文验证 `/ping`。

### Docker

在仓库根目录执行：

```sh
docker build -f Dockerfile.queue -t mewo-queue .
docker run -d --name mewo-queue -p 7860:7860 mewo-queue
```

本机检查地址仍为 `http://127.0.0.1:7860/ping`。对外使用时，由部署平台或反向代理提供 HTTPS，并转发到容器的 7860 端口。不要启动多个互不共享状态的队列容器来承接同一个服务地址。

## 数据与隐私

队列接收当前连接凭证的 SHA-256 指纹、随机任务标识以及排队所需的状态信息，不接收原始 Key、鉴权头、提示词、图片或 Vibe 编码。请勿把真实 Key 填进 Cloudflare 环境变量、队列 URL 或部署命令。

普通 ST 在设备直连队列失败时，可能使用酒馆原有接口转接队列操作；转接仍不包含原始 Key 或生图内容。不过酒馆、代理或平台的访问日志可能记录队列指纹和随机任务标识，分享日志前请检查内容。
