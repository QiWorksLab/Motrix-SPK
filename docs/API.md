# Motrix-SPK 视频任务 API

本文是 Motrix-Extension 与 Motrix-SPK 的对接契约。任务由 NAS 上的 Motrix-SPK 接收并执行；Extension 负责识别视频资源、向用户展示操作并提交选择，不在电脑端下载、合并或转码。

> **协议基线：** Motrix Download Exchange Protocol（MDXP）npm 包 `@motrix/mdxp@0.10.0`，wire 协议版本 `1.0`。MDXP 的 schema 是线协议字段与错误码的唯一来源；本文件定义 Motrix-SPK 视频下载配置、批量调用约定及 NAS 运行要求。两端应共同使用此版本的公开 schema，不能各自复制一套 wire schema。

## 1. 能力范围

接口支持：

- 已配对 Extension 的身份验证及连接测试；
- 普通视频直链、HLS、DASH、分离视频/音频流；
- 逐资源传递媒体站点需要的 HTTP 请求头和作用域 Cookie；
- 批量提交多个独立任务，按任务查询状态及接收实时进度；
- 所有视频最终以 MP4 文件完成。兼容的 MP4 直接保存；可无损封装时优先封装；必要时由 NAS 上的 FFmpeg 转码为 H.264/AAC，尽可能保留分辨率与帧率。无转换能力或转换失败时任务必须报错，不能把非 MP4 结果标成完成。

下载目录在 DSM / Motrix-SPK 中由用户选择。Extension 只能从服务端返回的授权目录中选择，不能传电脑本地路径或任意 NAS 路径。

## 2. 传输与身份验证

MDXP 与传输解耦；Motrix-SPK 通过其配对流程提供给 Extension 的连接端点和认证材料必须由配对结果取得，客户端不得猜测端口、路径或生成身份。远程连接使用 TLS WebSocket（WSS）；本机直连可使用应用配对界面明确提供的本地端点。

Extension 必须完成 Motrix-SPK 的扩展配对与认证握手。身份认证由已配对客户端凭据、MBP1/PAKE 会话及服务端认证状态完成；`client.kind`、扩展 ID、浏览器名称和协议能力字段只是客户端声明，不能单独作为身份凭据。不得将 DSM 密码、配对密钥或凭据放入 URL、日志、页面脚本或普通扩展同步存储。

完成传输认证后：

1. 每个 MDXP 会话首先发送 `motrix/initialize`。
2. 服务端校验协议版本、配对身份与客户端能力，返回服务版本、运行时及服务端能力。
3. 握手成功后，客户端发送 `motrix/initialized` 通知，之后才调用下载 API。
4. 配对撤销、认证失败或连接关闭时，客户端停止调用并清除会话密钥。

## 3. MDXP 消息格式与连接测试

MDXP 使用 JSON-RPC 2.0 一请求一消息；**不支持 JSON-RPC batch envelope**。不得把多条请求包进 JSON 数组。运行时校验使用 `@motrix/mdxp@0.10.0` 导出的 Zod schema 与方法常量。

### 3.1 初始化

`motrix/initialize` 参数：

```ts
{
  protocolVersion: '1.0',
  client: {
    kind: 'extension',
    name: string,
    version: string,
    extensionId: string,
    browser: 'chromium' | 'firefox' | 'safari',
    browserVersion: string,
    locale: string
  },
  capabilities: {
    submitDownload?: boolean,
    resolveUrl?: boolean,
    probeUrl?: boolean,
    cancellation?: boolean,
    progress?: boolean
  },
  adapters: Array<{
    id: string,
    version: string,
    urlPatterns: string[],
    capabilities: Array<'resolve' | 'sniff' | 'batch'>
  }>
}
```

成功结果：

```ts
{
  protocolVersion: '1.0',
  server: { name: string, version: string, runtime: 'electron' | 'server' },
  capabilities: {
    ffmpegAvailable: boolean,
    selectionKinds: Array<'direct' | 'hls' | 'dash' | 'mux'>,
    progress: boolean,
    cancellation: boolean,
    downloadDirectories?: boolean
  },
  serverAdapters: Array<{ id: string, urlPatterns: string[] }>
}
```

其他可选能力可能由 MDXP 新版加入，旧客户端应忽略未知结果字段；客户端只可调用目标明确声明支持的方法/能力。对于 DSM 套件，`runtime` 应为 `server`。

### 3.2 连接测试：`system/ping`

只有认证与初始化完成后，使用 `system/ping` 测试业务连接：

请求：

```json
{ "sentAt": 1795762800000 }
```

成功响应：

```json
{ "sentAt": 1795762800000, "recvAt": 1795762800012 }
```

