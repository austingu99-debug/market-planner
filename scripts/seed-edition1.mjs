// One-off import of the team's existing spreadsheet timeline into edition 1.
// Usage: node scripts/seed-edition1.mjs
import "dotenv/config";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

// title | dueDate | status | notes
const T = (category, rows) => rows.map(r => ({ category, ...r }));

const tasks = [
  ...T("vendor", [
    { t: "擬定《市集營運管理規範書》第一版", d: "2026-06-30", s: "in_progress", n: "涵蓋內容架構、美學控管、營運秩序、階梯罰則、請假機制、免責條款（試算表標記已做 70%）" },
    { t: "擬定《攤商合作合約》第一版", d: "2026-06-30", s: "in_progress", n: "六大核心條款、甲乙方簽章與法人／個人識別欄位格式（試算表標記已做 70%）" },
    { t: "實地考察 5~7 個指標市集並採訪 8~10 位現役攤商", d: "2026-07-31", s: "done", n: "蒐集攤商在營運、水電、合約上的真實痛點，整合成攤商需求資料庫" },
    { t: "建立 50 家潛在招商口袋名單資料庫", d: "2026-07-31", s: "done", n: "依攤商類型分類，供日後招商聯絡使用" },
    { t: "分析指標品牌集客優勢與攤位配置原則", d: "2026-07-31", s: "pending", n: "含同類型攤位比例上限、鄰攤相容性配置原則，並把攤商痛點轉為招商誘因" },
    { t: "建立市集攤商報名表單", d: "2026-08-31", s: "in_progress", n: "協同營運組導入水電瓦數與硬體設備需求申報機制（已做 70%）" },
    { t: "建立匯款表單", d: "2026-08-31", s: "in_progress", n: "試算表標記已做 70%" },
    { t: "製作入取通知書", d: "2026-09-30", s: "pending", n: "格式需再調查" },
    { t: "製作行前通知單", d: "2026-09-30", s: "pending", n: "格式需再調查" },
    { t: "製作市集報到簽到表", d: "2026-09-30", s: "pending", n: "" },
    { t: "編撰《市集招商簡章》核心資訊與文案", d: "2026-10-31", s: "pending", n: "完成後交付美學場域設計組進行視覺深化與排版定案" },
    { t: "制定攤商資格審查標準", d: "2026-10-31", s: "pending", n: "品牌風格契合度、商品獨特性、社群影響力、同品項排他比例限制" },
    { t: "擬定《攤商合作合約》官方正式版", d: "2026-11-30", s: "pending", n: "攤位規費、保證金收繳、匯款期限、活動時程、進撤場時間、攤位編號" },
    { t: "擬定《市集營運管理規範書》官方正式版", d: "2026-11-30", s: "pending", n: "罰則金額量化、請假遞補時限、天災停市與退費機制、美學硬體限制、緊急通報流程" },
    { t: "開放 12 月攤商報名並主動邀約指標品牌", d: "2026-12-31", s: "pending", n: "透過行銷組發放正式招商簡章與報名表單" },
    { t: "完成資格審查、定案名單並發布錄取通知書", d: "2026-12-31", s: "pending", n: "同步建立官方 LINE 攤商群組集中管理" },
    { t: "彙整錄取攤商水電需求並交付營運組", d: "2026-12-31", s: "pending", n: "" },
    { t: "產出各品牌專屬合約並完成簽署與收款", d: "2026-12-31", s: "pending", n: "帶入抬頭／負責人、核可瓦數、攤位編號；落實攤位規費與保證金收繳控管" },
    { t: "現場執行：巡視及關懷攤商", d: "2027-02-28", s: "pending", n: "" },
    { t: "押金退款作業", d: "2027-03-31", s: "pending", n: "" },
  ]),
  ...T("design", [
    { t: "走訪 3~5 個指標性市集進行空間考察", d: "2026-05-31", s: "done", n: "" },
    { t: "量化記錄攤位擺設、走道寬度、人流、照明、音樂與道具", d: "2026-05-31", s: "done", n: "" },
    { t: "撰寫市集空間美學優勢分析報告", d: "2026-05-31", s: "in_progress", n: "找出設計背景團隊能切入的空間美感缺口" },
    { t: "設計官方 Logo（主商標）", d: "2026-07-31", s: "done", n: "沙漏造型，白底黑／黑底白正式版本" },
    { t: "撰寫品牌故事與核心理念", d: "2026-07-31", s: "done", n: "" },
    { t: "定案品牌關鍵形象詞與 Slogan", d: "2026-07-31", s: "in_progress", n: "陪你在快節奏的生活裡，咻一下。" },
    { t: "設計輔助商標與小圖示", d: "2026-08-31", s: "pending", n: "" },
    { t: "定案品牌標準色（CMYK）", d: "2026-08-31", s: "in_progress", n: "主色黑白已定，輔助色卡其暫定，強調色候選待決策" },
    { t: "定案品牌標準字體", d: "2026-08-31", s: "done", n: "經典無襯線（主）＋細襯線（輔）雙軌配置" },
    { t: "制定官方社群視覺排版與濾鏡規範", d: "2026-08-31", s: "in_progress", n: "大頭貼／貼文已定調，限時動態待優化" },
    { t: "提供行銷幕後素材（設計過程縮時影片）", d: "2026-08-31", s: "pending", n: "交行銷組作為誕生紀實素材" },
    { t: "名片製作", d: "2026-08-31", s: "done", n: "不對稱出血設計，卡其色調版＋黑白版" },
    { t: "製作品牌故事書（商家分享用）", d: "2026-09-30", s: "pending", n: "" },
    { t: "製作視覺化招商簡章 Final Deck", d: "2026-10-31", s: "pending", n: "將複雜文件轉化為具信賴感的高質感簡報" },
    { t: "繪製攤位 3D 模擬透視圖與場地動線圖", d: "2026-10-31", s: "pending", n: "置入招商簡章" },
    { t: "跨組核對水電硬體與配電邏輯", d: "2026-10-31", s: "pending", n: "對接營運執行組，依場地原始配電圖討論動線死角" },
    { t: "規劃活動視覺亮點與裝置企劃", d: "2026-10-31", s: "pending", n: "大型打卡裝置藝術、舞台背景、人流指引路標" },
    { t: "內部實戰模擬搭設攤位並測試陳列", d: "2026-10-31", s: "pending", n: "測試陳列美感與道具結構穩定度" },
    { t: "繪製初版場域策展規劃草案", d: "2026-10-31", s: "pending", n: "含地理位置圖與規劃平面圖" },
    { t: "發布官方主視覺海報與宣傳素材包", d: "2026-11-30", s: "pending", n: "11 月正式公開，並提供素材包給行銷組" },
    { t: "宣傳影像藝術指導與視覺後期把關", d: "2026-12-31", s: "pending", n: "確保宣傳短片與廣告調性不走樣" },
    { t: "繪製最終 2D/3D 攤位詳細配置施工圖", d: "2027-01-31", s: "pending", n: "精確到座標單位" },
    { t: "制定攤商美感陳列 SOP", d: "2027-01-31", s: "pending", n: "如禁止塑料招牌、統一基礎桌布規格" },
    { t: "現場場域督導與即時美學調度", d: "2027-02-28", s: "pending", n: "處理現場死角、人流阻塞、突發硬體狀況" },
    { t: "主導品牌影像紀錄並產出 Reels/Stories", d: "2027-02-28", s: "pending", n: "捕捉燈光氛圍、攤友互動與現場熱潮" },
    { t: "建立品牌高端視覺資產庫", d: "2027-03-31", s: "pending", n: "收放所有精選影音紀錄" },
    { t: "撰寫美學執行與場域復盤報告", d: "2027-03-31", s: "pending", n: "總結空間設計優缺點與動線改善策略" },
  ]),
  ...T("operation", [
    { t: "走訪 7~10 個市集場勘並建立分析資料庫", d: "2026-08-31", s: "in_progress", n: "場地動線、攤商結構、硬體配置；已有網站持續優化" },
    { t: "詢問公共意外責任險報價與保額建議", d: "2026-08-31", s: "pending", n: "依場地大小決定帳篷數量與桌椅尺寸，記錄保存" },
    { t: "開發 5~8 家硬體供應商並建立採購比價資料庫", d: "2026-08-31", s: "pending", n: "帳篷、桌椅、機電等；列出報價、配合度與設備品質對比" },
    { t: "取得設備／燈飾／發電機三大類詳細報價", d: "2026-08-31", s: "pending", n: "含運送、架設、撤場、發電機油資配線" },
    { t: "篩選 4 個候選場地並確認停辦標準與進場限制", d: "2026-08-31", s: "pending", n: "颱風豪雨判定標準、退費機制、車輛機具大小重量限制" },
    { t: "製作攤商水電配置需求申請表", d: "2026-08-31", s: "pending", n: "交付招商組納入正式招商文件，統計全場用電負載" },
    { t: "逐項確認器材租金明細", d: "2026-09-30", s: "pending", n: "長桌、椅子、陽傘單件租金；燈條單價與總價為重點項目" },
    { t: "評估發電機租借、油資與配線費用", d: "2026-09-30", s: "pending", n: "先評估市集整體用電需求" },
    { t: "人力總數評估與崗位職責分配", d: "2026-09-30", s: "pending", n: "服務台、攤商接待、動線引導、機電維護；含正職／兼職／志工" },
    { t: "製作攤商進撤場懶人包", d: "2026-10-31", s: "pending", n: "卸貨時間表（分流）、停車位置圖、現場報到流程" },
    { t: "彙整場地限制規範", d: "2026-11-30", s: "pending", n: "水電配置、載重限制、消防法規；交招商組作為簡章與審查依據" },
    { t: "撰寫志工管理計畫與志工手冊", d: "2026-11-30", s: "pending", n: "招募簡章與崗位分配初稿（服務台、清潔組、動線組）" },
    { t: "採購現場器材（地貼、告示牌、垃圾袋、志工背心）", d: "2026-12-31", s: "pending", n: "" },
    { t: "舉行志工說明會並發放手冊", d: "2026-12-31", s: "pending", n: "講解應變流程，如有人受傷、跳電怎麼辦" },
    { t: "完成公共意外責任險投保", d: "2026-12-31", s: "pending", n: "名冊確認、確認清運車輛進場時間" },
    { t: "收集攤商瓦數並核對配電與滅火器", d: "2026-12-31", s: "pending", n: "核對餐飲攤位是否需要額外配電或滅火器" },
    { t: "監督硬體進場與貼設攤位標示地貼", d: "2027-02-28", s: "pending", n: "帳篷、發電機、音響" },
    { t: "志工點名與場地巡檢", d: "2027-02-28", s: "pending", n: "垃圾、電力、廁所；處理突發安檢問題" },
    { t: "監督撤場復原與垃圾清運點交", d: "2027-03-31", s: "pending", n: "與場地管理單位簽署完畢確認單" },
  ]),
  ...T("marketing", [
    { t: "建立 Linktree 整合連結", d: "2026-07-31", s: "done", n: "https://linktr.ee/hangoutmarket" },
    { t: "產出「我們為什麼想做市集」貼文", d: "2026-07-31", s: "done", n: "" },
    { t: "產出「Logo 誕生」貼文", d: "2026-07-31", s: "pending", n: "" },
    { t: "拍攝團隊開會縮時影片", d: "2026-07-31", s: "pending", n: "" },
    { t: "拍攝市集考察 Vlog", d: "2026-07-31", s: "pending", n: "" },
    { t: "創立 Instagram 帳號", d: "2026-08-31", s: "pending", n: "先設為不公開帳號或暫不導流；原定 7/1，順延至資料完善後" },
    { t: "創立 Facebook 粉絲專頁", d: "2026-08-31", s: "pending", n: "可先設定取消發佈不對外公開；原定 7/1" },
    { t: "創立 LINE 官方帳號", d: "2026-08-31", s: "pending", n: "先不宣傳、不放加入好友連結" },
    { t: "準備統一品牌視覺素材", d: "2026-08-31", s: "pending", n: "頭貼（Logo）、FB 橫幅封面圖、LINE 歡迎圖" },
    { t: "撰寫各平台一句話簡介 Bio", d: "2026-08-31", s: "done", n: "慢生活 × 療癒 × 體驗市集／陪你在快節奏的生活裡，咻一下。☕ 留一點時間給自己" },
    { t: "籌備首波內容 3~6 篇", d: "2026-08-31", s: "in_progress", n: "第 1 篇我們是誰、第 2 篇我們在做什麼、第 3 篇誰需要我們" },
    { t: "制定固定內容模板", d: "2026-10-31", s: "pending", n: "色系、Logo 位置、限動模板、貼文版型" },
    { t: "市集社群正式對外公開", d: "2026-10-31", s: "pending", n: "" },
    { t: "撰寫招商公告與招商主文案", d: "2026-10-31", s: "pending", n: "「我們正在尋找，願意一起打造城市風景的人。」品牌類型：手作／插畫／選物／甜點／飲品／生活風格" },
    { t: "產出攤位風格範例與市集亮點內容", d: "2026-11-30", s: "pending", n: "" },
    { t: "場地公開宣告", d: "2026-11-30", s: "pending", n: "" },
    { t: "Accupass 活動上架與曝光", d: "2026-12-31", s: "pending", n: "" },
    { t: "FB 社團宣傳操作", d: "2026-12-31", s: "pending", n: "營造興奮感，建立社群影響力與信任度" },
    { t: "限時動態幕後紀錄", d: "2027-01-31", s: "pending", n: "開會、場勘、搬運、佈置、團隊互動" },
    { t: "活動現場人潮與精華紀錄", d: "2027-02-28", s: "pending", n: "現場照片、人潮紀錄" },
    { t: "產出活動 Reels 與一日市集紀錄", d: "2027-03-31", s: "pending", n: "活動精華、幕後花絮" },
    { t: "發布感謝文與結案回顧", d: "2027-03-31", s: "pending", n: "" },
    { t: "收集問卷調查統計數據", d: "2027-03-31", s: "pending", n: "" },
  ]),
  ...T("curation", [
    { t: "完成 BMC 商業模式建模", d: "2026-06-30", s: "done", n: "" },
    { t: "完成 SWOT 分析", d: "2026-06-30", s: "done", n: "" },
    { t: "簽署共同創辦人協議", d: "2026-06-30", s: "done", n: "" },
    { t: "確立核心團隊分工", d: "2026-06-30", s: "done", n: "五組：總策展法律財務、美學場域設計、招商攤商關係、行銷數位公關、營運執行物流" },
    { t: "建立市集考察資料庫", d: "2026-07-31", s: "done", n: "" },
    { t: "申請 U-start 創新創業計畫", d: "2026-09-30", s: "pending", n: "" },
    { t: "洽詢台北市青年局補助資源", d: "2026-09-30", s: "pending", n: "" },
    { t: "建立整體預算與損益試算", d: "2026-10-31", s: "pending", n: "以不賠本為底線，反推可承受的場地租金範圍" },
    { t: "場地簽約", d: "2026-11-30", s: "pending", n: "" },
    { t: "結案財務結算與押金退款覆核", d: "2027-03-31", s: "pending", n: "" },
  ]),
];

