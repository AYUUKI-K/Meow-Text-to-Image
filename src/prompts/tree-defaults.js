// Authoritative v0.3 text blocks. Keep text unchanged; layout metadata is never sent.
const definitions = [
    {
        "nodeId": "task",
        "displayId": "00",
        "label": "任务与参数",
        "parentId": null,
        "order": 0,
        "kind": "group",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "prefix": "这是附加的剧情配图任务，必须按照以下步骤完成。\n本轮任务配置由插件提供：绘图执行者、对话对象、正文目标张数以及彩蛋标记（若启用彩蛋）。请严格以本轮任务配置为准。"
        },
        "children": [
            "task.steps",
            "task.fan"
        ]
    },
    {
        "nodeId": "task.steps",
        "displayId": "00.2",
        "label": "重要步骤与绘图数量",
        "parentId": "task",
        "order": 1,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "1. 首先，确保了解任务。\n2. 每次在<content>出现精彩时刻时，本次必须构思指定数量的图片，并分别完成绘图提示词。\n3. 需要符合画图关键词 tag，对<user>和NPC进行完全客观的描写。"
        },
        "children": []
    },
    {
        "nodeId": "task.fan",
        "displayId": "00.3",
        "label": "同人角色",
        "parentId": "task",
        "order": 2,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "4. 如果角色是著名角色，必须只写(1.5::English Name::1.5::English Source::)，严禁描述该角色的默认特征(如默认发色、瞳色、默认服装)，默认会自动补全默认外貌，仅当文中描述了变异(湿身/战损/换装)时，才追加对应标签。"
        },
        "children": []
    },
    {
        "nodeId": "composition",
        "displayId": "01",
        "label": "画面组成",
        "parentId": null,
        "order": 3,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "## 了解组成\n以“人物关系 + 情绪氛围”为核心。\n\n1. 什么类型:\n特写、半身、拥抱、牵手等\n→ 优先选择“明确”的构图(如 face to face / close distance / intimate moment)\n\n2. 主体人物(聚焦于<user>和主要NPC):\n- if: ACGN角色 → 使用角色英文名tag(不使用1girl/1boy 替代)\n- if: 原创角色 → 使用 girl / boy + 详细外貌tag(发色+发型+瞳色+眼型+特征等)\n- 多人时必须区分命名(如 GirlA / GirlB / 或角色名)\n- 人物数量为:1boy?……\n\n3. 人物表情:\n- 必须细化程度 + 情绪层级\n- 在保持角色美型的程度上添加表情比例\n- 表情必须为小于1的权重(例:0.7::wide eyes::)\n- 视线在看什么地方\n例如：\nslight smile / gentle smile / shy smile / forced smile / cold expression / soft gaze / longing eyes / half-lidded eyes/wide eyes\n\n4. 什么角度:\n- sfw类型的图片要突出人物的脸部和上半身\n→ 推荐：eye level / slight side angle / close-up...\n\n5. 分镜特写:\n- 情绪强烈 → 使用 close-up / face focus\n- 强调关系 → 双人同框 + 距离控制(very close / slight gap)\n- 构图围绕“人物互动”而不是背景\n- 充分展示<user>和角色们的外貌，重心放在角色面部表情之间的交互。\n\n6. 角色类型:\n(1.角色模板 2.著名ACGN角色)\n多人图规则：\n- 通用模板每个角色必须“独立括号 + 完整描述 + 权重”\n- 禁止共享外貌tag\n- 例:\n(CharacterA:1.2, ...)\n(CharacterB:1.2, ...)\n\n7. 上半身部位状态:\n- 服装状态 + 手部动作 + 细节\n- 动作是否合理？\n\n8. 下半身部位状态:\n- 站姿 / 距离 / 接触\n\n9. 角色特征:\n- 考虑如何正确描写<user>和主要NPC以及次要在场角色的外貌，请考虑身份、年龄等\n- 正确刻画不同的的身材外貌\n必须包含：\nhair, hairstyle, eye color, body type, height difference\n→ 强化：\nslim, tall, delicate, soft features, sharp eyes(按角色气质选)\n\n10. 衣物信息:\n- 必须具体\n- 著名服饰则使用服饰tag\n例如：\nwhite shirt, black coat, loose sweater, soft fabric, formal wear\n\n11. 追加状态:\nmessy hair, slightly wet, clothes slipping, disheveled\n→ 控制在轻微 + 避免过度 + 把控权重。\n\n12. 环境元素:\n包含：\n地点 + 时间 + 光影\n例如：indoor, window light, night, warm light, soft lighting, backlighting, cinematic lighting\n\n13. 交互动作:\n必须写在角色括号外，无需括号\n关键词：\nholding hands, hugging, touching face, leaning closer, whispering, looking at each other,\n\n14. 人物背景:\n- 必须存在\n例:bedroom, cafe, classroom, city night, window, curtain, bed, desk\n- 与剧情配合:\n暧昧 → 私密空间 / 柔光"
        },
        "children": []
    },
    {
        "nodeId": "tags",
        "displayId": "02",
        "label": "Tag 结构与补充规则",
        "parentId": null,
        "order": 4,
        "kind": "group",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {},
        "children": [
            "tags.rules",
            "egg"
        ]
    },
    {
        "nodeId": "tags.rules",
        "displayId": "02.01",
        "label": "通用 Tag 规范及补充",
        "parentId": "tags",
        "order": 5,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "注1:\n角色信息: (-sfw/nsfw-upperBody-sfw/nsfw-LowerBody)是否追加状态脏污、汗水、伤痕(轻微情趣向)等等。\n衣物信息: (原创服装:服装特色tag 并是否追加状态湿身、破损、脏污)只包含了服装的基本状态(比如是湿的，那么可以自行添加，关键词tag “Wet clothes”)\n只使用可见的服装部位，例如是赤裸则不进行调用。\n\n注2:\ntag结构：\n1.基础结构\n- 类型(选一:nsfw/sfw)\n- 画面总人数(必须明确：1girl/1boy/etc),\n- 质感提升词(controlled impasto/ soft thick paint / low saturation)\n- 构图(from front / close-up / full body / pov 等),\n- 背景(场景 + 时间 + 光照)\n- 添加增强稳定性tag:masterpiece, best quality,\n\n2.角色模板\n- 每个角色必须使用“()”进行包裹\n- 包裹必须包含详细的：(外貌 + 性别 + 服装 + 表情 + 动作)\n- (著名角色仅需包裹名字tag，除非特殊需求)\n- 每个角色必须加权重\n标准格式：\n(CharacterName or GirlA/BoyA:1.2,hair color, hairstyle,eye color,body type,clothing,expression,action)\n示例：\n(girlA:1.2, black hair, long hair, blue eyes, slim, school uniform, smile, standing),\n(1.2::Yuki Makoto::1.2::persona3::, black jacket slung over shoulders, deadpan but dominant expression, looking down, intimidating aura),\n- 每个角色必须使用不同“标签核心词”(如 GirlA / GirlB )\n- 禁止多个角色共用同一个模板tag\n- 禁止共享描述(例如只写一次 hair / eyes)\n- 多人图必须使用模板：必须写入角色括号内部 + 加权\n多角色交互时，核心交互须成对添加`#`前缀，发起方前缀为`source#`，承受方前缀为`target#`，如果是相互的则使用`mutual#`\n例:\n(角色Atag,source#kissing),\n(角色Btag,target#kissing)\n\n3.动作与交互\n- 角色之间的互动必须写在“角色模板括号外部”\n- 使用tag：hugging, holding hands, looking at each other\n\n前三点结合才是一个完整tag。\n\n4.禁止项\n- 禁止使用抽象词：beautiful,cute,amazing\n- 禁止模糊词：nice pose,good lighting,glowing,dominant\n- 禁止混合身份描述(例如两个角色共享外貌tag)\n- 禁止过分细致描写tag"
        },
        "children": []
    },
    {
        "nodeId": "egg",
        "displayId": "02.02",
        "label": "彩蛋任务",
        "parentId": "tags",
        "order": 6,
        "kind": "group",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "7.彩蛋：在本次正文图片完成后，额外构思一个小彩蛋图片作为给对话对象的惊喜，风格以搞怪 / 萌系 / 性感为主，确保与正文图片画风统一，可考虑 if 线、Q版互动、动物化、四格漫画等。\n- 正文仍须满足本轮配置的原定张数。\n- 彩蛋不计入正文的原定张数。\n- 全部输出数量为「正文图片数 + 1 张」。\n- 在本轮基础配置指定的彩蛋标记后输出彩蛋；彩蛋标记必须独占一行。\n\n16.彩蛋生成\n- 彩蛋必须为“独立完整的一张图”\n- 整体偏向：搞怪 / 萌系 / 微色情\n- 画面重点为“微趣味性 + 反差感 + 角色关系再演绎”\n- 画面需要背景tag作为背景点缀\n\n- 内容构思方向：\n  - if线(角色关系反转 / 性格反转)\n  - Q版(Mochi / super deformed)\n  - 动物化(猫塑/犬塑)\n  - 四格漫画(4koma / comic strip)\n  - 日常崩坏(严肃角色→搞怪行为)\n  - 自由发挥创思\n\n- 多角色规则：\n  - 每个角色必须独立括号 + 权重\n    (CharacterA:1.2, ...)\n    (CharacterB:1.2, ...)\n  - 必须保持角色“可辨识特征”(发色 / 眼睛 / 标志物)\n  - 禁止角色融合或属性共享\n  - 倾向日系萌感，拒绝美式。\n\n- 优先选择：\n  - 使用明确风格tag：\n    Mochi, comic style, 4koma,\n  - 动作优先选择“互动性强”的：\n    chasing, poking, pulling, sitting on, holding tail\n\n- 禁止：\n  - 使用抽象词(beautiful, nice, amazing)\n  - 风格不统一(例如一人Q版一人正常比例)\n  - 人头动物等，过于夸张的美式风格\n\n- 推荐追加：\n  lighthearted, comedic contrast, clean lines, flat color",
            "suffix": "完成彩蛋任务。"
        },
        "children": [
            "egg.description"
        ]
    },
    {
        "nodeId": "egg.description",
        "displayId": "02.02.01",
        "label": "彩蛋解析",
        "parentId": "egg",
        "order": 7,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "在彩蛋tag输出完成后，使用:\n<easter_egg>\n[以本次剧情中任意角色的口吻，生活化的语气输出本次输出彩蛋内容，允许使用颜文字(甚至可以是绘图执行者的口吻，也允许Meta元素出现，角色直接与对话对象对话)](换行使用<br>)\n</easter_egg>"
        },
        "children": []
    },
    {
        "nodeId": "nsfw",
        "displayId": "03",
        "label": "NSFW 扩展",
        "parentId": null,
        "order": 8,
        "kind": "group",
        "toggleable": true,
        "defaultEnabled": false,
        "slots": {},
        "children": [
            "nsfw.rules",
            "orientation"
        ]
    },
    {
        "nodeId": "nsfw.rules",
        "displayId": "03.01",
        "label": "NSFW 描写规范",
        "parentId": "nsfw",
        "order": 9,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "15.NSFW:\n- 每个角色：\n  (Name:1.2, 完整外貌 + 服装 + 表情 + 动作)\n- 禁止：\n  - 不清晰的动作tag\n  - 共用tag\n  - 回避直面色情画面\n- 优先:\n - *将画面对准性器官与性器官(肉棒，阴部，子宫，阴蒂等)*\n - 通过(汗水，翻白眼，吐舌，淫水，睁大眼睛等)刻画细节。\n - 刻画人物表情展现官能色情，重点放在承受方的表情，以及进攻方的阳具\n - 正确描述<user>和<char>的性器官\n - 性玩具的tag精确\n\n- 禁止为性器官添加颜色tag\n\n- nsfw类型图片突出性交部位和角色表情\n\n5.NSFW环节重点刻画:人物的性器官、人物表情，人物之间的体型差，年龄差，画面冲突性，特征(胸围等)"
        },
        "children": []
    },
    {
        "nodeId": "orientation",
        "displayId": "03.02",
        "label": "性向补充",
        "parentId": "nsfw",
        "order": 10,
        "kind": "choice-group",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {},
        "children": [
            "orientation.bg",
            "orientation.bl",
            "orientation.gl",
            "orientation.intersex"
        ]
    },
    {
        "nodeId": "orientation.bg",
        "displayId": "03.02.BG",
        "label": "BG",
        "parentId": "orientation",
        "order": 11,
        "kind": "choice-option",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "- 注意本次NSFW为[bg]，即在描绘NSFW环节中，精准突出bottom方的子宫/阴唇/穴口，top方的睾丸/阴茎等。"
        },
        "children": [],
        "choice": "BG"
    },
    {
        "nodeId": "orientation.bl",
        "displayId": "03.02.BL",
        "label": "BL",
        "parentId": "orientation",
        "order": 12,
        "kind": "choice-option",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "- 注意本次NSFW为[bl]，即在描绘NSFW环节中，精准突出bottom方的肛门/尻穴，但是不要遗漏了bottom方存在的阴茎，top方的睾丸/阴茎等。"
        },
        "children": [],
        "choice": "BL"
    },
    {
        "nodeId": "orientation.gl",
        "displayId": "03.02.GL",
        "label": "GL",
        "parentId": "orientation",
        "order": 13,
        "kind": "choice-option",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "- 注意本次NSFW为[gl]，即在描绘NSFW环节中，精准突出bottom方的子宫/阴唇/穴口，top方的花穴等。如果有性爱道具的话也必须注意。"
        },
        "children": [],
        "choice": "GL"
    },
    {
        "nodeId": "orientation.intersex",
        "displayId": "03.02.INTERSEX",
        "label": "双性",
        "parentId": "orientation",
        "order": 14,
        "kind": "choice-option",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "- 注意本次NSFW中，明确起码有一方为双性，要精准突出bottom方的肛门/尻穴/花穴/阴唇，不要遗漏了性交中，双性方存在两性特征，阴茎或者小穴。"
        },
        "children": [],
        "choice": "INTERSEX"
    },
    {
        "nodeId": "selfcheck",
        "displayId": "04",
        "label": "自检",
        "parentId": null,
        "order": 15,
        "kind": "group",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "prefix": "## 自检\n每次构思画面前，在 imgthink 中按照下面的检查点进行详细自检，不得漏掉任何一点。\n在<content>出现关键画面时刻时，先使用<imgthink>构思，再用详细而具体的短语描述 tag；多个精彩时刻应分别构思。\n在<content>开始后的第一行输出一次原有的自检说明注释：\n<!-- 必须在content内进行imgthink进行思考 -->\n\n<imgthink>",
            "suffix": "</imgthink>"
        },
        "children": [
            "selfcheck.item1",
            "selfcheck.item2",
            "selfcheck.item3",
            "selfcheck.item4",
            "selfcheck.item5",
            "selfcheck.item6",
            "selfcheck.item7",
            "selfcheck.item8",
            "selfcheck.item9",
            "selfcheck.item10",
            "selfcheck.egg",
            "selfcheck.nsfw",
            "selfcheck.total"
        ]
    },
    {
        "nodeId": "selfcheck.item1",
        "displayId": "04.01",
        "label": "画面与构图",
        "parentId": "selfcheck",
        "order": 16,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "1.画面与构图\n- 画面的数量为本轮任务配置的正文图片数；如果彩蛋开启，则另外加一张。\n- 是否明确人物之间的位置关系、距离、前后景层次？\n- 是否清晰描述“谁对谁做什么动作”？"
        },
        "children": []
    },
    {
        "nodeId": "selfcheck.item2",
        "displayId": "04.02",
        "label": "Tag 规范",
        "parentId": "selfcheck",
        "order": 17,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "2.tag规范\n- 禁止使用自然语言句子\n- tag只能使用英文逗号`,`分割，禁止使用分号`;`\n- 禁止使用模糊或抽象词（如 beautiful, nice, amazing）\n- 优先使用“可视觉化”的具体tag（如：smile → gentle smile / smirk）"
        },
        "children": []
    },
    {
        "nodeId": "selfcheck.item3",
        "displayId": "04.03",
        "label": "角色刻画",
        "parentId": "selfcheck",
        "order": 18,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "3.角色刻画\n- 是否完整、精确描述每个角色外貌：\n  - 发色、发型、长度、质感\n  - 瞳色\n  - 身形（tall, petite, slim 等）\n- 是否明确服装（仅描述“可见部分”）：\n  - 类型 + 细节（如 school uniform, hoodie, jacket）\n  - 状态（wet clothes, torn clothes, dirty）"
        },
        "children": []
    },
    {
        "nodeId": "selfcheck.item4",
        "displayId": "04.04",
        "label": "多人交互逻辑",
        "parentId": "selfcheck",
        "order": 19,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "4.多人交互逻辑\n- 是否明确：\n  - 谁是主动方，谁是被动方\n  - 是否存在身高差、体型差\n- 是否避免角色行为混淆（动作、表情归属清晰）\n- 是否避免特征相互污染（发色、服装等）"
        },
        "children": []
    },
    {
        "nodeId": "selfcheck.item5",
        "displayId": "04.05",
        "label": "权重与强调",
        "parentId": "selfcheck",
        "order": 20,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "5.权重与强调\n- 权重使用是否合理，避免滥用导致失衡\n- 禁止使用thoroughly/gravely/heavy/extreme等副词来修饰tag"
        },
        "children": []
    },
    {
        "nodeId": "selfcheck.item6",
        "displayId": "04.06",
        "label": "风格与质量控制",
        "parentId": "selfcheck",
        "order": 21,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "6.风格与质量控制\n- 是否补充基础质量tag：\n  - masterpiece等\n- 风格是否统一（避免 chibi / realistic / comic style 混乱，保证本轮中多张图的tag均为统一氛围。）"
        },
        "children": []
    },
    {
        "nodeId": "selfcheck.item7",
        "displayId": "04.07",
        "label": "角色类型规范",
        "parentId": "selfcheck",
        "order": 22,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "7.角色类型规范\n- **著名ACGN角色：是否使用固定名字tag（避免自定义描述/使用a girl 或者a boy）**\n- 原创角色：统一使用 girl / boy + 外貌描述"
        },
        "children": []
    },
    {
        "nodeId": "selfcheck.item8",
        "displayId": "04.08",
        "label": "输出结构检查",
        "parentId": "selfcheck",
        "order": 23,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "8.输出结构检查\n- 是否符合插件本轮「输出格式」条目的结构：可选小标题、独立的 `image###` 图片 tag 块。\n- tag是否完整、连续、无语法错误"
        },
        "children": []
    },
    {
        "nodeId": "selfcheck.item9",
        "displayId": "04.09",
        "label": "信息完整性",
        "parentId": "selfcheck",
        "order": 24,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "9.信息完整性\n- 是否避免过度夸张或破坏美感的特征（例如极端表情:极端大笑，畸形体态:驼背，特别突出的面部特征:黑眼圈）\n- 多人场景：每个角色必须独立tag分组（括号包裹）"
        },
        "children": []
    },
    {
        "nodeId": "selfcheck.item10",
        "displayId": "04.10",
        "label": "扩展要求",
        "parentId": "selfcheck",
        "order": 25,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "10.扩展要求\n- 在content内的“关键画面时刻”插入tag，实现图文结合效果\n- 必须最大化细节明确性\n- 避免美式tag(例:goofy smile……)，构思需要偏向日系"
        },
        "children": []
    },
    {
        "nodeId": "selfcheck.egg",
        "displayId": "04.EGG",
        "label": "彩蛋额外检查",
        "parentId": "selfcheck",
        "order": 26,
        "kind": "text",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "- 是否记得在彩蛋标记之后输出彩蛋？\n- 本次全部输出数量是否为「正文原定张数 + 1 张」？"
        },
        "children": [],
        "condition": [
            "selfcheck",
            "egg"
        ]
    },
    {
        "nodeId": "selfcheck.nsfw",
        "displayId": "04.11",
        "label": "NSFW 环节检查",
        "parentId": "selfcheck",
        "order": 27,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "11.NSFW环节要求\n- 性交双方的体型差是否有表现出来？\n- **是否将画面重心对准性器与性器？**\n- 是否有增加渲染符合色情性交的tag？\n- 性玩具的tag是否描述到位？"
        },
        "children": []
    },
    {
        "nodeId": "selfcheck.total",
        "displayId": "04.12",
        "label": "必须的总检查",
        "parentId": "selfcheck",
        "order": 28,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "12.必须的总检查\n- boy和girl的数量tag为？动作的承受方和主动方是？\n- 禁止过于繁杂的tag\n- 违背人体生理学的极不合理的身体比例(比如huge penis)\n- 禁止过于狰狞表情的tag\n- 本次输出是否满足配置的正文图片数，并在开启彩蛋时额外输出一张？\n- **若为著名ACGN角色仅使用固定名字tag，不需要发色瞳色服饰等。**"
        },
        "children": []
    },
    {
        "nodeId": "output",
        "displayId": "05",
        "label": "输出要求",
        "parentId": null,
        "order": 29,
        "kind": "group",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {},
        "children": [
            "output.selfcheck",
            "output.subtitle",
            "output.format"
        ]
    },
    {
        "nodeId": "output.selfcheck",
        "displayId": "05.01",
        "label": "自检输出规则",
        "parentId": "output",
        "order": 30,
        "kind": "text",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "如启用自检：在相应画面生成 tag 之前，输出一段完整的 `<imgthink>` 思考过程，并与当前画面一一对应。"
        },
        "children": [],
        "condition": [
            "selfcheck"
        ]
    },
    {
        "nodeId": "output.subtitle",
        "displayId": "05.02",
        "label": "小标题",
        "parentId": "output",
        "order": 31,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": false,
        "slots": {
            "body": "┈┈[胡里花哨的符号+本次绘画的主题文字+可爱颜文字]┈┈"
        },
        "children": []
    },
    {
        "nodeId": "output.format",
        "displayId": "05.03",
        "label": "图片标签结构",
        "parentId": "output",
        "order": 32,
        "kind": "text",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "## 图片标准格式为:\nimage###\n[图片tag]\n###"
        },
        "children": []
    }
];
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}
export const promptTree = freeze(definitions);
export const treeById = freeze(Object.fromEntries(promptTree.map(node => [node.nodeId, node])));
export const treeRoots = freeze(promptTree.filter(node => node.parentId === null).map(node => node.nodeId));
export const orientations = Object.freeze(['', 'BG', 'BL', 'GL', 'INTERSEX']);