两个值均为 Unix 毫秒时间戳。传输连接成功但认证/初始化失败，不算 API 连接成功。可选用 `engine/status` 查看 aria2 引擎状态；不要用引擎状态代替配对认证结果。

## 4. 下载目录选择：`download/directories`

只有初始化结果声明 `capabilities.downloadDirectories === true 时才能调用。请求为严格空对象：

```json
{}
```

响应：

```json
{
  "defaultSaveDir": "/volume1/video",
  "favorites": ["/volume1/video", "/volume2/share/media"],
  "recent": ["/volume1/video"]
}
```

路径是 NAS 端路径，最多返回 20 个收藏目录和 10 个最近目录；默认目录不可用时为 `null`。界面应让用户选择返回的目录，并原样传入 `download/submit.saveDir`。不支持客户端自行浏览、创建或猜测路径。若目标未声明目录能力，则省略 `saveDir`，使用 NAS 当前默认目录。

Motrix-SPK 在任务受理前必须按当前的 NAS 共享文件夹授权、路径策略、目录状态及可写权限重新校验路径。目录被移除、权限撤回或路径无效时，拒绝该任务，不得静默改存其他目录。

## 5. 提交视频任务：`download/submit`

每个请求创建一个任务，参数由 `DownloadSubmitParamsSchema` 定义：

```ts
{
  source: {
    pageUrl: string,
    pageTitle: string,      // 最长 500 字符
    detectedAt: number,     // Unix 毫秒
    siteHint?: string       // 最长 64 字符
  },
  selection:
    | { kind: 'direct', primary: Resource, container?: string }
    | { kind: 'hls', primary: Resource, container?: 'mp4' | 'mkv' | 'ts' }
    | { kind: 'dash', primary: Resource, container?: 'mp4' | 'mkv' }
    | { kind: 'mux', video: Resource, audio: Resource, container?: 'mp4' | 'mkv' },
  saveDir?: string,         // 仅 downloadDirectories 能力开启后传入
  meta: {
    suggestedFilename: string, // 最长 255 字符
    qualityLabel: string,      // 最长 64 字符
    estimatedBytes?: number,   // 非负
    durationSec?: number       // 非负
  },
  idempotencyKey?: string   // 8–128 字符；建议每个逻辑任务必传
}
```

`Resource` 结构：

```ts
{
  url: string,                 // 仅 HTTP/HTTPS
  headers?: Record<string, string>,
  cookies?: Array<{
    name: string,
    value: string,
    domain: string,
    path?: string,             // 默认 /
    secure?: boolean,
    httpOnly?: boolean,
    sameSite?: 'strict' | 'lax' | 'none' | 'unspecified',
    expiresAt?: number         // Unix 毫秒
  }>,
  refererPolicy?: string       // 默认 strict-origin-when-cross-origin
}
```

### 5.1 类型含义

| `selection.kind` | 用途 | 任务处理 |
| --- | --- | --- |
| `direct` | 普通视频文件 URL | 服务端在 NAS 下载；识别容器与编码，按 MP4 输出策略直存、封装或转码 |
| `hls` | HLS 播放清单 URL | 服务端解析清单、下载分片、组装并输出 MP4 |
| `dash` | DASH MPD URL | 服务端解析视频/音轨 Representation，合并并输出 MP4 |
| `mux` | 已识别的分离视频轨和音频轨 | `video` 和 `audio` 分别给出 Resource，服务端合并并输出 MP4 |

`container` 是媒体解析/中间封装提示，不允许覆盖 Motrix-SPK 的“最终 MP4”要求。即使源站给出 WebM、MKV、TS 或其他容器，任务也不得以该容器作为最终成功文件。可无损封装时不重编码；必要时优先 H.264 视频与 AAC 音频。

### 5.2 请求头、Cookie 与来源安全

- `headers` 用于 NAS 请求媒体 URL、清单、分片及其必要的上游资源。常见字段包括 `Referer`、`Origin`、`User-Agent`、站点要求的 `Authorization` 或 `Cookie`。不得允许覆盖 `Host`、`Content-Length`、`Connection`、`Transfer-Encoding` 等传输控制字段。
- Cookie 优先使用带 domain、path、Secure、SameSite 和有效期信息的 `cookies` 数组，不得将 Cookie 平铺成无限制的全局请求头。服务端应在每次请求/重定向时执行作用域与有效期校验。
- 跳转到不同源站时，不得向新源转发原站的 `Cookie`、`Authorization` 或 `Proxy-Authorization`。
- 凭据不得写入普通日志、任务历史、磁盘侧车、缓存键或错误信息。任务所需秘密只在受保护的任务请求生命周期内使用。
- 服务端须重新校验 URL、协议、每次重定向及解析后的分片地址，应用 SSRF 与网络访问策略；schema 校验不代表资源访问已获授权。

### 5.3 结果与幂等

成功结果为：

```json
{ "taskId": "Motrix-SPK 生成的任务 ID" }
```

`idempotencyKey` 在同一认证 Extension 会话范围内标识一个逻辑任务。相同 key 和相同内容的重试返回原任务 ID；相同 key 被用于不同内容或不同保存目录时，返回 `InvalidParams`，不得创建第二个任务。服务端必须先持久化已接受任务，再返回成功。

## 6. 批量提交

MDXP 0.10.0 明确禁止 JSON-RPC batch envelope，且 `download/submit` 一次只接收一个视频。因此批量功能采用 **N 个独立的 `download/submit` 请求**，不增加与协议冲突的自定义请求体：

1. Extension 将用户选中的每个媒体资源转换成一个 `download/submit` 参数对象。
2. 每个对象使用独立的 `idempotencyKey`；同一批次重试时沿用原 key。
3. 逐项并发发送，客户端建议最多同时 4 个在途请求；服务端仍按套件设置实施任务并发与限速。
4. 每个响应分别记录 `taskId` 或结构化 JSON-RPC 错误。部分成功不回滚已接受任务，失败项可单独重试。
5. Extension 汇总展示本批次结果；已接受任务通过 `task/list`、`task/get` 和通知跟踪。

示例：

```ts
const results = await Promise.allSettled(
  selections.map((selection, index) =>
    conn.sendRequest('download/submit', {
      source,
      selection,
      saveDir,
      meta,
      idempotencyKey: batchId + ':' + index,
    })
  )
)
```

协议层不承诺跨多个视频的原子提交或单请求批量 ACK；若今后要增加专用 batch method，须先在共同的 MDXP schema/版本中定义，再由 SPK 和 Extension 一起升级。

## 7. 查询任务和进度

### 7.1 列表：`task/list`

参数（严格对象）：

```ts
{ status?: 'queued' | 'fetching_metadata' | 'downloading' | 'paused' | 'seeding' | 'finalizing' | 'completed' | 'error',
  limit?: number,  // 正整数
  offset?: number  // 非负整数
}
```

响应：

```ts
{ tasks: MdxpTask[], total: number }
```

### 7.2 单项：`task/get`

请求：`{ "taskId": "..." }`。响应：`{ "task": MdxpTask | null }`。

`MdxpTask` 基本字段：

```ts
{
  id: string,
  type: 'http' | 'ftp' | 'bt' | 'magnet' | 'metalink',
  name: string,
  status: 'queued' | 'fetching_metadata' | 'downloading' | 'paused' | 'seeding' | 'finalizing' | 'completed' | 'error',
  progress: number,             // 0–1
  bytesDone: number,
  bytesTotal: number | null,
  speedBps: number,
  etaSec: number | null,
  saveDir: string,
  error: string | null,
  createdAt: number,
  finishedAt: number | null,
  finalPath: string | null,     // 仅完成后返回
  errorCode?: string | null
}
```

`task/get` 的未知任务以 `task: null` 表示。任务路径属于目标 NAS；Extension 不得把它作为本机文件路径打开。界面可显示文件名与目录名；只允许使用服务端明确定义的任务显示/打开能力。

### 7.3 实时状态通知

Extension 初始化能力包含 `progress: true` 后，服务端可以推送：

- `$/task/progress`：`{ taskId, bytesDone, bytesTotal, speedBps, etaSec, phase }`；`phase` 为 `queued`、`downloading`、`muxing`、`finalizing`。
- `$/task/completed`：`{ taskId, filePath, durationMs }`。
- `$/task/error`：`{ taskId, code, message }`。
- `$/pair/revoked`：`{ reason }`。

通知用于即时刷新，不替代持久任务查询。重连后先使用 `task/list`／`task/get` 重建状态；客户端建议在活动任务期间以 2–5 秒间隔轮询，出现错误后退避至最多 30 秒。

## 8. 取消任务

`download/cancel` 请求：

```json
{ "taskId": "..." }
```

成功响应：

```json
{ "ok": true }
```

调用方只能取消当前认证 Extension 所有、且服务端允许该会话操作的任务。取消是协作式的；服务端应停止 aria2/分片下载与 FFmpeg 子进程，清理临时产物并将任务状态更新为 error/canceled（以公开 task schema 实际状态为准）。重复取消可视为幂等。不得通过任意文件路径删除任务产物。

## 9. 错误码

错误以 JSON-RPC error object 返回：

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "appCode": "download-directory-unavailable",
      "retryable": false
    }
  }
}
```