const folders = [
  {
    name: "品牌與 CIS",
    description: "品牌故事、Slogan、視覺識別相關文件與連結",
    items: [
      { kind: "link", title: "咻一下 Linktree", linkUrl: "https://linktr.ee/hangoutmarket", note: "官方整合連結頁" },
      {
        kind: "note",
        title: "品牌故事：我們是誰",
        note: "嗨，我們是《咻一下》。一個由四位大學生共同創立的生活品牌，也是我們第一次創業。「咻」像時間飛快流逝的聲音，也像「休一下」，提醒自己停下腳步、喘口氣。我們相信休息不是偷懶，而是給自己重新整理、重新出發的機會。",
      },
      {
        kind: "note",
        title: "品牌故事：我們在做什麼",
        note: "《咻一下》以「慢生活 × 療癒 × 體驗」為核心。透過一場場市集，把休息變成一種值得練習的生活方式。咖啡甜點飲食、手作體驗、音樂演出、故事分享與互動展區。",
      },
      {
        kind: "note",
        title: "品牌故事：誰需要我們",
        note: "如果你曾覺得「每天都很忙，卻不知道在忙什麼」「總在追趕時間，卻忘了照顧自己」「想休息又覺得有罪惡感」，《咻一下》就是為這樣的人存在。",
      },
      {
        kind: "note",
        title: "Slogan 與各平台 Bio",
        note: "慢生活 × 療癒 × 體驗市集｜陪你在快節奏的生活裡，咻一下。｜☕ 留一點時間給自己",
      },
      {
        kind: "note",
        title: "CIS 現況盤點",
        note: "已完成：主商標 Logo、品牌故事與理念、標準字體（無襯線主＋細襯線輔）、名片（不對稱出血設計）。進行中：標準色（主色黑白已定，輔助色卡其暫定）、社群視覺規範（限動待優化）。待辦：輔助商標與小圖示、市集攤位物料（招牌、桌牌、價目卡）、吉祥物造型定案。",
      },
    ],
  },
  {
    name: "補助與資源",
    description: "可申請的補助方案與諮詢窗口",
    items: [
      { kind: "note", title: "U-start 創新創業計畫", note: "教育部青年署補助，適合在校學生團隊。需備商業計畫書、團隊分工與財務規劃。" },
      { kind: "note", title: "台北市青年局補助資源", note: "青年創業相關補助與諮詢窗口，可預約創業諮詢服務。" },
    ],
  },
  {
    name: "目標與指標",
    description: "短中長期目標與量化指標",
    items: [
      { kind: "note", title: "首場規模目標", note: "20–30 個高品質攤位，含明星攤商。試算表另有 40 攤的空間規劃版本，需依最終場地確認。" },
      { kind: "note", title: "攤商類型組合", note: "手作、插畫、選物、甜點、飲品、生活風格。需設定同類型攤位比例上限與鄰攤相容性原則。" },
    ],
  },
  {
    name: "場地評估",
    description: "場地篩選標準與候選場地資訊",
    items: [
      {
        kind: "note",
        title: "場地五大評估重點",
        note: "1. 費用預算與損益：以不賠本為底線反推可承受租金。2. 容納攤位數：實際可用坪數是否容納目標攤數，並預留動線、服務台、打卡區；招商不如預期或超出時能否彈性調整。3. 電力安排：是否免費供電、容量上限安培數、能否租發電機、超載跳電責任歸屬。4. 交通便利性：鄰近交通樞紐、步行時間、周邊停車位。5. 人流與客群定位：客群畫像與消費力，影響攤商類型比例。",
      },
      { kind: "note", title: "候選場地方向", note: "花博圓山（農會市集旁）。訴求：藝術裝置、社會互動實驗、社群流量焦點。" },
      { kind: "note", title: "天災與進場限制待確認事項", note: "颱風豪大雨的停辦判定標準、天災取消的退費／扣費／改期規定、進場車輛與機具大小重量限制、特定區域與進場時間限制。" },
    ],
  },
  {
    name: "行銷素材",
    description: "貼文比例、文案模板與社群策略",
    items: [
      { kind: "note", title: "貼文類型比例", note: "品牌氛圍 30%｜市集資訊 25%｜幕後紀錄 20%｜攤商介紹 20%｜互動內容 5%" },
      {
        kind: "note",
        title: "招商主文案",
        note: "「我們正在尋找，願意一起打造城市風景的人。」這不只是一次擺攤，而是一場關於美感、交流與生活風格的聚集。如果你重視作品、重視品牌、重視與人的連結，歡迎加入我們。品牌類型：手作／插畫／選物／甜點／飲品／生活風格。",
      },
      {
        kind: "note",
        title: "LINE 自動歡迎詞",
        note: "💛 嗨，歡迎來到《咻一下》！如果今天過得有點累，沒關係。先休息一下，喝口水，深呼吸。點選下方選單，即可查看活動資訊、攤商介紹與最新消息。很高興遇見你，希望今天的你，比昨天更輕鬆一點。",
      },
      { kind: "note", title: "平台策略方向", note: "IG 以實照為主視覺風格；FB 只發市集內容，不發成功人士範例；LINE 不主動推播。" },
    ],
  },
];

