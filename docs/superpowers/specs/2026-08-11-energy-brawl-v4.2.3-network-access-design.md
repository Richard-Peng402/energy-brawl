# 能量乱斗 v4.2.3 网络接入与干净克隆设计

## 目标

让从 GitHub 获取项目的新用户，在 Windows、macOS 或 Linux 电脑上完成依赖安装和构建后，只要手机与电脑位于允许设备互访的同一局域网，就能从房主控制台持续获得当前可用的加入地址和二维码，不需要通过终端查找地址，也不要求手机连接电脑热点。

## 支持边界

- 支持家庭 Wi-Fi、公司或校园局域网、有线电脑与 Wi-Fi 手机组合、电脑热点及多个物理网卡。
- 支持 Windows、macOS 和 Linux 的默认路由识别。
- 不提供移动数据、异地公网或跨 NAT 连接；这些场景需要云服务器、中继或内网穿透。
- 路由器启用访客隔离、AP 隔离或客户端隔离时，电脑无法单方面绕过。系统必须明确显示网络受限提示，不能把未验证的二维码描述为一定可达。

## 当前问题

1. `src/server/lan-address.ts` 主要依靠接口名称和地址段排序，没有使用系统默认路由，因此面对多个 Wi-Fi、VPN、虚拟网卡或企业网络时仍可能选择错误地址。
2. `src/client/host-app.ts` 只在构造时请求一次 `/api/info`。电脑切换 Wi-Fi、启停热点、更新 DHCP 地址或服务器改用备用端口后，房主页面会继续显示旧二维码。
3. `/api/info` 没有显式禁止缓存，也没有网络快照版本，浏览器无法判断地址是否已经过期。
4. GitHub 新用户是否能获得全部素材、从零安装并启动，目前缺少独立的干净克隆 CI 门禁。

## 网络拓扑模块

新增 `src/server/network-topology.ts`，只负责生成可测试的网络快照，不负责 HTTP 或 UI。

运行时通过 `default-gateway` 获取 IPv4 默认路由接口和网关，通过 `node:os.networkInterfaces()` 获取接口地址。模块接受可注入的路由提供器和接口数据，使测试无需依赖当前电脑网络。

```ts
export type NetworkKind = "wifi" | "ethernet" | "hotspot" | "virtual" | "unknown";
export type NetworkStatus = "ready" | "hotspot-only" | "limited" | "unavailable";

export interface NetworkCandidate {
  interfaceName: string;
  address: string;
  kind: NetworkKind;
  isDefaultRoute: boolean;
  url: string;
}

export interface NetworkSnapshot {
  revision: string;
  checkedAt: number;
  status: NetworkStatus;
  primaryUrl: string | null;
  candidates: NetworkCandidate[];
  warnings: string[];
}
```

### 地址排序

1. 默认路由所在的非虚拟 IPv4 接口。
2. 其他真实 Wi-Fi 接口。
3. 其他真实有线接口。
4. Windows 热点 `192.168.137.1`。
5. 虚拟网卡和 VPN 仅保留在诊断数据中，不作为主要二维码。

候选地址不再只依赖 RFC1918 范围。只要地址属于系统真实活动接口且不是回环、链路本地或未指定地址，就可作为同子网候选；Socket.IO 来源校验必须只信任当前网络快照中的精确主机地址及已有安全局域网范围，不能因此放开任意公网来源。

`revision` 由端口、主要地址和候选地址生成稳定哈希。网络没有变化时保持不变，避免每次轮询都重绘二维码。

## 服务器接口

扩展 `ServerInfo`：

```ts
interface ServerInfo {
  name: string;
  version: string;
  joinUrls: string[];
  qrDataUrls: string[];
  network: NetworkSnapshot;
  room: RoomSnapshot;
}
```

`GET /api/info` 每次读取最新网络快照，并设置：

```http
Cache-Control: no-store, no-cache, must-revalidate
Pragma: no-cache
Expires: 0
```

二维码只为可用候选生成。`unavailable` 状态返回空数组，不生成指向 `127.0.0.1` 的手机二维码。服务器终端仍可显示本机控制台地址。

## 房主控制台刷新

新增 `src/client/server-info-refresh.ts`，负责轮询与竞态控制；`HostApp` 只订阅最新结果并渲染。

- 页面启动时立即请求。
- 每 3 秒刷新一次。
- `window` 的 `online`、`focus` 事件和 `document.visibilitychange` 恢复可见时立即刷新。
- 每次请求使用 `cache: "no-store"`。
- 新请求开始时取消仍在运行的旧请求，另用单调请求编号阻止旧响应覆盖新响应。
- `revision` 不变时不替换二维码图片。
- 地址变化时在同一次渲染中更新网络类型、地址文字和二维码。
- 请求失败时保留最后一次地址作为参考，但显示“地址待确认”和最后成功检测时间；不能继续显示“局域网可用”。