| 名称 | Code | 含义 |
| --- | ---: | --- |
| `ParseError` | -32700 | JSON 无法解析 |
| `InvalidRequest` | -32600 | JSON-RPC 消息无效；也用于拒绝协议不支持的 batch envelope |
| `MethodNotFound` | -32601 | 方法不存在或目标未启用 |
| `InvalidParams` | -32602 | schema、目录、字段组合或幂等键冲突 |
| `InternalError` | -32603 | 未预期服务端错误 |
| `RequestCancelled` | -32800 | 请求已取消 |
| `AdapterError` | -32001 | 资源/页面解析适配器失败 |
| `ResourceUnavailable` | -32002 | 来源资源不可用或服务端运行组件缺失 |
| `PermissionDenied` | -32003 | 配对身份未授权访问该方法/任务 |
| `RateLimited` | -32004 | 触发速率或并发限制 |
| `CapabilityNotSupported` | -32005 | 服务端未实现或未开启协商能力 |
| `PairRevoked` | -32006 | Extension 配对已撤销 |

服务端可在 `error.data.appCode` 中返回稳定机器码，并可包含 `retryable`、`retryAfterSec`。错误消息不得含配对密钥、Cookie、Authorization 值、NAS 内部绝对路径或含秘密查询参数的完整 URL。Extension 以错误 code/appCode 分流逻辑，不解析英文/中文 message。

