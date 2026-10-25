# 实体图片归档

「图片 → 存储」保留原来的存储总目录，新增归档方式：

- 不分类：`user/images/miao-nai/图片.png`，沿用原生酒馆接口。
- 按角色卡：`user/images/miao-nai/角色名--标识/图片.png`。
- 按聊天存档：`user/images/miao-nai/角色名--标识/聊天名--标识/图片.png`。

群聊单独归档。标识来自角色卡文件／群聊 ID 和聊天存档 ID，避免重名互相混图。已有图片不搬动，聊天中的旧图片链接不变。图片页「管理目录」选择总目录，下面逐级进入角色卡和聊天文件夹；清理、选择下载只作用于当前文件夹。

## 普通 SillyTavern

实体子目录需要服务端插件。安装脚本随前端一起提供，无需再次下载或克隆后端。

1. 更新喵喵前端，打开安装它的文件夹。用户扩展通常位于酒馆的 `data/用户名/extensions/Mewo-Text-to-Image`，全局扩展通常位于 `public/scripts/extensions/third-party/Mewo-Text-to-Image`。
2. Windows 双击「安装归档后端.cmd」。Linux、macOS、Termux 在这个文件夹运行：

```sh
sh install-backend.sh
```

3. 重启酒馆。打开「图片」，选「按角色卡」或「按聊天存档」，保存。

脚本自动寻找酒馆目录，在 `plugins/miao-nai-image-loader.mjs` 注册后端入口，启用 `config.yaml` 的 `enableServerPlugins`，修改前保存原配置备份。重复运行不会重复安装。后端直接加载当前前端目录中的代码：此后更新前端并重启酒馆即可，不需要单独更新另一份后端。不要移动或删除前端目录；移动后需重新运行安装脚本。

使用自定义位置／配置时可运行 `node install-backend.mjs --root 酒馆目录 --config 配置文件路径`。脚本应在运行酒馆的电脑或服务器上执行，局域网连接的手机无须再安装。浏览器前端没有服务端安装或修改配置的权限，不能静默代替这一次本机操作。

已手动克隆到 `plugins/miao-nai-image` 的早期后端仍可 `git pull` 后重启；若要改用自动安装脚本，先将旧后端整个目录移到 `plugins` 外，避免重复加载，原有图片不受影响。安装脚本遇到旧目录或未知入口内容会停止，不覆盖。

后端 `/api/plugins/miao-nai-image/health` 应返回 `archives: 1`。归档端点只读写当前酒馆用户的图片目录，拒绝绝对路径、父目录、符号链接和非插件图片文件。后端只负责文件保存、列表和删除；NAI Key 和生图队列处理沿用现有流程。例图和不分类生图无需安装此后端。

## TauriTavern／TT

现有 TT 的 `upload_user_image`／`list_user_images` 会过滤目录分隔符，不能运行 Node 服务端插件。因此仅更新喵喵前端不能让已安装的 TT IPA/APK 支持实体多级归档。

本仓库提供 [TT 原生适配补丁](tt-adapter/tauritavern-image-archives.patch)，基于上游 `fff9af0`。补丁新增四个原生命令：

- `get_user_archive_capabilities`
- `upload_user_archive_image`
- `list_user_archive_images`
- `list_user_archive_folders`

删除复用 TT 的 `delete_user_image`。前端通过 TT 公共 ABI `__TAURITAVERN__.invoke.safeInvoke` 调用，图片保存在 TT 当前数据目录的 `user/images` 中，不经过 Node 或外部存储服务。

补丁需要 TT 维护者或自行编译者应用并重新打包客户端；iOS 还需要对应签名。当前只完成补丁可应用检查和模拟 ABI 集成测试，此环境没有 Rust 工具链，未完成原生编译和实体 iOS 验收。旧客户端仍可使用例图、不分类生图及原有图片管理；选择实体归档会在生图前提示缺少接口。

TT 源码目录中的检查命令：

```sh
git apply --check /path/to/tauritavern-image-archives.patch
git apply /path/to/tauritavern-image-archives.patch
cd src-tauri
cargo test -p tt-application user_media_service
cargo test -p tt-adapter-media user_media_store
```

## 例图

配置页展开「例图提示词」，输入并保存所有串共用的提示词。保存新串或修改串后，当前串的例图会排入现有生图队列，固定使用 512×512 方图；手动「刷新例图」会另抽种子。例图不会替换实际聊天的尺寸、种子和提示词。

图片显示在配置卡片中，点击卡片切换串。普通保存以固定种子比较画风；随机 Vibe 使用首个候选。重复保存不重复生图，后台排队时会检查配置是否仍存在且未改变。例图按正常 NAI 图片计费。
