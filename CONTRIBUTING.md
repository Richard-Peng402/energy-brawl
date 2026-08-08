# 贡献指南

感谢你对 Energy Brawl 的兴趣。提交代码或素材前，请先阅读 README 和 [素材许可证说明](THIRD_PARTY_ASSETS.md)。

## 开发流程

1. 使用 Node.js 22+ 安装依赖：`npm.cmd install`。
2. 修改前先确认问题范围，不要提交 `node_modules/`、`dist/`、`coverage/` 或 `artifacts/`。
3. 新增素材时，在 `public/assets/v3/manifest.json` 和 `THIRD_PARTY_ASSETS.md` 中记录作者、来源、许可证和修改方式。
4. 提交前运行：

   ```powershell
   npm.cmd test -- --run
   npm.cmd run typecheck
   npm.cmd run build
   git diff --check
   ```

## Pull Request 建议

- 标题说明变更范围，例如 `fix: prevent projectile wall tunneling`。
- 描述用户可见变化、测试命令和已知限制。
- UI 或素材变更请附桌面和手机横屏截图。
- 不要提交令牌、密码、私钥、带 token 的房主 URL 或本地绝对路径。
- 代码和素材的许可证边界必须清楚；没有明确授权的外部素材不要加入仓库。
