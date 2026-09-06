# 远方 · 实景旅行

一个以真实地点、真实摄影和官方街景为核心的旅行窗口。

在线：https://corzfree.cn/chaosheng-world/

## 现在可以去哪里

- 12处完整360°实拍全景：威尼斯、瑞士阿尔卑斯、上海外滩、北京正阳门、名古屋二之丸庭园、香格里拉属都湖、开普敦桌山与海岸、波特兰、Moulton Falls林地、慕田峪长城、伦敦威斯敏斯特桥。
- 6处Google官方可导航街景：纽约第七大道、巴黎耶拿桥、东京涩谷、悉尼歌剧院步道、里约科帕卡巴纳海滨、雷克雅未克市中心。
- 18处影像覆盖六大洲。可以转动带真实卫星底图的地球选择目的地，也可以通过Google Maps的官方搜索链接寻找目录之外的地点。

全景摄影是从一个真实拍摄点记录的静态球面影像，可环顾、缩放；道路漫游由原平台提供，覆盖与图像年份由其决定。应用不将生成图、普通照片或方块模型冒充实景。

## 探索玩法

- **实景寻景**：12张全景里的36处摄影细节；按中文线索环顾，用中央取景框确认。可开方向提示或镜头引导；自己找到和跟随看见分别记录。
- **四段小旅程**：每段3站，分别围绕水边、绿色、城市细节和石头与远山；中途退出可继续，完成后获得旅程章。
- **世界猜想**：5轮不重复的真实全景，在可转动的地球上点选位置；按大圆距离计分，每轮最高5000分。支持经纬度输入与键盘落点，每轮只能提交一次，可保存后续玩。
- **我的远方**：本地发现册、旅程章和手记；手记绑定开始写作时的地点、水平/垂直视角与缩放，支持编辑、回到同一视角和Markdown导出。
- **更快看到风景**：先载入轻量球面实拍，再替换高清纹理；升级不会重置正在操作的镜头。高清资源失败时保留可用预览，过期请求被取消。

玩法进度使用独立的chaosheng.play.v1；原有收藏、足迹与两种沙盘的存档不变。Google街景保持平台原生漫游，不把它的画面抓取到寻景或猜地点游戏中。

## 操作

拖动、触屏或方向键环顾，滚轮/双指缩放。寻景时可以按Enter确认，线索卡可收起。“慢慢环顾”开启缓慢自动转动；“沉浸观看”隐藏界面，保留必要的来源信息。

街景使用画面中Google自带的道路箭头和控制。若原平台加载受网络限制影响，可以在Google Maps打开，或切换到自托管摄影。

收藏和线上旅行足迹仅保存于当前浏览器localStorage，不上传服务器。站内摄影可以导出带作者、来源和许可信息的明信片；Google街景不做抓取或图片导出。

## 影像与署名

完整可见署名页：https://corzfree.cn/chaosheng-world/travel/credits.html

- Poly Haven：CC0实拍HDRI的tonemapped JPG，保留官方拍摄坐标、作者和日期。优化为6144×3072 WebP与较小预览，未改写场景内容。许可：https://polyhaven.com/license
- 伦敦全景：Domob / Wikimedia Commons / CC BY-SA 4.0。缩放和格式转换后的衍生图片沿用该许可。
- 城市卡片：五张Wikimedia Commons真实照片，作者和不同版本CC BY-SA许可见public/travel/poster-credits.json。
- 地球底图：NASA Earth Observatory / Reto Stöckli，Blue Marble Next Generation，2004年7月合成；该地图不是实时卫星影像。
- Google街景：src逐一取自官方“分享→嵌入地图”窗口，保留Google导航、日期与署名，未下载其照片，未伪造pb参数。地图原站链接使用无需API key的官方Maps URLs。

## 开发与发布

Node.js 24，npm：

    npm install
    npm run dev
    npm run typecheck
    npm test
    npm run build:pages

推送main后自动检查并发布到GitHub Pages。脚本检查所有必需入口和资源；兼容vinext beta.5的静态导出路径行为。

主要文件：

- lib/travel.ts：来源明确的目的地目录与官方街景链接
- lib/panorama-viewer.ts：保留摄影色彩和方向的球面查看器
- lib/use-travel.ts：切换、取消下载、加载状态、收藏与足迹
- components/travel-globe.tsx：NASA底图与真实坐标选择
- public/travel/catalog.json、credits.html：摄影元数据与许可
- lib/travel-tools.ts、lib/expedition-tools.ts：结构化旅行与探索操作接口
- lib/use-expedition.ts、lib/travel-play-state.ts：玩法会话、进度和存档校验
- lib/data/travel-spots.json：逐张核对的摄影细节与球面位置
- components/travel-play.tsx、app/play.css：寻景、旅程、猜位置和手记界面

## 验证

测试覆盖原有世界与实景功能、新玩法数学和存档、三项实际缺陷的回归以及渐进图像载入。相机投影与标注坐标一致；窄屏放大后的屏外目标不会误判为找到；手记不会随在途加载迁移地点或丢失FOV；旧请求不会污染新活动的提示。

支持WebMCP的浏览器实际验证了13个工具注册、真假命中、两级提示、保存手记、三站旅程完成、暂停并刷新后继续、五轮猜位置、重复提交与非法输入拒绝。未进行整站截图视觉验收。

过往世界和存档保留在独立入口：

- 海岛都市：https://corzfree.cn/chaosheng-world/metropolis/
- 原野群岛：https://corzfree.cn/chaosheng-world/isles/
