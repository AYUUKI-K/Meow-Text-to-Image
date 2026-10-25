# 喵喵文生图：云端按 Key 排队

这是一个轻量的排号服务。它不生成图片，不接收 NAI Key、提示词或图片，只接收 Key 的 SHA-256 指纹以及随机的排队标识。

所有用户只填同一个队列服务根地址。A/B 使用同一个 Key 时指纹相同，会排入同一队列；C 使用另一个 Key 时自动进入独立队列，无需额外配置。

## 插件使用

1. 在「生成」页保存一次自己的 NAI Key。Key 仍由酒馆密钥管理保存；插件只额外记录它的指纹。
2. 使用已默认填入的队列服务地址 `https://miao-image-queue.savlu329.workers.dev`，点击「检查队列连接」。也可改为自己的服务地址。
3. 打开「启用云端排队」。

轮到自己时，插件通过酒馆原有 NAI 接口生成，生成结束再释放排号。无需给每个 Key 单独填服务地址，也不需要安装酒馆服务端插件。

如果在别的插件中切换或删除了酒馆 NAI Key，需要在本插件重新保存一次，重新关联当前 Key 的指纹。

排队任务记录入队时的 Key 指纹；等待期间更换 Key 后，旧任务不会改用新 Key 生图或编码，需要重新操作。开关默认关闭，未开启时只有当前页面的本地串行处理，不能协调其他人的请求。

## Cloudflare Workers 部署

仓库提供 `wrangler.jsonc` 和 `cloudflare/worker.js`。创建独立 Worker `miao-image-queue`，连接本仓库，部署命令使用 `npx wrangler deploy`。配置只声明自己的 `MIAO_KEY_QUEUE` SQLite Durable Object 绑定，不声明任何其他项目的资源或路由。

也可在仓库根目录用 Wrangler 登录后部署：

```sh
npx wrangler deploy --config wrangler.jsonc
```