export function validatePromptTree(nodes = promptTree) {
    const byId = new Map(nodes.map(node => [node.nodeId, node]));
    if (byId.size !== nodes.length) throw Error('提示词节点 ID 重复');
    const roots = nodes.filter(node => node.parentId === null);
    if (roots.map(node => node.displayId).join(',') !== '00,01,02,03,04,05') throw Error('提示词一级顺序错误');
    for (const node of nodes) {
        let current = node, depth = 1;
        const seen = new Set([node.nodeId]);
        while (current.parentId !== null) {
            const parent = byId.get(current.parentId);
            if (!parent || seen.has(parent.nodeId)) throw Error('提示词父级不存在或存在循环');
            if (!parent.children.includes(current.nodeId) || ++depth > 3) throw Error('提示词层级错误');
            seen.add(parent.nodeId); current = parent;
        }
        if (new Set(node.children).size !== node.children.length || node.children.some(id => byId.get(id)?.parentId !== node.nodeId)) throw Error('提示词子项错误');
        if (node.condition?.some(id => !byId.get(id)?.toggleable) || node.condition && node.toggleable) throw Error('提示词条件错误');
        if (node.kind === 'choice-option' && (!orientations.includes(node.choice) || node.toggleable)) throw Error('提示词选择器错误');
    }
    return true;
}
validatePromptTree();
