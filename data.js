/* =====================================================
 * 吃什么 · 数据层（用户档案 / 候选库 / 健康红线 / 规则引擎）
 * 纯前端数据，双击 index.html 即可使用。
 * ===================================================== */

/* ---------- 用户档案（规则模式 & Agent 模式共用） ---------- */
/* 通用默认值（公开仓库使用，无个人数据）；
 * 本机个性化：在 profile.local.js 里填 window.__PROFILE_OVERRIDE__（该文件被 gitignore，不会入库）。 */
const PROFILE = {
  height: 170,      // 默认身高（cm），可在 profile.local.js 覆盖
  weight: 60,       // 默认体重（kg），可在 profile.local.js 覆盖
  goal: 55,         // 默认目标体重（kg），可在 profile.local.js 覆盖
  note: '健康减脂：控制热量、保证营养、规律三餐',
  appetite: '正常',
  pattern: '三餐规律，愿意自己做饭',
  takeout: '外卖偏好简单清淡',
  dessert: '偶尔想吃甜品——允许小份推荐，但必须提示频率（每周 ≤1~2 次）并建议配无糖饮品',
  redLines: [
    '默认禁止高油/高糖/高热量（油炸、重酱烧烤、甜点奶茶、含糖饮料）',
    '只有用户明确点名想吃时，才可推荐垃圾食品，且必须附健康化改装建议（去皮、少酱、无糖、小份）',
    '甜品/蛋糕：允许在加餐时段小份推荐，但必须提示频率（每周 ≤1~2 次）和搭配（无糖茶/黑咖啡）',
    '每次推荐必须附带 1~2 条可执行的健康提示',
    '蛋白质优先：蛋 / 奶 / 无糖酸奶 / 豆腐 / 鸡胸肉 / 鱼虾',
    '热量给出大致范围，份量以小份为主',
    '支持少食多餐：一顿吃不下就拆两顿，或饭后 1~2 小时加餐'
  ]
};

/* 可选的本地个人档案覆盖（profile.local.js，已被 gitignore 排除）：
 * 本机存在该文件时，用其中内容覆盖上面的通用默认值；没有就用默认值。 */
if (typeof window !== 'undefined' && window.__PROFILE_OVERRIDE__) {
  Object.assign(PROFILE, window.__PROFILE_OVERRIDE__);
}

/* 生成 Agent 模式用的 system prompt */
function buildSystemPrompt() {
  return [
    '你是「今天吃什么」健康饮食助手，只服务一位用户。',
    '【用户档案】',
    `- 身高 ${PROFILE.height}cm，体重 ${PROFILE.weight}kg（${PROFILE.weight * 2} 斤），目标 ${PROFILE.goal}kg（${PROFILE.goal * 2} 斤）。${PROFILE.note}。`,
    `- 食欲状况：${PROFILE.appetite}。必须推荐清爽开胃、好消化、小份的食物，并主动支持少食多餐。`,
    `- 饮食习惯：${PROFILE.pattern}。`,
    `- 外卖：${PROFILE.takeout}。`,
    `- 甜品：${PROFILE.dessert}。`,
    '',
    '【健康红线（100% 遵守，不可违反）】',
    ...PROFILE.redLines.map((r, i) => `${i + 1}. ${r}`),
    '',
    '【回复格式】只输出以下四段，简洁中文：',
    '【主选】食物名（外卖店名或 1 句话做法）',
    '【备选】食物名',
    '【热量】约 xxx kcal',
    '【提示】1~2 条健康提示'
  ].join('\n');
}

/* ---------- 转盘扇区与候选库 ---------- */
/* 每个食物对象：
 *   n     食物名
 *   t     类型：'外卖' | '做' | '加餐' | '随便'
 *   kcal  热量范围
 *   tips  健康提示
 *   why   为什么适合你（可选）
 *   how   做法简述（自己做类）
 *   shop  可选的外卖店/渠道（外卖类）
 *   soft  好消化、没胃口也吃得下（可选）
 */
