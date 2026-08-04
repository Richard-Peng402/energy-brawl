# 能量乱斗 v2.0

局域网手机横屏六人对战游戏。Windows 电脑运行权威服务器，手机浏览器通过同一 Wi-Fi 加入，空位由普通难度 AI 补齐。

## 启动

双击项目根目录的 `启动游戏.bat`，或运行：

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run server
```

主机控制台会显示手机加入地址和二维码。Windows 防火墙仅需为 Node.js 开放“专用网络”。

## v2.0 规则

- 每局最长 8 分钟，目标分数 15 分。
- 普通击败奖励 2 分；击败当前占领者额外奖励 1 分；能量球奖励 1 分。
- 唯一领先者达到 15 分后开始 30 秒占领倒计时，守住即可获胜。
- 时间结束时唯一领先者获胜；同分进入加时。
- 结算后玩家可主动返回大厅，8 秒后也会自动返回。

## 手机操作

- 手机保持横屏。
- 左半屏任意位置按下生成移动摇杆。
- 右半屏任意位置按下生成瞄准和连续射击摇杆。
- 粗红色攻击范围会在墙体前截断，子弹无法穿墙。
- 对局页面已禁止双击缩放、手势缩放、滚动和长按菜单。

## 局域网排障

手机无法访问时：

1. 确认手机与电脑连接同一个 Wi-Fi，手机未连接访客网络。
2. 关闭路由器的“客户端隔离”“AP 隔离”或“无线隔离”。
3. 允许 Node.js 通过 Windows 专用网络防火墙。
4. 优先让电脑使用网线，手机使用 5 GHz 或 6 GHz Wi-Fi。
5. 暂时关闭手机移动数据，避免浏览器绕过局域网。

## 六客户端压力测试

测试模式启动服务器：

```powershell
$env:NODE_ENV='test'
$env:HOST_TOKEN='load-test-host-token'
$env:PORT='3111'
npm.cmd run server
```

另开终端运行十分钟测试：

```powershell
$env:GAME_URL='http://127.0.0.1:3111'
$env:HOST_TOKEN='load-test-host-token'
$env:LOAD_TEST_SECONDS='600'
npm.cmd run load-test
```

脚本会让六个客户端持续移动和射击，并输出每个客户端收到的快照数；最低快照量不足时返回非零退出码。

## 开发验证

```powershell
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

v3.0 的不同角色、技能和强化特效不属于本版本范围。
