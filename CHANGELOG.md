# 更新记录

## [4.1.1] - 2026-08-09

### Preview motion

- All six characters now use the complete six-second energy spread, pixel assembly, scale-and-bounce, and impact-wave transition while the right-side dossier stays fixed.

### Added

- 角色选择界面新增 6 秒横屏转场：左侧预览区依次完成蓝色能量扩散、像素角色组装、放大回弹和标题淡入。
- 右侧角色选择、属性、按钮与参战席位保持固定，不参与转场位移。

### Fixed

- 修复角色与武器同一容器内的绘制层级：武器稳定显示在角色图层上方，同时继续按瞄准角度旋转和定位。
- 修正脉冲医师、电弧枪手、疾行者等角色选择卡使用背向图的问题，统一改为正面像素帧。

## [4.1.0] - 2026-08-08

### Added

- 专属技能按钮改为独立方向摇杆：按住显示，拖动选择方向，松手释放，不再占用攻击摇杆。
- 烈锋与相位折跃新增加粗位移路径、方向箭头和落点范围提示。
- 新增玩家键位设置：电脑移动、攻击、技能球技能和专属技能均可重新绑定。
- 新增手机触控布局编辑：两个技能按钮可自由拖动、缩放并保存在本机。

### Fixed

- 修复相位折跃等位移技能因按钮不处理拖动输入而难以看到和控制指示器的问题。

## [4.0.1] - 2026-08-08

### Fixed

- Fixed Blaze anchor creation, dash, return, and mobile cooldown state feedback.
- Added independent hold-to-preview indicators for all six exclusive skills.
- Upgraded timed buffs to persistent layered aura, pulse, orbit, and afterimage feedback.
- Moved both mobile skill controls upward to increase the safe gap from the attack stick.

## [4.0.0] - 2026-08-08

### Added

- 个人战、3v3、2v2v2 三种模式与服务器权威团队计分。
- 烈锋、脉冲医师、堡垒、电弧枪手、相位狙手、疾行者六种专属技能及独立移动端操作。
- 房主大厅模式、换队、专属技能冷却和团队强制获胜控制。
- v4 角色色技能特效、团队 HUD、团队结算与六人压力测试。

### Changed

- 团队目标分为 3v3 60 分、2v2v2 40 分；个人战保持 20 分。
- 团队模式中队友免伤且子弹穿过队友。
- 所有模式继续使用原有个人连杀音效规则。

### Verification

- 六人 60 秒 3v3 模拟：0 次墙体违规，36 次专属技能请求，服务端单步 P95 低于 1 ms。

## [3.4.0] - 2026-08-08

### Added

- 六名角色的八方向图和角色选择预览。
- 四种枪械贴图：烈锋/疾行者使用熔核炮，脉冲医师/相位狙手使用青蓝重炮，堡垒使用白色科技枪，电弧枪手使用紫电步枪。
- 技能球与四种技能：推进冲刺、能量护盾、散射齐发、应急治疗。
- 一至五连杀音效与全场单条击杀播报。
- 房主控制台的子弹速度调整和大厅预设胜者能力。

### Changed

- 版本标记统一为 `3.4.0`。
- 目标分数从 15 分调整为 20 分；最长对局为 8 分钟。
- 子弹生命周期改为距离限制，命中墙体时由服务器截断。
- 整理运行时素材清单、开源文档和许可证边界。

### Notes

- 代码按 MIT 发布；第三方和用户提供素材遵循各自来源说明，不自动继承 MIT。
- 本版本不加入新的游戏模式；后续模式和更多角色留待下一版本。