房主页面显示：

- 当前网络类型。
- 当前主要加入地址。
- 最后检测时间。
- `ready`、`hotspot-only`、`limited` 或 `unavailable` 状态。
- AP/客户端隔离无法由电脑主动检测或绕过的说明，仅在 `limited` 或用户连接失败时显示。

## 防火墙与安全

`scripts/setup-lan-firewall.ps1` 改为 `Profile Any`，但继续限制：

```text
Direction: Inbound
Protocol: TCP
LocalPort: 3000-3010
RemoteAddress: LocalSubnet
```

这样 Windows 把酒店、校园或新 Wi-Fi 标记为 Public 时仍可连接，但不会向非本地子网开放服务。

服务端继续监听 `0.0.0.0`。来源校验使用当前网络快照中的精确接口地址、回环地址和安全局域网范围，不接受外部网站伪造的相似主机名。

## GitHub 干净克隆门禁

新增 `.github/workflows/clean-clone.yml`，在 `windows-latest` 和 `ubuntu-latest` 上使用 Node.js 22，不恢复项目缓存，执行：

```text
npm ci
npm run assets:v3
npm run assets:v4
npm test -- --run
npm run typecheck
npm run build
```

随后启动服务器并轮询 `http://127.0.0.1:3000/api/info`，验证：

- API 版本与 `package.json` 一致。
- 所有运行时素材请求返回成功。
- 角色、八方向帧、武器、地图、技能特效、子弹特效和连杀音效均来自仓库内路径。
- 不依赖 `D:\MyPicture*`、微信临时目录或开发者电脑上的绝对路径。
- `dist` 可以完全由干净克隆重新生成。

新增 `scripts/release-doctor.ts` 和 `npm run doctor`，供新用户本地检查 Node.js 版本、素材完整性、监听端口、网络快照和 Windows 防火墙提示。诊断失败时返回非零退出码并给出明确修复步骤。

## 自动化测试矩阵

### 网络拓扑单元测试

- 默认路由 Wi-Fi 优先于先枚举的 VPN 和虚拟网卡。
- 默认路由有线网卡优先于未连接 Wi-Fi 和热点。
- 只有 Windows 热点时状态为 `hotspot-only`。
- 没有可用物理地址时状态为 `unavailable`，不返回手机二维码。
- DHCP 地址变化后 `revision` 和主要 URL 同时变化。
- 真实接口使用非 RFC1918 地址时仍可成为精确候选，但来源校验不扩大到任意公网主机。

### 房主刷新测试

- 构造后立即请求一次。
- 3 秒轮询能获取新地址。
- `online`、`focus` 和恢复可见会立即请求。
- 旧请求晚返回时不能覆盖新地址。
- `revision` 不变时不替换二维码。
- 请求失败时显示过期状态，而不是显示“局域网可用”。
- `/api/info` 响应包含禁止缓存头。

### 防火墙测试

- 脚本包含 `Profile Any`。
- 远端范围必须保持 `LocalSubnet`。
- 端口范围只能是 `3000-3010/TCP`。

### 全量回归

- 完整 Vitest 套件。
- TypeScript 类型检查。
- Vite 生产构建。
- 三种六人模式 60 秒压力测试。
- Windows 与 Linux 干净克隆 CI。

## 实机验收

在一台没有项目历史的新电脑上从 GitHub 的正式版本分支或 Release 下载：

1. 安装 Node.js 22。
2. 执行 `npm ci` 和 `npm run doctor`。
3. 执行启动脚本并安装本地子网防火墙规则。
4. 让电脑与手机连接同一家庭 Wi-Fi，不开启电脑热点。
5. 确认房主控制台显示默认路由 Wi-Fi 地址。
6. 手机扫码进入大厅并完成一次对局。
7. 对局结束后切换电脑 Wi-Fi 或启停热点，确认二维码在 4 秒内更新且无需查看终端。

验收成功的定义是：在路由器允许同网设备互访的前提下，手机不需要连接电脑热点，且房主控制台始终显示当前可用地址。若路由器隔离设备，系统必须明确报告限制并建议关闭隔离或临时使用热点，不能将其报告为程序连接成功。

## 发布

- 版本号更新为 `4.2.3`。
- 开发分支使用 `codex/v4.2.3-team-skills`。
- GitHub 推送分支使用 `v4.2.3-team-skills`。
- README 和 CHANGELOG 记录网络识别、二维码刷新、干净克隆 CI、支持边界与新电脑启动步骤。
