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

正式构建脚本、自动化工作流和简体中文安装指南会在通过目标环境验证后补齐。正式版发布后，本节将提供 SPK、SHA-256 校验值及 GitHub Release 链接。
