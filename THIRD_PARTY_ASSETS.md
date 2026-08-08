# 素材来源与许可证

本文件只描述素材，不改变代码许可证。项目代码采用 MIT，见根目录 [LICENSE](LICENSE)。所有运行时素材统一存放在 `public/assets/v3/`，其完整输出路径和来源记录在 `public/assets/v3/manifest.json`；新增素材前应补充来源、作者、许可证和修改说明，并通过素材完整性测试。

## Tatermand：Top-down Sci-fi Shooter Characters 2.0

- 作者：Tatermand
- 来源：<https://opengameart.org/content/top-down-sci-fi-shooter-characters-20>
- 许可证：[CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- 运行时文件：`public/assets/v3/characters/*/{idle,move,attack,hit,death}.png` 及对应的战斗状态资源。
- 修改：从提供的素材中选择角色，裁切、去除预览背景、调整尺寸，并按状态制作运行时版本。
- 游戏内署名：`Character artwork by Tatermand, CC-BY-SA 3.0, modified for Energy Brawl.`

## Some Random Guys：Top-down Sci-fi Shooter Terrain Texture

- 作者：Some Random Guys
- 来源：<https://opengameart.org/content/top-down-sci-fi-shooter-some-random-guys-terrain-texture>
- 许可证：[CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- 运行时文件：`public/assets/v3/arena/floor.png`
- 修改：裁切、缩放并用于现有地图的非碰撞地表层。

## Kenney

- 作者：Kenney
- 来源：[Sci-Fi RTS](https://kenney.nl/assets/sci-fi-rts)、[Particle Pack](https://kenney.nl/assets/particle-pack)
- 许可证：CC0 1.0（对应下载包中的 `License.txt`）
- 运行时文件：地图墙体/装饰/灯光，以及子弹核心、拖尾、枪口闪光、命中爆裂、火花和烟雾。
- CC0 不要求署名；此处保留来源记录以便复核。

## 项目或用户提供的素材

以下素材不是代码仓库自动拥有的 MIT 内容，公开发布前必须由素材提供者确认授权范围：

- 六名角色的静态图和八方向图：用户提供，经过切割、去背景、归一化后生成 `public/assets/v3/characters/*/directions/*.png`。
- 四张枪械图：用户提供，经过去背景、水印裁切、统一尺寸和方向处理后生成 `public/assets/v3/weapons/*.png`。
- 连杀音效：由用户提供的录音分离/合成得到 `public/assets/v3/audio/killstreak/*.wav`。当前记录为“用户提供、项目专用”，并不代表已取得商业或再授权许可。
- `public/assets/v3/characters/*/fallback.svg`、`public/assets/v3/skills/*.svg` 等确定性生成的占位图标：项目原创资源，可按代码仓库许可证使用，除非文件旁另有说明。

如果这些素材要进入公开 GitHub 仓库，请补充原始作者、来源链接、许可证或书面授权；在授权不明确前，不应声称“无版权问题”，也不应把素材单独标为 MIT。

## 仅记录、未导入的来源

- <https://opengameart.org/content/top-down-sci-fi-shooter-pack>
- <https://opengameart.org/content/top-down-sci-fi-shooter-some-random-guys-terrain-texture>

这些链接不会因为出现在文档中就自动授权项目使用。任何新素材都必须先核实作者和许可证，再加入 manifest。
