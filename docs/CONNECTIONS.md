# 连接设置与错误排查

在「生成 → 连接 NovelAI → 连接方式」中选择「自定义 NovelAI 兼容接口」，填写基础 API 地址或完整生图端点和完整 API Key，点击「保存自定义连接」。默认的自动模式会在地址路径后补全 `/ai/generate-image`；已包含该路径时不会重复追加。选择「原样使用」可将完整地址原样发送，适合特殊路由。地址处理规则仅用于本地构造请求，不代表第三方站点接口已实际验证。

| 输入示例 | 自动模式的生图 URL | 推导的 Vibe URL |
| --- | --- | --- |
| `https://nai.pkppkq.bond/` | `https://nai.pkppkq.bond/ai/generate-image` | `https://nai.pkppkq.bond/ai/encode-vibe`（仅路径推导，未验证站点支持） |
| `http://chami.yyqzx.com/image/chami` | `http://chami.yyqzx.com/image/chami/ai/generate-image` | `http://chami.yyqzx.com/image/chami/ai/encode-vibe`（仅路径推导，未验证站点支持） |

如果站点要求将 `http://chami.yyqzx.com/image/chami` 本身作为完整生图端点，请选择「原样使用」；Meow 会保留该生图地址，Vibe 推导路径仍只是预测。

仅支持接受 NovelAI 原生请求体、返回 PNG 或 ZIP 的 HTTP/HTTPS 接口；不探测或切换备用端点，也不支持任务 ID 轮询或 OpenAI 图片协议。模型是否支持以站点文档为准。

自定义 Key 使用独立的本地凭证槽，默认只在当前页面暂存；选择「记住 Key」后保存到当前设备。它不会覆盖官方 Key，也不会写入酒馆官方 NovelAI 密钥槽、普通扩展设置、聊天、图片元数据、Vibe 文件或导出配置。旧设置默认使用官方连接。切换连接或保存地址、凭证变更后，尚未发送的旧任务需要重新提交。

Vibe 生图与普通生成使用同一个自定义生图 URL。在线编码可选择跟随生图地址推导、手动覆盖或禁用。手动地址支持完整 HTTP(S) URL、以 `/` 开头的站点根路径，或追加到生图 API Base 的相对路径。完整端点模式下，API Base 是去除末尾 `/ai/generate-image` 后的路径；特殊路径则作为 API Base。自动推导仅是路径预测，站点可能不提供 `/ai/encode-vibe`。生图地址带查询参数时，Meow 不会把这些参数复制到编码 URL，并会暂停自动编码；请改用手动地址。禁用在线编码后，仍可导入和使用已有匹配编码的 Vibe。

手动 Vibe URL 若指向另一站点，保存前会明确要求确认；确认后同一个自定义 Key 会发往该编码站点。旧设置中的生图 URL 会继续原样使用，已有编码 URL 继续作为手动地址，旧的空编码地址继续禁用在线编码。

模型、Vibe、额度及调用频率以站点说明为准。使用公益站时，建议关闭自动生图和自动重试，少量提交任务，并按站方要求控制节奏。插件继续使用原有发送等待、本地任务队列、可选云端队列和重试条件，不会为站点自动降低参数或减少 Vibe。保存配置只做本地校验；「实际测试生图」会调用接口，可能消耗额度。

自定义连接由浏览器直接访问，需要站点允许跨域（CORS）；HTTPS 酒馆页面访问 HTTP 接口还可能受到混合内容限制。第三方站点的支持范围、个人权限和额度以站点说明为准。

## TT iOS 的 HTTP 限制与错误诊断

TT 2.4.0 的 TestFlight 构建恢复了 iOS 传输安全限制，WebView 不能像标准 IPA 构建一样放行明文 HTTP。Meow 自定义接口走外站 `fetch`，不进入 TT 同源原生路由；因此同站点、同 Key 在 ST 成功，不代表在此环境也可访问。请向站方取得有效的 HTTPS 完整端点，手动配置；Meow 不会自动把 HTTP 改成 HTTPS 或失败后重发。源码依据：[TT 2.4.0 构建流程](https://github.com/Darkatse/TauriTavern/blob/v2.4.0/.github/workflows/stable-release.yml#L443)。浏览器不能读取响应时，仍无法单独排除 CORS、DNS、TLS 或网络问题。

自定义接口报错会显示本地诊断码；诊断码不是 HTTP 状态码，没有可读响应时不会虚构 403、502 等站点错误：

| 诊断码 | 含义 |
| --- | --- |
| `MEWO_CUSTOM_IOS_HTTP_NO_RESPONSE` | iOS TT 访问 HTTP 未取得可读响应，检查 TestFlight 传输限制及 CORS/网络 |
| `MEWO_CUSTOM_NETWORK_NO_RESPONSE` | 其他环境的连接失败，未取得可读 HTTP 响应 |
| `MEWO_CUSTOM_HTTP_<状态码>` | 站点确实返回了该 HTTP 错误 |
| `MEWO_CUSTOM_RESPONSE_BODY` | 收到了 HTTP 响应，但正文读取失败 |
| `MEWO_CUSTOM_IMAGE_FORMAT` | 完整响应已收到，图片解析失败，不会重新生图 |
| `MEWO_NAI_LOCAL_TIMEOUT` | 本地等待超时，服务端结果仍可能未知 |
| `MEWO_CUSTOM_ABORTED` / `MEWO_CUSTOM_PRE_SEND` | 请求中断 / 发送前任务失效 |

在 TT 设置中启用前端控制台日志捕获后，可在前端日志搜索 `[Meow NAI]`。记录仅包含诊断码、阶段、HTTP 状态（无响应时为 null）、错误类型、宿主/平台和端点协议，不含完整 URL、Key、请求头、提示词、图片、Vibe 编码、原始异常或堆栈。这些错误记录位于前端日志，不会作为聊天模型请求出现在 LLM API 日志中。是否开启日志捕获由你在 TT 设置中选择。


[返回项目首页](../README.md) · [Vibe 使用说明](VIBE.md) · [云端队列与自部署](QUEUE.md)
