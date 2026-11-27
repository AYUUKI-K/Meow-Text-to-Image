// Tag categories from the original Electronic Ghost preset.
export const electronicGhostTagLibrary = [
    {
        name: "tag 素材库",
        role: "system",
        content: `以下是可选的 NovelAI / Danbooru 素材词。按所选段落的场景挑词，删除冲突或重复项，也可以补充列表以外的合适标签。固定角色的外貌仍交给角色调用记号。

【时间】
# 时间
day
dusk
goldenhour
sunset
sunrise
late at night
evening
night

【室内】
# 背景地点 (室内生活空间)
- bathroom
- bathtub
- shower
- bedroom
- hotel room
- messy room
- dining room
- kitchen
- living room
- apartment
- house
- hotel
- stilt house
- treehouse

【公共场合】
# 背景地点 (公共场所)
- cafeteria
- changing room
- classroom
- conservatory
- dressing room
- fitting room
- gym
- locker room
- infirmary
- gym storeroom
- laboratory
- library
- canteen
- office
- pool
- staff room
- storage room
- bar
- izakaya
- cafe
- casino
- church
- hospital
- mall
- museum
- art gallery
- nightclub
- onsen
- planetarium
- prison
- restaurant
- school
- skating rink
- shrine
- shop
- bakery
- bookstore
- convenience store
- flower shop
- pharmacy
- salon
- sex shop
- supermarket
- stadium
- temple
- theater
- amphitheater
- movie theater

【人造户外】
# 背景地点 (人造户外区域)
- parking lot
- plain
- amusement park
- Public canteen
- carousel
- ferris wheel
- roller coaster
- bridge
- rope bridge
- wooden bridge
- canal
- city
- floating city
- rural
- town
- village
- dam
- dock
- garden
- graveyard
- jetty
- field
- flower field
- rice paddy
- wheatfield
- fountain
- harbor
- market
- market stall
- pier
- phone booth
- poolside
- waterpark
- railroad tracks
- railroad crossing
- road
- alley
- crosswalk
- dirt road
- highway
- path
- sidewalk
- stone walkway
- street
- tunnel
- well
- zoo
- convention
- gas station
- garage
- gazebo
- greenhouse
- industrial
- factory
- warehouse
- lighthouse
- rooftop
- ruins

【自然景观】
# 背景地点 (自然景观)
- beach
- shore
- canyon
- cliff
- desert
- cave
- oasis
- forest
- bamboo forest
- glacier
- hill
- island
- floating island
- jungle
- meadow
- volcano
- mountain
- nature
- park
- playground
- savannah
- wetland
- water
- lake
- seafloor
- pond
- ocean
- river
- stream
- waterfall
- volcano
- wasteland
- ruins

【虚构场景】
# 背景地点 (特殊/虚构)
- space elevator
- planet
- space station
- floating island
- floating city

【位置关系】
# 位置关系
与自然
against tree
in tree
under tree
on grass
in sky
under bridge
on ground

与水
in water
under water
partially submerged
partially submerged cum
soaking feet
wading
walking on liquid
near the water edge
lying on water
lying on the lake

与家具
on bed
under covers
on couch
on desk

与交通工具内部
?+interior
vehicle interior
bus interior
car interior
train interior

与特殊补充
in+?
in container
in box

【人物关系】
# 人物关系
solo
hetero
yuri
harem
twins
cousins
brother and sisiter
siblings
father and daughter
mother and son
husband and wife
interracial
small sub big dom
size difference
height difference

【年龄】
# 年龄
child, teenager, adult, middle-aged, elderly。以剧情明确的年龄段为准，不猜测。

【男性身材】
# 男性身材
[整体体型]
lean muscle
athletic build
broad shoulders
v-taper
thick neck

[胸腹]
collarbone
adams apple
pecs
defined pectorals
abs
six pack
serratus anterior

[腰胯]
adonis belt
iliac crest
happy trail
v-line

[手臂]
vascular
veins
hand veins
arm veins

[背部与下身]
broad back
scapula
spine
bulge
crotch bulge
tight pants
muscular thighs

[质感与细节]
sweat
glistening skin
tan lines
body hair
chest hair

【特征】
# 修饰特征
彩妆/唇部装饰
makeup
eyeshadow
lipstick
mascara
long eyelashes
red lips
lipgloss
colored eyelashes
﻿
红晕/血色相关
blush
light blush
anime style blush
nose blush
﻿
印记/瑕疵/纹路
bruise on face
facial mark
forehead mark
mole
mole under eye
freckles
whisker markings
scar
scar across eye
﻿
纹身
stomach tattoo
heart tattoo
pubic tattoo

晒痕
dress tan lines
tan lines

残留/附着物
food on face
rice on face
cream on face

【穿着状态（上衣）】
# 穿着状态（上身）
上衣裸露
topless

上衣敞开
open shirt
unbuttoned shirt

内衣敞开/裸露
open bra
no bra
areala slip
breast slip

袖子状态
sleeves pushed up
sleeves past elbows
detached sleeves

肩带状态
strap slip
strap gap

【穿着状态（下身）】
# 穿着状态（下身）
下装裸露
bottomless
no panties
unworn
dress removed
torn pants

【服饰开口】
#  服饰材质（开口）
肩颈、手臂开口
off-shoulder
bare shoulders
bare arms
shoulder cutout
arm cutout

胸部及周边开口
breastless clothes
covered nipples
cleavage cutout
underboob cutout
center opening

裸露腰腹、背部开口
navel cutout
waist cutout
stomach cutout
back cutout

臀部、腿部开口
ass cutout
thigh cutout
leg cutout

特殊款式开口
rei no himo
heart cutout
cat cutout

【构图】
# 构图
视角
female pov
looking down at viewer
looking down at viewer
boyfriend perspective

区域
full body
whole body
upper body
lower body
bust
profile
side profile
back
straight-on
selfie
selfiemirror
﻿
远近
mid shot
cowboy shot
panorama
grand scene
wide shot
aerial


视角（通用）
front view
from behind
from above
from below
from side
from outside
from the side below
side view
male/female pov
pov across table
pov crotch
three-quarter view
first-person view
third-person
third-person view
full room view
from the side below
low-angle shot
upshorts
upshirt
wide shot
﻿﻿phone screen
mirror selfie
﻿
角度
cinematic angle
intense angle
dramatic angle
dutch angle
﻿
其他
depth of field
motion blur
bokeh
group picture
rotational symmetry
symmetry
center frame

【人物视线】
# 视线
基础视线
looking down
looking up
looking ahead
looking afar
looking to the side
looking back
looking outside

交互视线
looking at viewer
looking at another
facing viewer
facing the lens
looking at phone
looking at mirror
looking at hand
looking at food
looking at screen
eye contact

其他
close to viewer
very close to viewer
sideways glance
peeping
looking away
facing away

【基本动作】
# 基本动作
- kneeling
- lying
- sitting
- standing
- crawling
- jumping
- running
- walking
- all fours

【站姿】
## 站姿
standing
contrapposto
bent over
curtsy

【坐姿】
## 坐姿
sitting
wariza
sitting on the ground
seiza
yokozuwari
indian style
lotus position
straddling
reclining
thigh straddling
figure four sitting

【躺姿】
## 躺姿
lying
lying down
lying on back
on back
lying on side

【趴姿】
## 趴姿
lying posture
lying on stomach
on stomach
crawling
top-down bottom-up

【跪资】
## 跪姿
kneel
kneeling
on knees
on one knee

【倾靠】
## 倾靠
leaning
leaning to the side
leaning forward
leaning back
leaning on object

【手动作】
## 手动作
thumbs up
index finger raised
cat pose
claw pose
paw pose
finger gun
fox shadow puppet
peace hand
victory pose
v over mouth
shushing
pinky out
steepled fingers
middle finger
fist
clenched hand
raised fist
fidgeting
finger to mouth
own hands clasped
own hands together
open hands
heart hands
cupping hands
finger counting
orchid fingers
pillow hug
object hug
rubbing eyes
covering ears
hugging own legs
belly grab
reaching
tying

【头部动作】
## 头部动作
head tilt
head down
head back
faceplant

【手臂动作】
##  手臂动作
arm support
arms behind head
arms behind back
arms at sides
outstretched arm
arm up
arms up
arm under breasts
arms under breasts
victory pose
spread arms
arm at side
airplane arms
crossed arms
heart arms
\\o/

【腿部动作】
## 腿部动作
crossed legs
crossed ankles
hugging own legs
thigh straddling
upright straddle
crossed ankles
folded
leg up
legs up
knees to chest
legs over head
legs up
leg lift(抬一只脚)
outstretched leg
spread legs
knees apart feet together
knees together feet apart
knee up
knees up
tiptoes
feet up
m legs

【其他动作】
## 其他姿势
squatting
all fours
fetal position
prostration
stretching
balancing
piggyback
staring

【双人互动】
# 男性动作
loosening tie
adjusting tie
unbuttoning shirt
rolling up sleeves
taking off jacket
adjusting cuffs
pulling collar
biting glove
removing gloves
taking off glasses
wiping sweat

# 女性动作
undressing
changing clothes
clothes pull
holding strap
off-shoulder
partially unbuttoned
clothes in mouth
shirt lift
putting on clothes

【头发交互】
# 头发交互
hand in own hair
hair flip
hair pull
adjusting hair
hair tucking
tying hair
hairdressing
hair twirling
bunching hair

【表情】
# 表情
色气/动情
heavy breathing
flustered
biting lip
lick lips
half-closed eyes
moist eyes
looking at viewer with desire
enduring
pleasure face
sweaty face
messy hair

负面/强制感（Dark Romance）
crying
tears
frown
scared
despair
clenched teeth
forced smile

常用
smile
gentle smile
smirk
expressionless
cold face
﻿
怒
glaring
pout
scowl
sulking
annoyed
furious
furrowed brow
﻿
惊
surprised
horrified
screaming
shouting
be frightened and change color

羞
blush
embarrassed
shy

累
yawning
drunk
sleepy
bored
exhausted

嘴
parted lips
open mouth
rectangular mouth
wavy mouth
x3（猫嘴）
closed mouth

其他
confused
eyelid pull
disdain
hysterical
crazy angry smile
tongue out
sneezing
jealous
possessive

涩涩
fuckedsilly
torogao
salivatrail
steamingbody
sweatingprofusely
heart eyes（媚药/发情）

【表现力】
# 表现力/微细节
环境氛围/自然现象
falling leaves
night sky
fireworks
crescent moon
burning
embers
explosion
smoke of gunpowder
shredded paper
breeze
steam
floating snowflake
floating sakura
lower on liquid
﻿
生理反应
full-face blush
dilated pupils
drooling
passionate gaze
heavy breathing
steaming body
visible breath
sweat
sweaty
afterglow sweat
trembling
arched back
muscle tension
nipple erection
cum overflow
pussy
pussy juice trail
vaginal fluids
lactation
﻿
动态互动
body movement
speed lines
motion lines
motion blur
rhythmic thrusting
skin slap
bouncing breasts
ass ripple
splashing fluids
﻿
特效/粒子
magical
ripple
glowing
light particles
﻿
拟声词
sound effects(指角色周围的性交动作啪啪或角色淫叫声等)

【背景人物】
## 背景人物（超出角色上限的人作为背景）
crowd
crowd silhouette
blurred crowd
facing crowd
background crowd
background girls`,
        enabled: true,
    },
    {
        name: "tag 素材库 · NSFW",
        role: "system",
        content: `以下词表仅在本轮开启相应出图规则时供参考，仅用于明确成年的角色。按正文选用相关词，不为使用词表而额外添加情节。

【胸部】
# 罩杯
flat chest（A）
small breasts（B）
medium breast（C）
large breasts（D）
huge breasts（E）
gigantic breasts（F及以上）

【情色其他】
# 情色其他
gaping（肛门/阴道被张开/扩张/敞开）
holding+?（holding cup）
grabbing+?（grabbing chest）
covering+?（covering face）
maebari+?（小穴被什么遮挡）
through clothes masturbation（隔衣自慰）

【衣服互动】
# 衣服交互
穿脱衣
undressing
unzipping
leggings pull
clothes pull
swimsuit pull
skirt pull
bikini pull
panty pull
leotard pull
kimono pull
mask pull
bra pull
pulled by self
putting on legwea
dressing
opening another's clothes
changing clothes
wringing clothes
dress tug,trying on clothes
removing jacket
coat tug
tying footwear
clothes grab
pulled by self

调整衣物
adjusting legwear
adjusting panties
dress tug
clothes pull

提拉衣物
skirt lift
dress lift
kimono lift
clothes lift
bra lift

握持/抓取衣物
skirt hold
holding strap
necktie grab

其他衣物交互
hat tip
lifted by self
covering breasts

【穿着状态（整体)】
# 穿着状态（整体）
全裸
nude
completely nude

部分穿着
partially clothed
open clothes
open dress
open robe

衣物破损
torn clothes

衣物透明
see-through clothes,transparent clothes

衣物潮湿
wet clothes,detailed wet clothes

# 裸露部位
敏感部位
pussy
ass
nipple

其他部位
裸露状态
partially undressed
sweaty clothes
single bare shoulder
open pajamas
slip showing
midriff peek
bare back
underboob
no undershirt
zenra

衣物覆盖下可见部位
covered+?
covered sideboob

【亲密互动】
# 亲密互动
beckoning
talking
flirt
tickling
shared food
scolding
bullying
kabedon
chin lift
princess carry
back hug
spooning
headpat
forehead touch
whispering in ear
hand kissing
palm kissing
leaning on shoulder
entwined legs
sitting on lap
carrying over shoulder
hugging from behind

# 基础互动
holding hands
interlocked fingers
arm in arm
arm around waist
hand on cheek
hand on neck
hand in hair
sleeping together
cuddling
hugging
kissing
french kiss

【抓】
## 引导动作/抓动作
groping
ass grab
grabbing another's breast
guided breast grab
pectoral grab
guided pectoral grab
nipple tweak
crotch grab
guided crotch grab
grabbing own breast
torso grab
hair job

【性爱】
# 性爱
体位
doggystyle
69
spitroast
leg lock/upright straddle
upright straddle
reverse upright straddle
suspended congress
reverse suspended congress
mating press
missionary
piledriver
girl on top
cowgirl position
reverse cowgirl position
amazon position
sex from behind
﻿
特定性行为
implied sex
clothed sex
thigh sex
navel sex
underwater sex
implied sex
stealth sex
stealth fellatio

动作/接触性行为
presenting
frottage
cooperative grinding
cock in thighhigh
imminent+?（即将被什么）
-  imminent vaginal
after+?（什么性爱后）
- after sex
- after anal
- after buttjob
- after fellatio
- after fingering
- after insertion
- after masturbation
- after oral
- after rape
- after urethral
- after vaginal
- afterglow

【口交】
# 口交
oral
anilingus
rusty trombone
cunnilingus
fellatio
autofellatio
cum swap
deepthroat
cooperative fellatio
irrumatio
multiple penis fellatio
licking testicle
sitting on face
testicle sucking

【手交】
# 手交
handjob
double handjob
cooperative handjob
cuddling handjob
nursing handjob
reverse nursing handjob
reach-around
two-handed handjob
caressing testicles
through clothes handjob

【乳交】
# 乳交
?+paizuri+?(怎么乳交)
cooperative paizuri
handsfree paizuri
perpendicular paizuri
straddling paizuri
paizuri on lap
multiple paizuri
pecjob
breast smother
cooperative breast smother

【足交】
## 足交
footjob
double footjob
cooperative footjob
licking foot

【插入】
# 插入
插入数量
double anal
triple anal
double vaginal
triple vaginal
multiple insertions
﻿
插入部位
anal
vaginal
cervical penetration
urethral insertion
tail insertion
anal object insertion
vaginal object insertion
food insertion
animal insertion
﻿
插入状态/方式
imminent anal
imminent vaginal
imminent penetration
guided penetration
deep penetration
large insertion
male penetrated
sounding
tailjob
﻿
插入效果
stomach bulge
cum inflation
big belly
enema

【自慰】
# 自慰
crotch rub
pillow sex
teddy bear sex
table humping
masturbation
?+masturbation（什么物品手淫/自慰）
clothed masturbation
female masturbation
male masturbation
mutual masturbation
stealth masturbation
tail masturbation

【群体性爱】
# 群体性爱
人物关系（ 参与人数）
threesome
mmf threesome
ffm threesome
mmm threesome
teamwork

性行为动作
group sex
orgy
love train
gangbang
spitroast
reverse spitroast
double penetration
triple penetration
cooperative sex
cooperative fellatio
cooperative paizuri

【阴茎细节】
glans
frenulum
vein
vascular
thick penis
curved penis
uncut
foreskin
phimosis
pubic hair
happy trail
treasure trail
shiny skin
oiled
defined muscles
two-tone skin
two-tone penis

【阴茎状态】
erection
morning wood
semi-hard
half-erect
precum
cowper's fluid
cum drip
precum drip
throbbing
twitching
condom wrapper
putting on condom

【异种肉棒】
knot
knotted penis
barbed penis
horse penis
demon penis
tapered penis
tentacle
phallic tentacle
sheath
hemipenes
prehensile penis

【阴茎配饰】
cock ring
glans ring
prince albert piercing
frenulum piercing
urethral piercing
chastity cage
pearly penile papules
pearling
tattoo on penis

【阴茎互动】
penis slap
cock slap
penis fencing
scissoring
cock warming
docking
meat spin
hands-free ejaculation

【射精】
# 液体表现
cum
cum string
cum on body
cum on abs
cum on hands
cum on face
messy sheets
sweat
mixed fluids
internal cumshot
cum overflow
cum drip
saliva trail
kissing with tongue
excessive cum
cumdrip
ejaculation
ejaculating while penetrated
pull out
facial
autofacial
felching
gokkun
internal cumshot

【胸部动作】
## 胸部动作库
breast press
breast suppress
breast squeeze
breast lift
breasts on glass

【哺乳】
# 哺乳
breast sucking
breastfeeding
lactation
breast_feeding
breast_sucking/nipple_suck

【玩具-震动棒】
# 性玩具-振动器
vibrator_in_thigh_highs
bunny_vibrator
butterfly_vibrator,riding_machine
vibrator_under_clothes,
vibrator_under_panties
vibrator on nipple
egg_vibrator
vibrator_in_anus

【玩具-假阳具】
# 性玩具-假阳具
double_dildo
huge_dildo
dragon_dildo
horse_dildo
spiked_dildo
suction_cup_dildo
dildo_riding
dildo_gag
dildo_harness
dildo_under_panties

【玩具-其他】
# 性玩具-杂项
chain,spr
chastity_belt
belly_chain
nipple_clamps
plug_gag,strap-on
urethral_beads
ball_gag
tenga
breast_pump
too_many_sex_toys
hobble,clitoris_clamp
aphrodisiac
lotion_bottle
lube`,
        enabled: true,
        when: "nsfw",
    },
];