const SECTORS = [
  {
    id: 'light_takeout', label: '外卖·清淡', emoji: '🥗',
    color: '#B8E6D8', pool: [
      { n: '虾仁砂锅粥', t: '外卖', shop: '潮汕砂锅粥店', kcal: '约 300~400', soft: true,
        tips: ['备注少油少猪油', '配一小碟咸菜就够，别加腊味'], why: '暖胃好消化，没胃口也吃得下' },
      { n: '清蒸鲈鱼套餐', t: '外卖', shop: '粤式蒸菜馆', kcal: '约 400~500',
        tips: ['嘱咐店家不要淋滚油', '米饭要小碗，多夹青菜'] },
      { n: '白切鸡饭（去皮）', t: '外卖', shop: '粤式烧腊店（选白切不选烧鸭）', kcal: '约 400~500',
        tips: ['鸡皮全部去掉再吃', '蘸姜蓉，别蘸油碟'], why: '蛋白质足、脂肪低，去皮后很清爽' },
      { n: '清汤云吞（小碗）', t: '外卖', shop: '馄饨店', kcal: '约 300~400', soft: true,
        tips: ['选清汤不选红油', '控制在 10 个以内'] },
      { n: '关东煮（萝卜/魔芋/豆腐/蛋）', t: '外卖', shop: '便利店', kcal: '约 200~300', soft: true,
        tips: ['少选油炸丸子', '汤喝一两口就好，钠高'], why: '便利店随时有，饿了马上能垫一口' },
      { n: '豆腐脑 + 茶叶蛋', t: '外卖', shop: '早餐店', kcal: '约 250~300', soft: true,
        tips: ['少放卤汁和辣油'] },
      { n: '凉拌黄瓜/凉拌木耳', t: '做', kcal: '约 80~120', soft: true,
        how: '黄瓜拍碎 + 蒜末 + 醋 + 少量生抽，冷藏 10 分钟', tips: ['开胃第一名，没胃口先来一口'] },
      { n: '口水鸡（少油版）', t: '外卖', shop: '川菜馆（备注少油）', kcal: '约 300~400',
        tips: ['去皮吃', '备注少油少辣油'] },
      { n: '白灼菜心', t: '做', kcal: '约 60~100',
        how: '菜心焯水 1 分钟，淋薄盐生抽', tips: ['配个蛋或鸡胸就是一顿'] },
      { n: '皮蛋豆腐', t: '做', kcal: '约 150~200', soft: true,
        how: '嫩豆腐切块 + 皮蛋切丁，淋生抽醋汁', tips: ['豆腐蛋白优秀', '别加太多香油'] }
    ]
  },
  {
    id: 'mcd', label: '外卖·麦肯', emoji: '🍔',
    color: '#FFD9B3', pool: [
      { n: '板烧鸡腿堡 + 无糖可乐 + 玉米杯', t: '外卖', shop: '麦当劳', kcal: '约 500~600', big: true,
        tips: ['板烧是烤的不是炸的，麦肯里首选', '酱料备注减半或吃前刮掉一半'], why: '热量可控的汉堡套餐' },
      { n: '麦辣鸡腿堡（去皮）+ 无糖可乐', t: '外卖', shop: '麦当劳', kcal: '约 450~550', big: true,
        tips: ['面衣和鸡皮扒掉再吃', '备注少酱'] },
      { n: '原味鸡·只吃鸡胸两块（去皮）', t: '外卖', shop: '肯德基', kcal: '约 250~350（两小块）',
        tips: ['只挑鸡胸部位，皮全扔掉', '搭配玉米杯或沙拉杯'] },
      { n: '吉士蛋麦满分 + 黑咖啡', t: '外卖', shop: '麦当劳早餐', kcal: '约 300~350',
        tips: ['薯饼换成玉米杯', '咖啡不加糖和奶'], why: '早餐时段的高蛋白选择' },
      { n: '小份薯条（偶尔解馋）', t: '外卖', shop: '麦当劳/肯德基', kcal: '约 230', junk: true,
        tips: ['只在特别想吃的时候点', '配无糖可乐，别多蘸番茄酱'] },
      { n: '玉米杯 / 蔬菜沙拉杯（加购）', t: '外卖', shop: '麦当劳/肯德基', kcal: '约 80~120',
        tips: ['用它把套餐里的薯条换掉'] },
      { n: '麦香鱼（去酱）', t: '外卖', shop: '麦当劳', kcal: '约 300~400',
        tips: ['酱去掉一半，配玉米杯'] },
      { n: '双层吉士堡（去酱）', t: '外卖', shop: '麦当劳', kcal: '约 400~500',
        tips: ['备注少酱或去掉一层吉士'] }
    ]
  },
  {
    id: 'noodle', label: '面/粉/饺子', emoji: '🍜',
    color: '#F6E7A9', pool: [
      { n: '清汤云吞面', t: '外卖', shop: '面馆', kcal: '约 350~450', soft: true,
        tips: ['不加油渣/猪油', '面吃一半也行，重点是别饿过劲'] },
      { n: '西红柿鸡蛋面', t: '做', kcal: '约 400~500',
        how: '番茄炒出沙 + 水烧开 + 打 2 个蛋 + 一把面', tips: ['蛋放 2 个', '面少一点，汤喝半碗'] },
      { n: '三鲜/虾仁水饺（12 个内）', t: '外卖', shop: '饺子馆', kcal: '约 400~500',
        tips: ['煮或蒸，不煎', '蘸醋碟，不蘸麻酱'] },
      { n: '清汤牛肉粉（小份）', t: '外卖', shop: '米粉店', kcal: '约 400~500',
        tips: ['少放辣油', '肉多点、粉少点'] },
      { n: '鸡丝凉面 / 荞麦冷面', t: '外卖', shop: '面馆/韩餐店', kcal: '约 350~450',
        tips: ['调料少放糖', '多要黄瓜丝、豆芽'] },
      { n: '瘦肉粥 + 2 个小笼包', t: '外卖', shop: '早餐店', kcal: '约 350~400', soft: true,
        tips: ['小笼包 2 个打住', '粥里别加配料油'] },
      { n: '螺蛳粉（少油少辣）', t: '外卖', shop: '螺蛳粉店', kcal: '约 400~500',
        tips: ['备注少油少辣', '汤别喝光（钠高）'], why: '你爱吃螺蛳粉，这样点最解馋又不胖' },
      { n: '云南米线（清汤）', t: '外卖', shop: '米线店', kcal: '约 350~450', soft: true,
        tips: ['选清汤过桥/砂锅米线，别选酸辣重油'] },
      { n: '羊肉粉', t: '外卖', shop: '羊肉粉店', kcal: '约 400~500',
        tips: ['多肉少粉、清汤', '少放油辣子'] },
      { n: '广西老友粉（少油）', t: '外卖', shop: '老友粉店', kcal: '约 400~500',
        tips: ['备注少油少辣'] },
      { n: '兰州牛肉面（清汤）', t: '外卖', shop: '兰州拉面馆', kcal: '约 350~450',
        tips: ['毛细小份，汤喝半碗', '多加萝卜少要油'] },
      { n: '阳春面', t: '做', kcal: '约 300~400',
        how: '面条煮好，清汤 + 生抽 + 葱花，加个蛋', tips: ['不放猪油/葱油，清淡版'] },
      { n: '葱油拌面（少油）', t: '外卖', shop: '面馆（备注少油）', kcal: '约 400~500',
        tips: ['备注少油少酱'] },
      { n: '肠粉', t: '外卖', shop: '肠粉店', kcal: '约 250~350',
        tips: ['酱汁少淋，加蛋加菜'] },
      { n: '炒河粉（少油）', t: '外卖', shop: '粉面店（备注少油）', kcal: '约 400~500',
        tips: ['备注少油，选瘦肉版本'] }
    ]
  },
  {
    id: 'cook', label: '自己炒菜', emoji: '🍳',
    color: '#FFBFBF', pool: [
      { n: '番茄炒蛋 + 小碗米饭', t: '做', kcal: '约 400~500',
        how: '2 个蛋 + 1 个番茄，油少放，糖放 1 小勺或不放', tips: ['蛋 2 个蛋白够', '配个焯水青菜更完美'] },
      { n: '青椒肉丝 + 米饭', t: '做', kcal: '约 400~500',
        how: '里脊切丝先滑油盛出，再下青椒快炒 1 分钟', tips: ['肉丝用瘦里脊'] },
      { n: '蚝油生菜 + 煎鸡胸', t: '做', kcal: '约 300~400',
        how: '生菜焯水 30 秒淋蚝油；鸡胸切片少油煎熟', tips: ['鸡胸煎前用盐+黑胡椒腌 10 分钟'] },
      { n: '蒜蓉西兰花 + 虾仁', t: '做', kcal: '约 250~350',
        how: '西兰花焯水，蒜末少油爆香下虾仁，1 分钟出锅', tips: ['虾仁蛋白优秀，配半碗杂粮饭'] },
      { n: '香菇滑鸡（去皮）+ 米饭', t: '做', kcal: '约 400~500',
        how: '鸡腿去皮切块，和香菇一起大火蒸 15 分钟', tips: ['鸡皮一定去掉'] },
      { n: '麻婆豆腐（少油版）', t: '做', kcal: '约 250~350',
        how: '豆腐焯水，豆瓣酱少放，不勾重油', tips: ['豆瓣酱减半', '配半碗杂粮饭'] },
      { n: '杂粮饭 + 时蔬炒鸡胸', t: '做', kcal: '约 400~500',
        how: '杂粮饭预约煮好；鸡胸切片少油煎，配焯水蔬菜', tips: ['一次煮一周的量分装冷冻', '鸡胸别煎老'] },
      { n: '手撕包菜', t: '做', kcal: '约 150~250',
        how: '包菜手撕，蒜片干辣椒爆香大火快炒', tips: ['少油少盐'] },
      { n: '宫保鸡丁（少油）', t: '做', kcal: '约 350~450',
        how: '鸡胸切丁滑炒，花生少放，糖减半', tips: ['糖和油都减半'] },
      { n: '鱼香肉丝（少油）', t: '做', kcal: '约 350~450',
        how: '里脊丝 + 木耳笋丝，醋香为主少放糖', tips: ['用醋提味，糖减半'] },
      { n: '芹菜香干', t: '做', kcal: '约 150~250',
        how: '芹菜段 + 香干丝大火快炒', tips: ['少油'] },
      { n: '韭菜炒蛋', t: '做', kcal: '约 200~300',
        how: '韭菜切段 + 2 个蛋，快炒', tips: ['少油'] },
      { n: '蒜蓉空心菜', t: '做', kcal: '约 100~200',
        how: '空心菜大火快炒 1 分钟', tips: ['少油少盐'] },
      { n: '辣椒炒肉（湘）', t: '做', kcal: '约 350~450',
        how: '瘦肉片 + 青椒，少油快炒', tips: ['瘦肉别用五花'] },
      { n: '农家小炒肉（少油）', t: '做', kcal: '约 350~450',
        how: '瘦肉 + 蒜苗/青椒，少油', tips: ['去皮瘦版，少酱油'] },
      { n: '黑三剁（云南）', t: '做', kcal: '约 250~350',
        how: '肉末 + 玫瑰大头菜 + 青椒碎炒香', tips: ['少油，配杂粮饭'] },
      { n: '青椒炒菌菇（云南）', t: '做', kcal: '约 150~250',
        how: '菌菇切片 + 青椒快炒', tips: ['菌菇鲜味足，少油即可'] }
    ]
  },
  {
    id: 'hotpot', label: '火锅/冒菜', emoji: '🍲',
    color: '#D3C6EF', pool: [
      { n: '清汤/番茄锅 一人小火锅', t: '做', kcal: '约 500~650', big: true,
        how: '超市清汤锅底 + 青菜 + 豆腐 + 虾滑 + 肥牛 100g', tips: ['蘸料用蒜泥+醋+少量酱油，别碰麻酱', '丸子换成虾滑/鲜肉片'] },
      { n: '冒菜（选菜式）', t: '外卖', shop: '冒菜店', kcal: '约 400~550', big: true,
        tips: ['多选菜/豆腐/木耳，少选油炸丸子', '备注少油少辣'] },
      { n: '番茄锅涮牛肉片 + 青菜', t: '做', kcal: '约 450~550', big: true,
        how: '番茄锅底煮开，先涮青菜垫肚子，再涮瘦牛肉片', tips: ['先蔬菜后肉，肉 150g 内'] },
      { n: '便利店关东煮 + 魔芋', t: '外卖', shop: '便利店', kcal: '约 250~350',
        tips: ['选菜类豆制品，避开油炸串'] },
      { n: '牛蛙火锅（清汤/微辣）', t: '做', kcal: '约 500~650',
        how: '清汤锅底 + 牛蛙 + 蔬菜豆腐', tips: ['选清汤锅底、牛蛙去皮、少油'] },
      { n: '胖哥俩肉蟹煲（牛蛙煲）', t: '外卖', shop: '胖哥俩', kcal: '约 550~700', big: true,
        tips: ['备注少油少酱', '两人分或留一半当加餐'], why: '你爱吃牛蛙煲，这样点最稳妥' },
      { n: '麻辣烫（清汤底）', t: '外卖', shop: '麻辣烫店', kcal: '约 350~500',
        tips: ['选清汤/骨汤底，别选红油', '多选菜和豆制品，少丸子'] },
      { n: '菌菇火锅', t: '做', kcal: '约 400~550',
        how: '菌菇汤底 + 蔬菜豆腐 + 少量肉片', tips: ['鲜味足，蘸料用蒜泥醋'] },
      { n: '潮汕牛肉火锅', t: '做', kcal: '约 450~600',
        how: '牛骨清汤 + 吊龙/嫩肉 + 青菜', tips: ['肉 150g 内，沙茶蘸料少一点'] },
      { n: '酸菜鱼（少油）', t: '外卖', shop: '酸菜鱼店（备注少油）', kcal: '约 400~550',
        tips: ['备注少油', '鱼片吃完，汤少喝'] },
      { n: '韩式部队锅（少芝士）', t: '做', kcal: '约 500~650',
        how: '午餐肉少量 + 豆腐 + 年糕 + 泡菜 + 拉面半包', tips: ['午餐肉/火腿少放，芝士减半'] }
    ]
  },
  {
    id: 'soup', label: '快手汤/粥', emoji: '🥣',
    color: '#AECBEB', pool: [
      { n: '皮蛋瘦肉粥', t: '做', kcal: '约 300~400', soft: true,
        how: '米 + 皮蛋 + 瘦肉丝，少油慢熬 25 分钟', tips: ['自己煮最健康，外卖记得备注少油'] },
      { n: '小米南瓜粥 + 水煮蛋', t: '做', kcal: '约 250~350', soft: true,
        how: '小米南瓜同煮 20 分钟', tips: ['好消化，没胃口时首选'] },
      { n: '紫菜蛋花汤 + 玉米/红薯', t: '做', kcal: '约 200~300',
        how: '水开下紫菜，淋入蛋液，加点虾皮', tips: ['加一小把虾皮补钙'] },
      { n: '冬瓜丸子汤', t: '做', kcal: '约 250~350', soft: true,
        how: '冬瓜切片 + 少量肉丸，煮 10 分钟', tips: ['丸子少放，冬瓜管饱'] },
      { n: '番茄鸡蛋汤面', t: '做', kcal: '约 400~450',
        how: '番茄炒出沙 + 水 + 蛋 + 面，一锅出', tips: ['面吃小份'] },
      { n: '银耳羹', t: '做', kcal: '约 80~120', soft: true,
        how: '银耳泡发 + 红枣枸杞，炖 30 分钟', tips: ['不放糖或少糖'] },
      { n: '绿豆汤', t: '做', kcal: '约 80~120', soft: true,
        how: '绿豆煮到开花', tips: ['少糖，冰镇更开胃'] },
      { n: '菌菇汤', t: '做', kcal: '约 100~200',
        how: '各种菌菇煮 15 分钟', tips: ['天然鲜味，不用加味精'] },
      { n: '鲫鱼豆腐汤', t: '做', kcal: '约 200~300',
        how: '鲫鱼少油煎一下，加豆腐炖到汤白', tips: ['少油煎，鱼肉蛋白优秀'] }
    ]
  },
  {
    id: 'snack', label: '加餐小食', emoji: '🍎', hide: true,
    color: '#FFC7D6', pool: [
      { n: '无糖酸奶 1 杯', t: '加餐', kcal: '约 80~100', soft: true,
        tips: ['选无糖/低糖原味'] },
      { n: '水煮蛋 1 个', t: '加餐', kcal: '约 70~80', soft: true,
        tips: ['饿了就吃，别等饿过劲'] },
      { n: '纯牛奶 1 盒', t: '加餐', kcal: '约 130', soft: true,
        tips: ['选纯奶，不选早餐奶/甜牛奶'] },
      { n: '苹果 / 蓝莓 / 圣女果', t: '加餐', kcal: '约 60~100',
        tips: ['水果是好加餐，但果汁不算'] },
      { n: '原味坚果一小把', t: '加餐', kcal: '约 100~120',
        tips: ['10~15 颗，多了就是油'] },
      { n: '即食鸡胸肉半袋', t: '加餐', kcal: '约 100',
        tips: ['买原味的，别买油炸/重口味的'] },
      { n: '黄瓜 / 胡萝卜条', t: '加餐', kcal: '约 30~50',
        tips: ['蘸点无糖酸奶也很好吃'] },
      { n: '银耳羹（无糖/低糖）', t: '加餐', kcal: '约 80~120', soft: true,
        tips: ['选无糖或自己煮', '别配甜腻小料'] },
      { n: '龟苓膏（小份）', t: '加餐', kcal: '约 60~90', soft: true,
        tips: ['微苦回甘，比冰淇淋健康'] },
      { n: '无糖酸奶水果捞', t: '加餐', kcal: '约 120~160',
        tips: ['水果切小块，别加炼乳和糖浆'] },
      { n: '无糖豆浆 1 杯', t: '加餐', kcal: '约 80~100', soft: true,
        tips: ['选原味无糖'] },
      { n: '小蛋糕/甜品（小份，偶尔）', t: '加餐', kcal: '约 150~250', dessert: true,
        tips: ['你偶尔会想吃，可以！但选最小份或分享装', '配无糖茶/黑咖啡，一周不超过 1~2 次'],
        why: '少量甜品解馋没问题，控制频率就行' }
    ]
  },
  {
    id: 'fridge', label: '看冰箱', emoji: '🧊', hide: true,
    color: '#C3E8C5', pool: [
      { n: '鸡蛋 + 绿叶菜 → 番茄炒蛋 / 紫菜蛋花汤', t: '做', kcal: '约 300~400',
        tips: ['15 分钟搞定'] },
      { n: '肉类 → 青椒肉丝 / 香菇滑鸡', t: '做', kcal: '约 400~500',
        tips: ['肉选瘦肉，鸡腿去皮'] },
      { n: '豆腐 → 凉拌豆腐 / 豆腐汤', t: '做', kcal: '约 250~350',
        tips: ['豆腐是优质蛋白，常备'] },
      { n: '主食 → 蛋炒饭（少油）/ 煮面 + 青菜蛋', t: '做', kcal: '约 400~500',
        tips: ['少油少盐，配个青菜'] },
      { n: '剩菜 → 加热吃 + 另补一份青菜', t: '做', kcal: '约 300~400',
        tips: ['别二次油炸，加热透就行'] }
    ]
  },
  {
    id: 'salad', label: '轻食沙拉', emoji: '🥗',
    color: '#C9E9C2', pool: [
      { n: '鸡胸/虾仁轻食沙拉', t: '外卖', shop: '轻食沙拉店', kcal: '约 350~450',
        tips: ['酱汁另放，只淋一半', '选油醋汁，不选蛋黄酱/千岛酱'], why: '蔬菜+蛋白，最标准的减脂搭配' },
      { n: '虾仁藜麦碗', t: '外卖', shop: '轻食店', kcal: '约 350~450',
        tips: ['藜麦优质碳水，虾仁补蛋白'] },
      { n: '牛油果鸡胸波奇饭', t: '外卖', shop: '波奇饭/轻食店', kcal: '约 400~500',
        tips: ['牛油果吃半颗就够'] },
      { n: '凯撒鸡肉沙拉（少酱）', t: '外卖', shop: '轻食店', kcal: '约 300~400',
        tips: ['酱汁减半，面包丁挑掉一半'] },
      { n: '全麦鸡胸三明治', t: '外卖', shop: '轻食店/面包店', kcal: '约 300~400', soft: true,
        tips: ['选全麦面包，少抹酱'] },
      { n: '蔬菜鸡蛋卷', t: '做', kcal: '约 250~350',
        how: '鸡蛋摊成蛋皮，卷入焯水蔬菜丝', tips: ['全麦饼一卷就是一顿轻午餐'] }
    ]
  },
  {
    id: 'seafood', label: '海鲜·蒸菜', emoji: '🦐',
    color: '#9FD4CD', pool: [
      { n: '清蒸鲈鱼 + 米饭', t: '做', kcal: '约 350~450',
        how: '鱼身划刀铺姜片，水开蒸 8 分钟，淋蒸鱼豉油', tips: ['不浇热油，少一勺油'] },
      { n: '白灼基围虾', t: '做', kcal: '约 150~250',
        how: '水开下虾煮 3 分钟，蘸姜醋汁', tips: ['蘸姜醋不蘸酱油膏'] },
      { n: '蒜蓉粉丝虾（少油）', t: '做', kcal: '约 250~350',
        how: '虾开背铺粉丝，蒜蓉少油炒香后蒸 6 分钟', tips: ['蒜蓉少油，别淋热油'] },
      { n: '虾仁蒸蛋', t: '做', kcal: '约 150~200', soft: true,
        how: '2 蛋 + 温水打散，上锅蒸 8 分钟，放虾仁再蒸 3 分钟', tips: ['没胃口也吃得下的软嫩蛋白'] },
      { n: '清蒸鸡/蒸鸡胸', t: '做', kcal: '约 300~400',
        how: '鸡腿去皮或鸡胸，铺姜片上锅蒸 15 分钟', tips: ['出锅淋少量蒸鱼豉油即可'] },
      { n: '蒸红薯/南瓜/玉米', t: '做', kcal: '约 150~250', soft: true,
        how: '切块上锅蒸 20 分钟', tips: ['当主食，配个蛋或虾就是一顿'] },
      { n: '汽锅鸡（云南）', t: '做', kcal: '约 300~400',
        how: '鸡肉 + 姜，汽锅蒸 40 分钟', tips: ['原汤原味，不用放油'] },
      { n: '剁椒鱼头（少油）', t: '做', kcal: '约 350~450',
        how: '鱼头铺少量剁椒，蒸 12 分钟', tips: ['剁椒减半，不浇热油'] }
    ]
  },
  {
    id: 'gaifan', label: '盖饭·杂粮', emoji: '🍚',
    color: '#EED9AE', pool: [
      { n: '照烧鸡腿饭（去皮）', t: '外卖', shop: '日式简餐/外卖店', kcal: '约 450~550',
        tips: ['鸡皮去掉', '备注少照烧汁（糖多）'], why: '想吃盖饭时的低糖版本' },
      { n: '牛丼（少汁版）', t: '外卖', shop: '日式简餐', kcal: '约 450~550',
        tips: ['备注少汁（酱汁糖多）', '多点蔬菜'] },
      { n: '鸡胸杂粮饭套餐', t: '外卖', shop: '轻食店', kcal: '约 400~500',
        tips: ['酱料另放只淋一半'] },
      { n: '亲子丼（鸡肉鸡蛋盖饭）', t: '做', kcal: '约 400~500',
        how: '鸡腿肉煎熟 + 洋葱，淋蛋液焖 2 分钟盖饭上', tips: ['少放日式酱油和糖'] },
      { n: '糙米蔬菜鸡胸饭', t: '做', kcal: '约 400~500',
        how: '糙米预约煮好，鸡胸煎熟切块，配焯水蔬菜', tips: ['一次煮一周杂粮饭分装冷冻'] },
      { n: '咖喱鸡肉饭', t: '做', kcal: '约 450~550',
        how: '鸡胸 + 胡萝卜土豆，咖喱块放半块', tips: ['咖喱块减半（油脂多）', '配杂粮饭'] },
      { n: '海南鸡饭（去皮）', t: '外卖', shop: '海南鸡饭/简餐店', kcal: '约 450~550',
        tips: ['鸡皮去掉，饭要白饭'] }
    ]
  },
  {
    id: 'kebab', label: '烧烤/炸鸡', emoji: '🍗',
    color: '#EBC0A8', pool: [
      { n: '烤鸡腿串（去皮）', t: '外卖', shop: '烧烤店（备注少油少辣）', kcal: '约 200~300',
        tips: ['去皮、少刷油', '少蘸料'], why: '偶尔解馋的烤物，去皮后脂肪大减' },
      { n: '烤蔬菜串/烤金针菇', t: '外卖', shop: '烧烤店（备注少油）', kcal: '约 100~200',
        tips: ['让店家少刷油少刷酱'] },
      { n: '烤鱼（少油少辣）', t: '外卖', shop: '烤鱼店（选清烤）', kcal: '约 300~400',
        tips: ['选清烤不选重油烤', '鱼肉是优质蛋白'] },
      { n: '锡纸金针菇/锡纸豆腐', t: '外卖', shop: '烧烤店（备注少油）', kcal: '约 150~250',
        tips: ['少油少酱'] },
      { n: '炸鸡（去皮吃，小份）', t: '外卖', shop: '炸鸡店', kcal: '约 300~400',
        tips: ['面衣和皮扒掉再吃', '少蘸酱，配无糖饮料'], why: '想吃炸鸡就吃，去皮后热量砍半' },
      { n: '鸡米花/麦乐鸡（小份）', t: '外卖', shop: '炸鸡店', kcal: '约 250~350',
        tips: ['选小份', '配无糖饮料'] },
      { n: '香辣鸡排（去皮）', t: '外卖', shop: '炸鸡店', kcal: '约 350~450',
        tips: ['去皮吃', '备注少辣粉少酱'] }
    ]
  },
  {
    id: 'breakfast', label: '快手早餐', emoji: '🍳',
    color: '#F5CFDD', pool: [
      { n: '燕麦粥 + 水煮蛋', t: '做', kcal: '约 250~350', soft: true,
        how: '即食燕麦加热水泡 3 分钟，配水煮蛋', tips: ['选原味燕麦，不加糖'] },
      { n: '鸡蛋卷/厚蛋烧', t: '做', kcal: '约 150~250',
        how: '2 蛋打散，分次摊卷成厚蛋烧', tips: ['少油，蛋液里加点牛奶更嫩'] },
      { n: '豆浆 + 茶叶蛋 + 包子（1 个）', t: '外卖', shop: '早餐店', kcal: '约 300~400', soft: true,
        tips: ['豆浆选无糖', '包子选素馅或小个的'] },
      { n: '牛奶燕麦 + 蓝莓', t: '做', kcal: '约 250~350', soft: true,
        how: '燕麦 + 牛奶微波 2 分钟，加一把蓝莓', tips: ['牛奶选纯奶'] },
      { n: '蒸红薯 + 水煮蛋', t: '做', kcal: '约 200~300', soft: true,
        how: '红薯提前蒸好，早上热一下', tips: ['红薯是优质慢碳水'] }
    ]
  },
  {
    id: 'japan', label: '日韩料理', emoji: '🍣',
    color: '#F2E3C9', pool: [
      { n: '寿司拼盘（三文鱼/鸡胸卷）', t: '外卖', shop: '日料店', kcal: '约 350~450',
        tips: ['少蘸酱油', '6-8 贯就好'] },
      { n: '紫菜包饭', t: '外卖', shop: '韩餐店', kcal: '约 350~450',
        tips: ['选少酱版本', '配小份'] },
      { n: '韩式冷面', t: '外卖', shop: '韩餐店', kcal: '约 350~450',
        tips: ['汤料减半，少放辣酱'] },
      { n: '韩式炸酱面', t: '外卖', shop: '韩餐店', kcal: '约 400~500',
        tips: ['备注少酱少油'] },
      { n: '辛拉面（少放料包）', t: '做', kcal: '约 350~450',
        how: '面煮好，料包只用一半，加蛋加青菜', tips: ['料包只用一半，钠和油都减半'] },
      { n: '日式乌冬面', t: '外卖', shop: '日料店', kcal: '约 350~450',
        tips: ['选清汤乌冬'] },
      { n: '寿喜锅（少糖）', t: '外卖', shop: '日料店', kcal: '约 500~650', big: true,
        tips: ['备注少糖少油', '肉 150g 内，多涮蔬菜'] }
    ]
  },
  {
    id: 'street', label: '街边小吃', emoji: '🌯',
    color: '#F6D9B0', pool: [
      { n: '手抓饼（少酱）', t: '外卖', shop: '路边摊/早餐店', kcal: '约 350~450',
        tips: ['少刷酱，加蛋不加肠'] },
      { n: '烤冷面', t: '外卖', shop: '路边摊', kcal: '约 300~400',
        tips: ['少酱少糖，别加里脊肉'] },
      { n: '煎饼果子（少酱）', t: '外卖', shop: '路边摊', kcal: '约 300~400',
        tips: ['少酱，加蛋加菜'] },
      { n: '鸡蛋灌饼（少油）', t: '外卖', shop: '路边摊', kcal: '约 350~450',
        tips: ['备注少油，别加油条'] },
      { n: '肉夹馍（瘦）', t: '外卖', shop: '陕西小吃店', kcal: '约 350~450',
        tips: ['选瘦肉的，别加肥油'] },
      { n: '凉皮（少辣少油）', t: '外卖', shop: '凉皮店', kcal: '约 250~350',
        tips: ['备注少油少辣，调料减半'] }
    ]
  }
];

