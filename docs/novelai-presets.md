# NovelAI 官网预设核对（2026-10-27）

配置页的「质量 Tags」和「UC 负面预设」独立保存到每套配置，并随 NAI 串导入／导出。新配置和缺少预设字段的旧配置默认 Standard／Heavy；已经明确保存的选项（包括 None）继续保留。切换模型时，不支持的选项退回 None。

## 插入位置

- 正面先按原有顺序拼接「前置正面 → 本次场景 → 后置正面」，再把质量预设追加到末尾。按用户要求，所有官网预设词串最后补上逗号和空格 `, `；有自定义负面时复用这一分隔符，不重复加逗号。
- UC 预设加到自定义负面开头。与官网 `solveUc` 一致，非 Curated 模型选用 UC 预设且正面不含 `nsfw`（大小写不敏感）时，负面最前额外加入 `nsfw`。
- V4／V4.5／V5 质量预设只作用于基础提示词（`|` 前，保留 `||...||` 块），并放在 `text:` 内容之前；UC 也仅加在基础负面前。V3 的提示词混合为每段添加质量预设，保留末尾混合权重。
- **None 不加任何标签**。官网 V3 的 None 在负面完全为空时仍有 `lowres` 的历史回退；这里遵循插件选项语义，不采用该回退。

## 当前官网代码与文档的差异

数据来自官网公开客户端的 `qualityPresetsForModel` / `getModelUcPreset`，覆盖插件已有的八种模型，保留大小括号与数值权重：

- V5 Full／Curated：Standard、Light、None；其他已支持模型：Standard、None。
- V4.5 Full、V5：UC 支持 Heavy、Light、Furry Focus、Human Focus、None。
- V4.5 Curated、V3 Anime：UC 支持 Heavy、Light、Human Focus、None。
- V4、V3 Furry：UC 支持 Heavy、Light、None。
- 当前客户端 V4.5 Full 的 Standard 是 `very aesthetic, masterpiece, no text`，不含文档仍列出的 `location`，与用户截图一致。
- 当前客户端 V4.5 Curated 的 Standard 是 `very aesthetic, masterpiece, no text, -0.8::feet::, rating:general`；V4 Curated 使用 `rating:general, best quality, very aesthetic, absurdres`。
- 当前客户端 V4 的 UC 末尾还包含 `white blank page, blank page`，官网文档未完整列出。

## 去重

官网 `resolvePromptAndUc` 调用 `addQualityToPrompt` 与 `solveUc`。`applyPreset` 直接连接前／后缀，`solveUc` 直接在负面前连接预设，**没有按 tag 去重**。因此插件保留所有重复词与权重，不引入全局去重。输入框保留用户原文，最终请求记录添加后的实际提示词。配置页只显示选择器，不在下方显示说明文字；图库刷新也不显示进度或完成说明，失败仍通过原有错误提示报告。

插件在构造请求时处理一次；SillyTavern 转发端和插件 NAI 直连端均使用 `qualityToggle: false`，防止请求端再次添加质量预设。该实现为纯前端模块，不依赖 Node 后端插件或桌面 API。

## 核对来源

- [官网质量标签文档](https://docs.novelai.net/en/image/qualitytags/)
- [官网 UC 文档](https://docs.novelai.net/en/image/undesiredcontent/)
- [官网图像客户端](https://novelai.net/image)，部署 `ddf7a39-40369342490-1`，数据及处理代码位于 `/_next/static/chunks/1e943u861145k.js`；调用位置位于 `42wv5qb9evl5c.js`。部署文件名会变化。
- [SillyTavern 转发接口](https://github.com/SillyTavern/SillyTavern/blob/release/src/endpoints/novelai.js)
- [TauriTavern 扩展指南](https://github.com/Darkatse/TauriTavern/blob/main/ExtensionDEV.md)

验证覆盖模型差异、插入顺序、None 与旧配置、重复／加权词保留、字符和文本边界、直连请求一致性、导入导出和例图签名。浏览器预览使用模拟响应，不调用真实 NAI；实体 iOS 客户端仍需设备验收。