Cloudflare 版每个 Key 使用一个独立的 Durable Object，并持久保存排队状态；过期状态由 alarm 清理。它消耗当前 Cloudflare 账号的 Workers/Durable Objects 额度，免费或付费限额取决于账号套餐，具体额度见 [Cloudflare 官方定价](https://developers.cloudflare.com/durable-objects/platform/pricing/)。

## 用户数量与连接排查

队列按 Key 分片，支持多把 Key 同时使用；单把 Key 一次只放行一个任务，最多保留 64 个等待任务。同一 Key 的排队人数多时，等待是预期行为，不代表所有用户都被挤到一个总队列。不同 Key 如果属于同一个 NAI 账号，仍会受到 NAI 自己的账号限制。

服务没有固定的「最多多少位用户」保证。仓库覆盖了 160 个模拟任务、20 把 Key 的隔离与交接测试，不代表已经完成线上容量压测。需要根据同时排队人数、等待时间和 Cloudflare 实际用量评估。

按 2026-10-26 核对的官方额度，Workers Free 和 Durable Objects Free 的请求额度分别为每天 100,000 次；SQLite 写入和运行时长也有额度，账号中其他服务可能共同消耗额度。1.3.7 起，等待第 1 位仍每 5 秒查询，之后按位置增加到最多 15 秒；生成中的心跳每 60 秒一次。靠后任务的查询次数最多减少约三分之二，代价是查询间隔内的交接通知稍晚。旧客户端仍每 5 秒查询。不能将免费版当作无限容量；持续大量使用时应查看后台用量并按需要调整套餐。[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)、[Durable Objects 定价](https://developers.cloudflare.com/durable-objects/platform/pricing/)。

Cloudflare 队列 0.5.0 将重复续期合并到每任务至少间隔 30 秒才更新持久时间戳，状态未变的查询不写数据库。清理 alarm 已早于新期限时保留原 alarm，触发后再检查，不在每次轮询中改写。入队、交接、释放和需要续期的变更通过事务立即保存，不采用延迟落盘；保存失败返回 503，下次请求先重新读取持久状态。原 `lanes` 数据和锁凭据直接兼容，保留同 Key 的 FIFO 顺序。

复现测试在 3 分钟内模拟旧客户端 36 次等待查询和 12 次心跳，数据库状态与 alarm 写操作从 96 次降为 13 次（不含最初入队）；这不等于所有场景都节省相同比例，也不增加平台官方额度。短时间、无等待的生成仍需要正常入队和释放。

前端更新与 Worker 更新分开生效：普通用户只更新插件即可减少查询及心跳；存储写入优化由维护者部署 `cloudflare/worker.js` 0.5.0 后生效。沿用原 Worker 名称、Durable Object 绑定和迁移配置，不另建数据库，不要求用户安装后端。

普通酒馆的 NAI 生图请求经过酒馆服务器，云端排队由浏览器直接联网；服务器能访问 NAI 不代表当前浏览器能访问队列域名。在发生错误的同一浏览器打开 `队列地址/ping`，正常应看到包含 `ready: true` 的 JSON。打不开时先排查该设备的网络、代理和队列地址；只有个别用户报告时不能直接判断服务容量已满。

1.3.6 起，排队 POST 仍发送 JSON 字节，但使用无需跨域预检的媒体类型；无需更新队列服务即可兼容现有 Cloudflare 和 Node 版。连接失败会按原任务身份有限重试，连接及响应体均有超时。未取得生成权限时不调用 NAI，也不自动绕开队列。

## 备选服务部署：Render

仓库提供 `render.yaml`，也可手动新建一个 Web Service：

- 代码仓库：本仓库
- Runtime：Node
- Build Command：`node --check queue-service/service.mjs`
- Start Command：`node queue-service/service.mjs`
- Instance Type：**Free**
- Health Check Path：`/ping`

Render 免费实例闲置后会休眠，下次访问可能需要约一分钟唤醒。免费额度和休眠政策以 [Render 官方说明](https://render.com/docs/free) 为准。此服务不需要 GPU、数据库、NAI Key 或付费实例。

如果有现成能运行 Docker 的平台，也可使用 `Dockerfile.queue`；设置平台端口指向环境变量 `PORT`（默认 7860）。

本地检查：

```sh
node queue-service/service.mjs
```

根路径返回服务说明，`/ping` 用于连通性检查。`POST /join-queue` 入队，`POST /my-turn` 查询和续期，`POST /complete` 释放，`POST /leave-queue` 退出。

## 队列边界

- 同一把 Key 的所有使用者必须使用**同一个队列服务**。绕过队列直接在官网或别处生成时，服务无法协调那次请求，NAI 仍可能返回占用或限流错误。
- 隔离单位是 API Key，不是 NAI 账号。不同 Key 如果属于同一个账号，NAI 的账号级并发、额度或限流仍可能共同生效；网络或平台公共资源也不属于排队锁可以保证的范围。
- Node/Render 版为内存队列，只部署**一个实例**。重启会清空排队；Cloudflare 版由 Durable Object 持久协调。两者都不会自动重放可能已扣费的请求。
- 等待中的任务持续轮询；Cloudflare 0.5.0 为合并续期提供宽限，最后一次查询后约 90～120 秒失活，旧 Cloudflare／Node 版约 90 秒。alarm 可能有平台调度延迟，下一次队列请求也会清理过期任务。持有权限的租约仍为 4 分钟，续期最长延长至开始后的 10 分钟；关闭页面不会永久卡住其他人。
- 普通生成错误会释放排号。「遇到占线自动排队」默认开启：生图接口明确返回可识别的占线、限流或服务不可用错误（如 409、423、429、500、502、503）后等待 15、30、60 秒，最多重试 3 次，每次重新入队；服务要求更长等待时也会在上限内遵守。Key 异常、额度不足等明确错误不重试。500 可能已扣费，重试不能保证不会重复扣费。它不能锁住官网或其他插件的请求。
- 网络超时或断网不会自动重复调用 NAI，此时等待租约自然到期，降低撞车风险。
- 服务不在日志或公共接口输出 Key 指纹列表，也不显示其他用户的 Key。任意 HTTP 请求若携带 `key` 字段会被拒绝。

`npm test` 包括 A/B 同 Key、C 不同 Key 的并发测试，以及租约过期、重复入队、错误释放等测试，均不使用真实 NAI Key。

本地安装 Miniflare 后，可额外运行 `node tests/cloudflare-runtime.mjs` 检查真实 workerd／SQLite 的事务、交接和清理。也可把环境变量 `MIAO_MINIFLARE` 指向已有 Miniflare 的 JavaScript 入口；不连接线上队列、不调用 NAI。