/* 冰箱食材 → 菜式映射（看冰箱扇区 + 规则引擎用） */
const FRIDGE_DISHES = {
  '鸡蛋': ['番茄炒蛋', '紫菜蛋花汤', '水煮蛋'],
  '蔬菜': ['蚝油生菜', '蒜蓉西兰花', '蔬菜汤'],
  '肉类': ['青椒肉丝', '香菇滑鸡（去皮）', '炒牛肉'],
  '豆腐': ['凉拌豆腐', '豆腐汤', '香煎豆腐（少油）'],
  '海鲜': ['清蒸鱼', '虾仁炒蛋'],
  '主食': ['蛋炒饭（少油）', '煮面+青菜蛋', '杂粮饭'],
  '剩菜': ['加热吃，另补一份青菜'],
  '没有': ['炒个蛋 + 青菜 + 一碗饭，15 分钟搞定。明天买菜清单：鸡蛋、绿叶菜、鸡胸肉、豆腐']
};

/* 通用提示库（按场景叠加） */
const GENERAL_TIPS = {
  amount_small: '少食多餐：这顿吃小份，1~2 小时后加个餐（酸奶 / 鸡蛋 / 水果）',
  appetite_bad: '先吃半份开开胃，别等饿过劲',
  night: '睡前别吃太饱，选清淡好消化的',
  cook: '做饭本身就是活动量，加分',
  fridge_leftover: '剩菜加热吃，别再油炸',
  split_big: '这份偏大，拆成两顿吃：先吃一半，剩下 1~2 小时后当加餐',
  always_snack: '少食多餐：这一顿小份吃，1~2 小时后垫一口加餐（酸奶 / 鸡蛋 / 水果）'
};