const conn = await mysql.createConnection(url);

try {
  // Attribute imported rows to the first registered member.
  const [owners] = await conn.execute("SELECT id FROM users ORDER BY id LIMIT 1");
  const ownerId = owners.length > 0 ? owners[0].id : null;
  if (!ownerId) {
    console.error("No users found; log in once before importing.");
    process.exit(1);
  }

  // Editions + tasks were already imported in a previous run; skip if present.
  const [taskCount] = await conn.execute("SELECT COUNT(*) AS c FROM tasks");
  if (Number(taskCount[0].c) === 0) {
    await conn.execute(
      "INSERT INTO editions (name, ordinal, event_date, note, is_active, created_by_id) VALUES (?, 1, NULL, ?, 1, ?)",
      ["第一屆 咻一下市集", "首場預計 2027 年 2 月，確切日期待團隊確認後於設定頁填入", ownerId]
    );
    await conn.execute(
      "INSERT INTO editions (name, ordinal, event_date, note, is_active, created_by_id) VALUES (NULL, 2, NULL, NULL, 0, ?), (NULL, 3, NULL, NULL, 0, ?)",
      [ownerId, ownerId]
    );
    const [ed] = await conn.execute("SELECT id FROM editions WHERE ordinal = 1 LIMIT 1");
    const editionId = ed[0].id;
    let n = 0;
    for (const t of tasks) {
      await conn.execute(
        `INSERT INTO tasks (edition_id, title, description, notes, category, custom_category, status, due_date, sort_order, created_by_id)
         VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?)`,
        [editionId, t.t, t.n || null, t.category, t.s, t.d, n, ownerId]
      );
      n += 1;
    }
    console.log(`Inserted ${n} tasks into edition ${editionId}.`);
  } else {
    console.log(`Tasks already present (${taskCount[0].c}); skipping task import.`);
  }

  const [folderCount] = await conn.execute("SELECT COUNT(*) AS c FROM resource_folders");
  if (Number(folderCount[0].c) > 0) {
    console.log(`Resource folders already present (${folderCount[0].c}); skipping.`);
    process.exit(0);
  }

  let fi = 0;
  for (const f of folders) {
    await conn.execute(
      "INSERT INTO resource_folders (name, description, sort_order, created_by_id) VALUES (?, ?, ?, ?)",
      [f.name, f.description, fi, ownerId]
    );
    const [fr] = await conn.execute("SELECT id FROM resource_folders WHERE name = ? ORDER BY id DESC LIMIT 1", [f.name]);
    const folderId = fr[0].id;
    let ii = 0;
    for (const item of f.items) {
      await conn.execute(
        `INSERT INTO resource_items (folder_id, kind, title, note, link_url, uploaded_by_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [folderId, item.kind, item.title, item.note || null, item.linkUrl || null, ownerId]
      );
      ii += 1;
    }
    console.log(`Folder "${f.name}": ${ii} items.`);
    fi += 1;
  }

  console.log("Import complete.");
} finally {
  await conn.end();
}
