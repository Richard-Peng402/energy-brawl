# v3.4.0 GitHub 发布检查清单

- [x] `package.json`、`package-lock.json`、服务器 `/api/info` 版本统一为 `3.4.0`。
- [x] README 使用 UTF-8，并包含安装、启动、局域网加入、测试和安全说明。
- [x] 代码许可证已添加为 MIT。
- [x] 第三方素材来源、作者、许可证和修改方式已记录。
- [x] 用户提供角色、枪械和音频素材已单独标注，不与 MIT 混淆。
- [x] `dist/`、`node_modules/`、`coverage/`、`artifacts/` 已加入忽略规则。
- [x] 角色、武器、地图、技能、子弹特效和音效全部收口至 `public/assets/v3/`，manifest 覆盖每个运行时素材。
- [ ] 发布前确认用户提供素材拥有公开仓库授权；如只有项目内授权，应从公开仓库移除或替换。
- [ ] 在 GitHub 创建仓库后设置 Topics、默认分支保护和 Issue 模板。
- [ ] 首次推送前再次检查 `git diff --cached`，确认没有 token、密码、本地绝对路径或临时文件。
