# 图片分类

更新前端插件即可使用，PC、安卓普通酒馆和 TT 都不需要安装额外后端或运行脚本。

图片页直接使用分类标签，按「全部图片 → 角色卡 → 聊天存档」浏览，下载、删除和按日期清理只作用于当前显示的图片。

图片仍通过酒馆原有接口保存到原存储目录，不创建实体子目录、不移动或重命名已有图片。分类归属保存到当前酒馆用户的扩展设置中，同一酒馆账号换设备可同步分类。

新图记录生成任务开始时的角色卡和聊天；重名角色按角色卡文件区分，群聊单独分类。历史版本和 swipe 图片也会收录。旧图在打开对应聊天后补充归属；暂时无法确定归属的图片放在「未分类」，例图单独放在「例图」。复制聊天不会将已有图片改分到新聊天。

## 例图

配置页展开「例图提示词」，输入并保存所有串共用的提示词。保存新串或修改串后，当前串的例图会排入现有生图队列，固定使用 512×512 方图；手动「刷新例图」会另抽种子。例图不会替换实际聊天的尺寸、种子和提示词。

图片显示在配置卡片中，点击卡片切换串。普通保存以固定种子比较画风；随机 Vibe 使用首个候选。重复保存不重复生图，后台排队时会检查配置是否仍存在且未改变。例图按正常 NAI 图片计费。

## 图片实际位置

以下按默认用户 `default-user` 和插件默认存储目录 `miao-nai` 举例。更改过存储目录时，替换最后一段；多用户时替换用户目录。

- Windows 普通酒馆：`酒馆目录/data/default-user/user/images/miao-nai/`。
- 安卓 Termux 普通酒馆：通常是 `~/SillyTavern/data/default-user/user/images/miao-nai/`；不是手机相册目录。如果酒馆安装位置不同，可在 Termux 执行 `find "$HOME" -type d -path '*/user/images/miao-nai' 2>/dev/null` 查找。
- TT：`TT 数据根目录/default-user/user/images/miao-nai/`。安卓通常在内部存储的 `Android/data/com.tauritavern.client/` 下寻找 `data/default-user/user/images/miao-nai/`；部分版本位于其 `files/` 下。TT 优先使用系统提供的外部应用目录，必要时有内部目录回退，不同版本和平台可能不同。安卓系统可能限制文件管理器读取 `Android/data`，可使用 TT 内置导出或插件下载功能。

手机通过局域网连接电脑酒馆时，原图保存在电脑酒馆目录，只有点击下载／导出后才另存到手机。

TT 路径依据：[用户图片目录](https://github.com/Darkatse/TauriTavern/blob/main/src-tauri/crates/tt-domain/src/models/user_directory.rs)、[运行时数据目录](https://github.com/Darkatse/TauriTavern/blob/main/src-tauri/crates/tauritavern/src/infrastructure/paths.rs)。