/* ---------- 规则引擎（无 API key 时也能推荐） ---------- */
function timeSlotOf(h) {
  if (h >= 6 && h < 9)   return { name: '早餐', key: 'morning', light: false };
  if (h >= 9 && h < 11)  return { name: '上午加餐', key: 'snack', light: true };
  if (h >= 11 && h < 14) return { name: '午餐', key: 'noon', light: false };
  if (h >= 14 && h < 17) return { name: '下午加餐/点心', key: 'snack', light: true };
  if (h >= 17 && h < 20) return { name: '晚餐', key: 'evening', light: false };
  if (h >= 20 && h < 22) return { name: '晚间', key: 'evening', light: true };
  return { name: '深夜', key: 'late', light: true };
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* 输入：{ appetite:'很差'|'一般'|'不错', amount:'少'|'中'|'多',
 *        cook:'想'|'不想'|'都行', fridge:[食材...], hour:number }
 * 返回：{ main, backup, reason, extraTips }
 */
function recommendByRules(input) {
  const slot = timeSlotOf(input.hour);
  const tips = [];

  /* 1. 深夜/加餐时段：一律轻食 */
  if (slot.light) {
    const pool = input.hour >= 22
      ? SECTORS.find(s => s.id === 'snack').pool
      : SECTORS.find(s => s.id === 'snack').pool.concat(SECTORS.find(s => s.id === 'soup').pool.filter(f => f.soft));
    const main = pickRandom(pool);
    const backup = pickRandom(pool.filter(f => f !== main));
    if (input.hour >= 22) tips.push(GENERAL_TIPS.night);
    tips.push('现在是加餐时段：饿了就吃一小份，别等饿过劲');
    return { main, backup, reason: `现在是${slot.name}时段，推荐轻食垫一口：`, extraTips: tips };
  }

  /* 2. 正餐时段 */
  let mainPool = [], backupPool = [];

  if (input.cook === '想') {
    const cookS = SECTORS.find(s => s.id === 'cook').pool;
    const soupS = SECTORS.find(s => s.id === 'soup').pool;
    if (input.fridge && input.fridge.length) {
      const dishes = new Set();
      input.fridge.forEach(k => (FRIDGE_DISHES[k] || []).forEach(d => dishes.add(d)));
      if (dishes.size) {
        const picks = [...dishes].map(name => ({ n: name, t: '做', kcal: '约 300~500', tips: ['根据冰箱现有食材匹配'] }));
        mainPool = picks;
      }
    }
    if (!mainPool.length) mainPool = cookS.slice();
    backupPool = soupS.concat(mainPool);
    tips.push(GENERAL_TIPS.cook);
  } else if (input.cook === '不想') {
    mainPool = SECTORS.find(s => s.id === 'light_takeout').pool;
    backupPool = SECTORS.find(s => s.id === 'noodle').pool;
    if (input.appetite === '不错') {
      const mcdPool = SECTORS.find(s => s.id === 'mcd').pool;
      mainPool = mainPool.concat(input.allowJunk ? mcdPool : mcdPool.filter(f => !f.junk));
    }
  } else { /* 都行 */
    mainPool = [].concat(
      SECTORS.find(s => s.id === 'cook').pool,
      SECTORS.find(s => s.id === 'light_takeout').pool,
      SECTORS.find(s => s.id === 'noodle').pool
    );
    if (input.appetite === '不错') {
      const mcdPool = SECTORS.find(s => s.id === 'mcd').pool;
      mainPool = mainPool.concat(input.allowJunk ? mcdPool : mcdPool.filter(f => !f.junk));
    }
    backupPool = SECTORS.find(s => s.id === 'soup').pool;
  }

  /* 3. 胃口很差 → 强制好消化 */
  if (input.appetite === '很差') {
    const softs = mainPool.filter(f => f.soft);
    if (softs.length) mainPool = softs;
    tips.push(GENERAL_TIPS.appetite_bad);
  }

  /* 4. 少食多餐是底层逻辑：胃口差/饭量少时绝不推荐大分量 */
  if (input.amount === '少' || input.appetite === '很差') {
    mainPool = mainPool.filter(f => !f.big);
    backupPool = backupPool.filter(f => !f.big);
  }

  const main = pickRandom(mainPool);
  const backup = pickRandom(backupPool.filter(f => f !== main));
  if (input.amount === '少') tips.push(GENERAL_TIPS.amount_small);
  if (main.big) tips.push(GENERAL_TIPS.split_big);
  else if (!slot.light) tips.push(GENERAL_TIPS.always_snack);
  if (input.fridge && input.fridge.includes('剩菜')) tips.push(GENERAL_TIPS.fridge_leftover);

  const why = `根据你现在的状态（${slot.name}、胃口${input.appetite}、饭量${input.amount}、${input.cook === '想' ? '想自己做饭' : input.cook === '不想' ? '不想做饭' : '做饭点外卖都行'}），推荐：`;
  return { main, backup, reason: why, extraTips: tips };
}

/* ---------- 时段感知（早晚自动切换推荐） ---------- */
/* key: morning 早餐 / noon 午餐 / evening 晚餐 / snack 加餐时段 / late 深夜 */
const SECTOR_SLOTS = {
  light_takeout: ['morning', 'noon', 'evening', 'snack'],
  mcd: ['morning', 'noon', 'evening'],
  noodle: ['noon', 'evening', 'snack'],
  cook: ['noon', 'evening'],
  hotpot: ['noon', 'evening'],
  soup: ['morning', 'noon', 'evening', 'snack', 'late'],
  snack: ['morning', 'noon', 'evening', 'snack', 'late'],
  fridge: ['morning', 'noon', 'evening'],
  salad: ['morning', 'noon', 'evening', 'snack'],
  seafood: ['noon', 'evening'],
  gaifan: ['noon', 'evening'],
  kebab: ['noon', 'evening'],
  breakfast: ['morning', 'snack'],
  japan: ['noon', 'evening', 'snack'],
  street: ['noon', 'evening', 'snack']
};

/* 当前时段适合落盘的扇区（转盘按它加权） */
function compatibleSectors(slotKey) {
  return SECTORS.filter(s => !SECTOR_SLOTS[s.id] || SECTOR_SLOTS[s.id].includes(slotKey));
}

/* ---------- 食材清单（自己做类 → 购物清单） ---------- */
const INGREDIENTS = {
  '番茄炒蛋 + 小碗米饭': ['番茄 1-2 个', '鸡蛋 2 个', '小碗米饭', '葱'],
  '青椒肉丝 + 米饭': ['猪里脊 150g', '青椒 2 个', '小碗米饭'],
  '蚝油生菜 + 煎鸡胸': ['生菜 1 颗', '鸡胸肉 1 块', '蚝油'],
  '蒜蓉西兰花 + 虾仁': ['西兰花 1 颗', '虾仁 150g', '大蒜 3 瓣'],
  '清蒸鲈鱼 + 米饭': ['鲈鱼 1 条', '姜 1 块', '蒸鱼豉油', '小碗米饭'],
  '香菇滑鸡（去皮）+ 米饭': ['鸡腿 2 个（去皮）', '干香菇 6 朵', '小碗米饭'],
  '西红柿鸡蛋面': ['番茄 1-2 个', '鸡蛋 2 个', '面条（小份）'],
  '番茄鸡蛋汤面': ['番茄 1-2 个', '鸡蛋 1-2 个', '面条（小份）'],
  '皮蛋瘦肉粥': ['皮蛋 1 个', '瘦肉丝 50g', '大米'],
  '小米南瓜粥 + 水煮蛋': ['小米', '南瓜', '鸡蛋 1 个'],
  '紫菜蛋花汤 + 玉米/红薯': ['紫菜', '鸡蛋 1 个', '虾皮', '玉米或红薯 1 根'],
  '冬瓜丸子汤': ['冬瓜 500g', '肉丸（少量）'],
  '清汤/番茄锅 一人小火锅': ['清汤/番茄锅底 1 包', '绿叶菜 1 把', '豆腐', '虾滑', '肥牛 100g'],
  '番茄锅涮牛肉片 + 青菜': ['番茄锅底 1 包', '瘦牛肉片 150g', '绿叶菜 1 把'],
  '鸡蛋 + 绿叶菜 → 番茄炒蛋 / 紫菜蛋花汤': ['鸡蛋', '绿叶菜', '番茄（可选）', '紫菜（可选）'],
  '肉类 → 青椒肉丝 / 香菇滑鸡': ['瘦肉或鸡腿（去皮）', '青椒 / 香菇'],
  '豆腐 → 凉拌豆腐 / 豆腐汤': ['豆腐 1 盒', '葱 / 香菜'],
  '主食 → 蛋炒饭（少油）/ 煮面 + 青菜蛋': ['米饭或面条', '鸡蛋', '绿叶菜'],
  '剩菜 → 加热吃 + 另补一份青菜': ['绿叶菜 1 把'],
  '凉拌黄瓜/凉拌木耳': ['黄瓜 1 根', '木耳（可选）', '蒜', '醋'],
  '白灼菜心': ['菜心 1 把', '薄盐生抽'],
  '皮蛋豆腐': ['嫩豆腐 1 盒', '皮蛋 1 个', '生抽', '醋'],
  '虾仁蒸蛋': ['鸡蛋 2 个', '虾仁 100g'],
  '麻婆豆腐（少油版）': ['豆腐 1 盒', '豆瓣酱（少量）', '葱'],
  '杂粮饭 + 时蔬炒鸡胸': ['杂粮米', '鸡胸肉 1 块', '时蔬 1 把'],
  '蔬菜鸡蛋卷': ['鸡蛋 2 个', '生菜/黄瓜/胡萝卜', '全麦饼 1 张（可选）'],
  '白灼基围虾': ['基围虾 200g', '姜', '醋'],
  '蒜蓉粉丝虾（少油）': ['虾 8-10 只', '粉丝 1 小把', '蒜'],
  '清蒸鸡/蒸鸡胸': ['鸡腿（去皮）或鸡胸', '姜'],
  '蒸红薯/南瓜/玉米': ['红薯 / 南瓜 / 玉米'],
  '亲子丼（鸡肉鸡蛋盖饭）': ['鸡腿或鸡胸', '鸡蛋 2 个', '洋葱', '米饭（小碗）'],
  '糙米蔬菜鸡胸饭': ['糙米', '鸡胸肉 1 块', '时蔬 1 把'],
  '燕麦粥 + 水煮蛋': ['即食燕麦', '鸡蛋 1 个'],
  '鸡蛋卷/厚蛋烧': ['鸡蛋 2 个', '牛奶 1 勺'],
  '牛奶燕麦 + 蓝莓': ['燕麦', '纯牛奶 1 盒', '蓝莓一把'],
  '蒸红薯 + 水煮蛋': ['红薯 1 个', '鸡蛋 1 个'],
  '阳春面': ['面条（小份）', '鸡蛋 1 个', '葱'],
  '手撕包菜': ['包菜 半个', '蒜', '干辣椒'],
  '宫保鸡丁（少油）': ['鸡胸肉 1 块', '花生（少量）', '干辣椒', '黄瓜丁'],
  '鱼香肉丝（少油）': ['猪里脊 150g', '木耳', '笋丝（可选）'],
  '芹菜香干': ['芹菜 1 把', '香干 2 块'],
  '韭菜炒蛋': ['韭菜 1 把', '鸡蛋 2 个'],
  '蒜蓉空心菜': ['空心菜 1 把', '蒜'],
  '辣椒炒肉（湘）': ['瘦肉 150g', '青椒 3 个', '蒜'],
  '农家小炒肉（少油）': ['瘦肉 150g', '蒜苗/青椒', '姜蒜'],
  '黑三剁（云南）': ['肉末 100g', '玫瑰大头菜', '青椒'],
  '青椒炒菌菇（云南）': ['菌菇 1 盒', '青椒 2 个'],
  '银耳羹': ['银耳 半朵', '红枣 3 颗', '枸杞'],
  '绿豆汤': ['绿豆 1 把'],
  '菌菇汤': ['各种菌菇 1 盒'],
  '鲫鱼豆腐汤': ['鲫鱼 1 条', '嫩豆腐 1 盒', '姜'],
  '汽锅鸡（云南）': ['鸡腿或半只鸡', '姜'],
  '剁椒鱼头（少油）': ['鱼头 1 个', '剁椒（少量）', '姜'],
  '牛蛙火锅（清汤/微辣）': ['牛蛙 2 只', '清汤锅底 1 包', '蔬菜豆腐'],
  '菌菇火锅': ['菌菇汤底 1 包', '蔬菜 1 把', '豆腐', '肉片 100g'],
  '潮汕牛肉火锅': ['牛骨清汤底', '吊龙/嫩肉 150g', '青菜 1 把'],
  '韩式部队锅（少芝士）': ['午餐肉（少量）', '豆腐', '年糕', '泡菜', '拉面半包', '芝士（减半）'],
  '咖喱鸡肉饭': ['鸡胸肉 1 块', '胡萝卜', '土豆', '咖喱块半块', '杂粮饭'],
  '辛拉面（少放料包）': ['辛拉面 1 包', '鸡蛋 1 个', '青菜 1 把']
};

/* ---------- 食谱库（自己做类：时间 + 步骤；食材见 INGREDIENTS） ---------- */
const RECIPES = {
  '番茄炒蛋 + 小碗米饭': { time: '15 分钟', steps: [
    '番茄切块，鸡蛋 2 个打散加一点点盐',
    '热锅少油，先炒鸡蛋至刚凝固盛出',
    '下番茄炒出沙，倒回鸡蛋，糖放 1 小勺或不放',
    '配小碗米饭，开吃'] },
  '青椒肉丝 + 米饭': { time: '20 分钟', steps: [
    '里脊切丝，加生抽、淀粉抓匀腌 10 分钟',
    '热锅少油滑炒肉丝至变色盛出',
    '下青椒丝大火快炒 1 分钟，倒回肉丝，翻匀出锅',
    '配小碗米饭'] },
  '蚝油生菜 + 煎鸡胸': { time: '20 分钟', steps: [
    '鸡胸切片，盐+黑胡椒腌 10 分钟',
    '生菜焯水 30 秒捞出，淋少量蚝油',
    '鸡胸少油煎至两面金黄、熟透',
    '一起吃，鸡胸是主力蛋白'] },
  '蒜蓉西兰花 + 虾仁': { time: '15 分钟', steps: [
    '西兰花掰小朵焯水 1 分钟，虾仁解冻',
    '蒜末少油爆香，下虾仁炒至变色',
    '倒回西兰花翻匀，加盐调味出锅',
    '配半碗杂粮饭'] },
  '清蒸鲈鱼 + 米饭': { time: '20 分钟', steps: [
    '鲈鱼两面划刀，铺姜片',
    '水开后上锅大火蒸 8 分钟',
    '倒掉盘中汁水，淋蒸鱼豉油，不浇热油',
    '配小碗米饭'] },
  '香菇滑鸡（去皮）+ 米饭': { time: '25 分钟', steps: [
    '鸡腿去皮切块，香菇提前泡发切片',
    '鸡块加生抽、料酒、淀粉抓匀',
    '和香菇一起大火蒸 15 分钟至熟',
    '配小碗米饭'] },
  '虾仁蒸蛋': { time: '15 分钟', steps: [
    '鸡蛋 2 个加温水打散，过筛更嫩',
    '盖保鲜膜上锅蒸 8 分钟',
    '放虾仁再蒸 3 分钟，淋一点生抽'] },
  '麻婆豆腐（少油版）': { time: '20 分钟', steps: [
    '豆腐切块焯水 1 分钟去豆腥',
    '豆瓣酱少量炒出红油，加水',
    '下豆腐煮 5 分钟，勾薄芡撒葱花',
    '配半碗杂粮饭'] },
  '杂粮饭 + 时蔬炒鸡胸': { time: '20 分钟（饭提前预约）', steps: [
    '杂粮米提前预约煮好，一次煮一周量分装冷冻',
    '鸡胸切片少油煎熟',
    '时蔬（西兰花/胡萝卜）焯水或快炒',
    '一起装盘'] },
  '西红柿鸡蛋面': { time: '15 分钟', steps: [
    '番茄切块炒出沙，加热水烧开',
    '打 2 个蛋进去（或先炒蛋再加水）',
    '下一小把面煮 3 分钟，盐调味',
    '汤喝半碗就好'] },
  '皮蛋瘦肉粥': { time: '30 分钟', steps: [
    '大米洗净，皮蛋切丁，瘦肉切丝',
    '水开后下米，小火熬 20 分钟',
    '放皮蛋和肉丝再煮 5 分钟，加盐',
    '少油少盐，暖胃'] },
  '小米南瓜粥 + 水煮蛋': { time: '25 分钟', steps: [
    '小米淘洗，南瓜切小块',
    '同煮 20 分钟至软烂',
    '配一个水煮蛋，蛋白管饱'] },
  '紫菜蛋花汤 + 玉米/红薯': { time: '10 分钟', steps: [
    '水开下紫菜、一小把虾皮',
    '淋入蛋液成蛋花，加盐',
    '配玉米或红薯当主食'] },
  '冬瓜丸子汤': { time: '20 分钟', steps: [
    '冬瓜去皮切片，肉丸少量',
    '水开下冬瓜煮 8 分钟',
    '下丸子再煮 5 分钟，调味出锅'] },
  '番茄鸡蛋汤面': { time: '15 分钟', steps: [
    '番茄炒出沙加水烧开',
    '淋蛋液成蛋花',
    '下一小份面煮 3 分钟，调味'] },
  '清汤/番茄锅 一人小火锅': { time: '25 分钟', steps: [
    '锅底烧开（清汤或番茄锅底）',
    '先涮青菜、豆腐垫肚子',
    '再涮虾滑、肥牛（100g 内）',
    '蘸料用蒜泥+醋+少量酱油，别碰麻酱'] },
  '番茄锅涮牛肉片 + 青菜': { time: '20 分钟', steps: [
    '番茄锅底煮开',
    '先涮青菜，再涮瘦牛肉片（150g 内）',
    '先蔬菜后肉，饱腹感更好'] },
  '凉拌黄瓜/凉拌木耳': { time: '10 分钟', steps: [
    '黄瓜拍碎切段（木耳提前泡发焯水）',
    '加蒜末、醋、少量生抽',
    '拌匀冷藏 10 分钟更入味'] },
  '白灼菜心': { time: '10 分钟', steps: [
    '菜心洗净，水开加一点盐',
    '焯水 1 分钟捞出',
    '淋薄盐生抽即可'] },
  '皮蛋豆腐': { time: '5 分钟', steps: [
    '嫩豆腐切块摆盘，皮蛋切丁',
    '淋生抽+醋调好的汁',
    '别加太多香油'] },
  '鸡蛋 + 绿叶菜 → 番茄炒蛋 / 紫菜蛋花汤': { time: '15 分钟', steps: [
    '看冰箱剩啥：有番茄做番茄炒蛋，有紫菜做蛋花汤',
    '绿叶菜焯水或快炒当配菜'] },
  '肉类 → 青椒肉丝 / 香菇滑鸡': { time: '20 分钟', steps: [
    '瘦肉→青椒肉丝；鸡腿（去皮）→香菇滑鸡',
    '详细步骤见对应菜谱'] },
  '豆腐 → 凉拌豆腐 / 豆腐汤': { time: '10 分钟', steps: [
    '凉拌：切块淋生抽醋汁',
    '或煮碗豆腐汤，加虾皮'] },
  '主食 → 蛋炒饭（少油）/ 煮面 + 青菜蛋': { time: '15 分钟', steps: [
    '蛋炒饭：少油先炒蛋，再下冷饭翻匀',
    '或煮面加青菜和蛋，小份'] },
  '剩菜 → 加热吃 + 另补一份青菜': { time: '10 分钟', steps: [
    '剩菜彻底加热透',
    '另焯一份青菜补维生素'] },
  '蔬菜鸡蛋卷': { time: '10 分钟', steps: [
    '鸡蛋打散，少油摊成薄蛋皮',
    '生菜/黄瓜/胡萝卜切丝焯一下',
    '卷入菜丝（可加全麦饼），切开吃'] },
  '白灼基围虾': { time: '10 分钟', steps: [
    '水烧开，加两片姜',
    '下虾煮 3 分钟变红即熟',
    '蘸姜醋汁吃'] },
  '蒜蓉粉丝虾（少油）': { time: '15 分钟', steps: [
    '粉丝泡软铺盘底，虾开背去线摆上',
    '蒜末少油炒香（别炒糊）',
    '铺在虾上，水开蒸 6 分钟即可'] },
  '清蒸鸡/蒸鸡胸': { time: '20 分钟', steps: [
    '鸡腿去皮或鸡胸，铺姜片',
    '水开上锅蒸 15 分钟至熟',
    '出锅淋少量蒸鱼豉油'] },
  '蒸红薯/南瓜/玉米': { time: '20 分钟', steps: [
    '红薯/南瓜切块，玉米掰段',
    '上锅蒸 20 分钟至软',
    '当主食吃'] },
  '亲子丼（鸡肉鸡蛋盖饭）': { time: '20 分钟', steps: [
    '鸡腿肉切小块煎至变色，洋葱丝炒软',
    '加少量水、酱油焖 3 分钟',
    '淋入打散的蛋液，盖盖焖 2 分钟',
    '连汁盖在小碗米饭上'] },
  '糙米蔬菜鸡胸饭': { time: '20 分钟（饭提前预约）', steps: [
    '糙米提前预约煮好',
    '鸡胸切片少油煎熟',
    '配焯水蔬菜，装盘'] },
  '燕麦粥 + 水煮蛋': { time: '5 分钟', steps: [
    '即食燕麦加热水泡 3 分钟',
    '水煮蛋提前煮好或现煮 8 分钟',
    '配着吃'] },
  '鸡蛋卷/厚蛋烧': { time: '10 分钟', steps: [
    '2 个蛋打散，加一勺牛奶',
    '少油热锅，倒入薄薄一层蛋液',
    '半凝固时卷起，再倒下一层，重复至用完',
    '切段吃'] },
  '牛奶燕麦 + 蓝莓': { time: '3 分钟', steps: [
    '燕麦 + 纯牛奶，微波 2 分钟',
    '加一把蓝莓，开吃'] },
  '蒸红薯 + 水煮蛋': { time: '10 分钟（红薯提前蒸）', steps: [
    '红薯提前蒸好，早上热 2 分钟',
    '配一个水煮蛋'] },
  '阳春面': { time: '10 分钟', steps: [
    '面条煮好捞入碗',
    '清汤加生抽、葱花（不放猪油）',
    '加个水煮蛋或煎蛋'] },
  '手撕包菜': { time: '10 分钟', steps: [
    '包菜手撕成片',
    '蒜片干辣椒少油爆香',
    '下包菜大火快炒 2 分钟，盐调味'] },
  '宫保鸡丁（少油）': { time: '20 分钟', steps: [
    '鸡胸切丁，生抽淀粉腌 10 分钟',
    '少油滑炒鸡丁至变色盛出',
    '干辣椒蒜片爆香，下黄瓜丁和鸡丁，糖醋汁翻匀',
    '花生少量最后放'] },
  '鱼香肉丝（少油）': { time: '20 分钟', steps: [
    '里脊切丝腌 10 分钟，木耳泡发切丝',
    '少油滑炒肉丝盛出',
    '蒜末爆香，下木耳笋丝炒，倒回肉丝',
    '醋多放糖少放，翻匀出锅'] },
  '芹菜香干': { time: '10 分钟', steps: [
    '芹菜切段，香干切丝',
    '少油快炒 2 分钟',
    '盐调味'] },
  '韭菜炒蛋': { time: '10 分钟', steps: [
    '韭菜切段，鸡蛋 2 个打散',
    '先炒蛋至凝固盛出',
    '下韭菜快炒 30 秒，倒回蛋翻匀'] },
  '蒜蓉空心菜': { time: '8 分钟', steps: [
    '空心菜洗净切段',
    '蒜末少油爆香',
    '大火快炒 1 分钟，盐调味'] },
  '辣椒炒肉（湘）': { time: '15 分钟', steps: [
    '瘦肉切片，生抽淀粉腌 10 分钟',
    '青椒斜切，干煸出香味盛出',
    '少油炒肉片至变色，倒回青椒翻匀'] },
  '农家小炒肉（少油）': { time: '15 分钟', steps: [
    '瘦肉切片腌 10 分钟',
    '蒜苗或青椒切段',
    '少油炒肉片，下配菜快炒，少酱油'] },
  '黑三剁（云南）': { time: '15 分钟', steps: [
    '肉末炒散至变色',
    '玫瑰大头菜切碎、青椒切碎一起炒香',
    '少油少盐，配杂粮饭'] },
  '青椒炒菌菇（云南）': { time: '10 分钟', steps: [
    '菌菇切片焯水 1 分钟',
    '青椒切丝',
    '少油快炒 2 分钟，盐调味'] },
  '银耳羹': { time: '40 分钟', steps: [
    '银耳提前泡发撕小朵',
    '加水炖 30 分钟出胶',
    '放红枣枸杞再煮 10 分钟，不放糖'] },
  '绿豆汤': { time: '30 分钟', steps: [
    '绿豆洗净',
    '水开后小火煮 25 分钟至开花',
    '少糖或不放糖，冰镇更开胃'] },
  '菌菇汤': { time: '20 分钟', steps: [
    '各种菌菇切片',
    '加水煮 15 分钟',
    '盐调味，天然鲜味'] },
  '鲫鱼豆腐汤': { time: '25 分钟', steps: [
    '鲫鱼洗净，少油煎两面微黄',
    '加热水，放姜片',
    '下豆腐炖 15 分钟至汤白，盐调味'] },
  '汽锅鸡（云南）': { time: '50 分钟', steps: [
    '鸡肉切块焯水，铺姜片',
    '汽锅加水，上锅蒸 40 分钟',
    '原汤原味，不用放油'] },
  '剁椒鱼头（少油）': { time: '20 分钟', steps: [
    '鱼头剖开铺姜片',
    '铺少量剁椒（减半）',
    '水开蒸 12 分钟，不浇热油'] },
  '牛蛙火锅（清汤/微辣）': { time: '30 分钟', steps: [
    '清汤锅底烧开（或微辣）',
    '牛蛙焯水后下锅，煮 10 分钟',
    '下蔬菜豆腐，蘸蒜泥醋'] },
  '菌菇火锅': { time: '25 分钟', steps: [
    '菌菇汤底烧开',
    '先涮蔬菜豆腐，再涮肉片（100g 内）',
    '蘸料用蒜泥醋'] },
  '潮汕牛肉火锅': { time: '25 分钟', steps: [
    '牛骨清汤底烧开',
    '先涮青菜，再涮吊龙/嫩肉（150g 内）',
    '沙茶酱少蘸一点'] },
  '韩式部队锅（少芝士）': { time: '25 分钟', steps: [
    '泡菜铺底，放豆腐、年糕、午餐肉少量',
    '加水煮开，放半包拉面',
    '芝士减半，煮 5 分钟'] },
  '咖喱鸡肉饭': { time: '25 分钟', steps: [
    '鸡胸切块，胡萝卜土豆切丁',
    '少油炒鸡胸至变色，下蔬菜翻炒',
    '加水煮 15 分钟，放半块咖喱块化开',
    '配杂粮饭'] },
  '辛拉面（少放料包）': { time: '10 分钟', steps: [
    '水开下面饼',
    '料包只用一半',
    '加蛋加青菜，煮 4 分钟'] }
};

/* ---------- 记录与周报 ---------- */
/* 解析热量范围取中间值："约 300~400" → 350 */
function kcalMid(kcalStr) {
  const m = String(kcalStr || '').match(/(\d+)\s*~\s*(\d+)/);
  if (m) return (Number(m[1]) + Number(m[2])) / 2;
  const s = String(kcalStr || '').match(/(\d+)/);
  return s ? Number(s[1]) : 0;
}

/* 周范围：weekOffset 0=本周，1=上周。返回 {monday, end, key} */
function weekRange(weekOffset = 0) {
  const now = new Date();
  const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const monday = new Date(thisMonday);
  monday.setDate(monday.getDate() - weekOffset * 7);
  let end;
  if (weekOffset === 0) {
    end = now;
  } else {
    end = new Date(monday);
    end.setDate(end.getDate() + 6);
    if (end > now) end = now;
  }
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { monday, end, key, startKey: key(monday), endKey: key(end) };
}

/* 周报：logs = [{date:'YYYY-MM-DD', time:'HH:MM', name, kcalStr, eaten:bool, sector:id, meal}]
 * interaction = { wheel, chats, recommends:[{name, ts}] }（该周内的交互统计，由调用方按 ts 过滤）
 * weights = [{date, kg}]（斤，体重记录，取最近一次）
 * 返回：{ total, eaten, skipped, kcalAvg, byDay, topSectors, streak, insights, interaction,
 *        junkCount, mealKcal, junkKcal, totalKcal, latestWeight, weightDelta } */
function computeWeeklySummary(logs, weekOffset = 0, interaction = {}, weights = []) {
  const { monday, end, key, startKey, endKey } = weekRange(weekOffset);
  const week = (logs || []).filter(l => l.date >= startKey && l.date <= endKey);

  const eaten = week.filter(l => l.eaten);
  const skipped = week.filter(l => !l.eaten);
  const kcalSum = eaten.reduce((s, l) => s + kcalMid(l.kcalStr), 0);

  /* 正餐 vs 不健康食品（放纵）：分开统计，总结时合并 */
  const meals = eaten.filter(l => l.meal !== '放纵');
  const junk = eaten.filter(l => l.meal === '放纵');
  const mealKcal = meals.reduce((s, l) => s + kcalMid(l.kcalStr), 0);
  const junkKcal = junk.reduce((s, l) => s + kcalMid(l.kcalStr), 0);
  const totalKcal = mealKcal + junkKcal;
  const junkCount = week.filter(l => l.meal === '放纵').length;

  /* 体重：取最近一条，并和上一条比较 */
  const ws = (weights || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = ws[ws.length - 1];
  const prev = ws[ws.length - 2];
  const latestWeight = latest ? Number(latest.kg) : null;
  const weightDelta = latest && prev ? Number(latest.kg) - Number(prev.kg) : null;

  const byDay = {};
  const bySector = {};
  week.forEach(l => {
    byDay[l.date] = (byDay[l.date] || 0) + 1;
    if (l.sector) bySector[l.sector] = (bySector[l.sector] || 0) + 1;
  });

  const topSectors = Object.entries(bySector).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id, c]) => { const s = SECTORS.find(x => x.id === id); return (s ? s.label : id) + '×' + c; });

  // 该周最长连续有记录的天数
  let streak = 0, maxStreak = 0;
  for (let d = new Date(monday); d <= end; d.setDate(d.getDate() + 1)) {
    streak = byDay[key(d)] ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
  }
  streak = maxStreak;

  /* 交互统计：推荐命中率 = 记录吃了的餐里，有多少和本周推荐过的菜对得上 */
  const recNames = (interaction.recommends || []).map(r => r.name);
  const hits = eaten.filter(l => recNames.some(n => n && (l.name.includes(n) || n.includes(l.name))));

  const insights = [];
  if (!week.length) {
    insights.push('本周还没有记录：在「今天吃了什么」里填一下实际吃的，下周就会自动生成周报。');
  } else {
    if (meals.length) insights.push(`正餐平均每餐约 ${Math.round(mealKcal / meals.length)} kcal，符合小份节奏。`);
    if (junk.length) {
      const pct = totalKcal ? Math.round(junkKcal / totalKcal * 100) : 0;
      insights.push(`不健康食品 ${junk.length} 次，约 ${Math.round(junkKcal)} kcal，占本周摄入约 ${pct}%——控制在每周 ≤2 次更利于减脂。`);
    }
    if (skipped.length > eaten.length) insights.push(`没吃成/跳过的次数（${skipped.length}）比吃上的（${eaten.length}）还多——推荐对不上胃口？试试转盘后点「不满意，问问AI」。`);
    const protein = meals.filter(l => /蛋|奶|酸奶|豆腐|鸡|鱼|虾|牛肉|瘦肉|肥牛/.test(l.name)).length;
    insights.push(protein ? `蛋白质来源餐次 ${protein} 次，继续保持：每餐优先蛋奶豆鱼虾。` : '本周蛋白质餐次较少，加餐建议选鸡蛋、酸奶、牛奶。');
    const perDay = week.length / Math.max(Object.keys(byDay).length, 1);
    insights.push(perDay >= 2.5 ? `平均每天 ${perDay.toFixed(1)} 条记录，少食多餐节奏不错 👍` : `平均每天 ${perDay.toFixed(1)} 条记录，少于少食多餐的节奏，记得小份多次。`);
    const night = week.filter(l => (l.time || '') >= '21:00').length;
    if (night) insights.push(`晚上 21 点后进食 ${night} 次，睡前尽量清淡小份。`);
  }
  if (interaction.wheel || interaction.chats) {
    const rate = hits.length && eaten.length ? Math.round(hits.length / eaten.length * 100) : 0;
    insights.push(`本周转了 ${interaction.wheel || 0} 次转盘、问助手 ${interaction.chats || 0} 次；记录吃上的餐里，${hits.length} 次和推荐对上了（命中率约 ${rate}%）。`);
  }

  return {
    total: week.length, eaten: eaten.length, skipped: skipped.length,
    kcalAvg: eaten.length ? Math.round(kcalSum / eaten.length) : 0,
    byDay, topSectors, streak, insights,
    junkCount, mealKcal: Math.round(mealKcal), junkKcal: Math.round(junkKcal), totalKcal: Math.round(totalKcal),
    latestWeight, weightDelta,
    interaction: {
      wheel: interaction.wheel || 0,
      chats: interaction.chats || 0,
      hits: hits.length
    }
  };
}