## 10. Extension 端到端调用示例

以下用法假设扩展已从 Motrix-SPK 配对流程取得经认证的 MDXP 连接 `conn`。浏览器实现依赖 `@motrix/mdxp/browser`；不要用直接 REST fetch 绕过配对层。

```ts
import { Methods, Notifications } from '@motrix/mdxp'

// 连接测试。motrix/initialize 是本会话首个请求；之后发 initialized 通知。
const hello = await conn.sendRequest(Methods.MotrixInitialize, initializeParams)
conn.sendNotification(Notifications.MotrixInitialized, undefined)

if (hello.server.runtime !== 'server') {
  throw new Error('连接的不是 NAS 服务端')
}
const ping = await conn.sendRequest(Methods.SystemPing, { sentAt: Date.now() })
console.log('Motrix-SPK 已连接，往返毫秒：', ping.recvAt - ping.sentAt)

// 可选目录选择。路径只能来自服务端授权列表。
let saveDir: string | undefined
if (hello.capabilities.downloadDirectories) {
  const dirs = await conn.sendRequest(Methods.DownloadDirectories, {})
  saveDir = await showUserDirectoryPicker(dirs)
}

// 请求添加 HLS 视频。实际选择由嗅探器提供。
const { taskId } = await conn.sendRequest(Methods.DownloadSubmit, {
  source: {
    pageUrl: location.href,
    pageTitle: document.title.slice(0, 500),
    detectedAt: Date.now(),
  },
  selection: {
    kind: 'hls',
    primary: {
      url: 'https://cdn.example/video/index.m3u8',
      headers: {
        Referer: location.href,
        'User-Agent': navigator.userAgent,
      },
      cookies: [],
      refererPolicy: 'strict-origin-when-cross-origin',
    },
    container: 'mp4',
  },
  ...(saveDir ? { saveDir } : {}),
  meta: {
    suggestedFilename: '示例视频',
    qualityLabel: '1080p',
  },
  idempotencyKey: crypto.randomUUID(),
})

// 查询状态。
const { task } = await conn.sendRequest(Methods.TaskGet, { taskId })
```

音视频分离示例的 `selection`：

```ts
{
  kind: 'mux',
  video: {
    url: 'https://cdn.example/video/video.m4v',
    headers: { Referer: location.href },
    cookies: [],
  },
  audio: {
    url: 'https://cdn.example/audio/audio.m4a',
    headers: { Referer: location.href },
    cookies: [],
  },
  container: 'mp4',
}
```

## 11. 安全和兼容约束

- 所有不可信参数在客户端与服务端都按 MDXP 0.10.0 schema 校验。TypeScript 类型不等于运行时验证。
- 认证身份来自 Motrix-SPK 的传输/配对层，不来自请求体中的 `client` 字段或浏览器站点脚本。
- URL、跳转、清单和分片由 NAS 服务端再次执行 HTTP(S) 与 SSRF 安全校验。
- 仅在用户明确选择视频/点击下载后发送任务；不得在页面加载或后台轮询时静默提交。
- 日志不记录令牌、Cookie、Authorization 值；安全错误不得向客户端泄露内网拓扑。
- 每任务使用唯一 `idempotencyKey`；重发相同任务沿用同一 key，更换媒体、目录或其他关键参数时生成新 key。
- 服务端可以增加非破坏字段；未知结果字段由客户端忽略。不得改写既有字段含义；新增 breaking wire 形态前先升级两端共同使用的 MDXP schema。
- `@motrix/mdxp@0.10.0` 的 schema、方法常量、连接封装及错误码以 [motrixapp/mdxp v0.10.0](https://github.com/motrixapp/mdxp/tree/v0.10.0) 为准。

