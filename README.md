# Motrix-SPK

将 [Motrix](https://github.com/agalwood/Motrix) 移植为群晖 DSM 原生套件，提供浏览器下载管理界面。目标安装包为 `Motrix-SPK 1.0.0`，目标设备是 Synology DS3615xs-j（Bromolow / x86_64）。

> 1.0.0 尚未发布。当前先验证官方 Motrix Server 与 DSM 6.2.3 的运行时和套件生命周期兼容性；未完成目标 NAS 实测前，不提供“可安装”或“已通过测试”的结论。

## 目标功能

- 使用 Aria2 处理 HTTP、HTTPS、FTP、BitTorrent 和磁力链接。
- 从浏览器添加、批量添加、暂停、继续、删除和重新下载任务。
- 展示任务进度、速度、剩余时间、历史记录；支持全局和单任务限速及并发数设置。
- 上传种子文件，管理 Tracker，并保留任务和引擎会话。
- **下载目录可自行选择**：在 Motrix 设置中配置一个或多个现有群晖共享文件夹；新增任务的保存路径由用户选择，目录不可用时不写入其他位置。
- 套件日志可查看和清空；升级保留设置、任务和下载文件；卸载时提供保留业务数据的选择。
- DSM 套件中心生命周期、应用菜单入口、开机启动、服务恢复和访问认证。


视频任务 API 对接规范见 [docs/API.md](docs/API.md)，基于 `@motrix/mdxp@0.10.0`，供 Motrix-Extension 对接。

## 目标环境

| 项目 | 目标 |
| --- | --- |
| NAS | Synology DS3615xs-j |
| DSM | 6.2.3-25426 |
| Package Arch | x86_64（Bromolow） |
| 安装格式 | 原生 SPK，不依赖 Docker |

## 上游与许可证

Motrix 上游采用 MIT 许可证，版权声明为 Dr_rOot（2018 至今）。本项目会保留上游许可证及构建产物内适用的第三方许可证声明。上游的官方 Synology 套件目录和许可信息见 [agalwood/Motrix](https://github.com/agalwood/Motrix)。

当前上游 Synology 安装文档声明最低版本为 DSM 7.2.2-72806；本项目目标是 DSM 6.2.3，因此需先验证运行时、DSM 身份认证、共享目录授权及套件脚本，不能仅修改 SPK 元数据来宣称兼容。

## 构建与安装

仓库已包含面向 Bromolow x86_64 的 DSM 6 兼容构建工作流。工作流会固定上游源码、DSM 工具链、Node 运行时和 Aria2 版本，构建 SPK 并检查 Node、SQLite 原生模块及 Aria2 的 ABI。

当前状态：CI 已通过 SPK 构建和 ABI 检查；尚未在目标 DS3615xs-j 上完成套件安装、启动、重启、覆盖升级、卸载及真实下载验收。因此暂不发布正式 Release，也不把 CI 构建结果称为已验收正式版。通过 NAS 实测后，将在此补充可直接下载的正式 SPK、SHA-256 校验值和 GitHub Release 链接。

构建产物可在仓库 Actions 的对应工作流运行记录中获取；Actions 临时产物会过期，正式使用请等待 GitHub Release。
