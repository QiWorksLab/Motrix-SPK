# Motrix-SPK 视频任务 API（v1）

本文定义 Motrix-Extension 与 Motrix-SPK 之间的视频下载接口。Extension 只负责识别页面中的视频资源并提交任务；实际下载、分片调度、合并、转码、持久化和文件写入均由 NAS 上的 Motrix-SPK 执行。

- API 版本：1
- 根路径：`/api/v1`（若 Web 控制台配置了反向代理子路径，API 也位于同一子路径下）
- 编码：UTF-8 JSON；时间为 ISO 8601 UTC
- 本文状态：接口契约。服务端以本文定义为准；未实现的字段不得由客户端假定已生效。

## 1. 约定

### 1.1 URL、请求头与响应

所有 JSON 请求使用：

```http
Content-Type: application/json
Accept: application/json
```

成功响应统一为：

```json
{
  "ok": true,
  "data": {},
  "requestId": "req_01J..."
}
```

错误响应统一为：

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "请求参数无效",
    "retryable": false,
    "details": {}
  },
  "requestId": "req_01J..."
}
```

`requestId` 用于日志定位。客户端应读取 `error.code`，不要解析本地化的 `message`。

### 1.2 身份验证

除 `GET /connection` 的服务进程存活检查外，所有端点必须要求授权。Extension 使用管理员在 Motrix-SPK 控制台中批准配对后签发的集成访问令牌：

```http
Authorization: Bearer <integration-token>
```

令牌为随机高熵不透明值；服务端仅保存其摘要。令牌仅允许调用视频任务 API，不等同于 DSM 管理员密码。管理员可在控制台撤销令牌。不得将令牌放入 URL、日志、扩展同步存储或错误文本。

浏览器跨源调用只允许已配对的扩展来源；禁止通配符 CORS。非浏览器调用也必须使用 Bearer 令牌。令牌无效、缺失或已撤销时返回 `401 UNAUTHORIZED`。来源不在允许列表时返回 `403 ORIGIN_NOT_ALLOWED`。

### 1.3 下载目录

客户端不得传绝对路径。通过 `GET /destinations` 获取管理员已授权的下载目录，再用 `destinationId` 选择目录。没有传 `destinationId` 时使用服务端当前默认目录。服务端必须再次校验目录仍处于授权范围、可写且未被移除；失败时不得静默改写到其他目录。

### 1.4 视频输出

所有成功任务的最终文件扩展名必须为 `.mp4`：

1. 已兼容的 MP4 直接保存，不重复转码。
2. HLS、DASH、TS 分片及音视频分离优先无损封装。
3. 容器或编码不兼容时，服务端使用内置 FFmpeg 转码，优先 H.264/AAC，并尽可能保留源分辨率与帧率。
4. 所需 FFmpeg 不可用或资源无法转换时，任务以明确错误结束，不得把非 MP4 文件标为完成。
5. 临时分片、中间文件不得作为完成结果暴露；失败清理遵循任务保留策略。

## 2. 端点一览

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/connection` | 服务存活及认证连通测试 |
| GET | `/destinations` | 获取可选择的已授权下载目录 |
| POST | `/video/tasks` | 创建一个或一批视频任务 |
| GET | `/video/tasks` | 分页查询任务 |
| GET | `/video/tasks/{taskId}` | 查询单个任务状态 |
| POST | `/video/tasks/{taskId}/cancel` | 取消任务 |

## 3. 连接测试

### `GET /connection`

此端点只检查 HTTP 服务是否存活，不返回 NAS 用户、任务或配置数据；可用于未配置令牌前的网络诊断。

请求头可选；提供 Bearer 时，服务端可在响应中增加认证状态。未提供或无效的令牌仍可得到最小存活信息，但不能调用其他 API。

成功（HTTP 200）：

```json
{
  "ok": true,
  "data": {
    "service": "Motrix-SPK",
    "apiVersion": "1",
    "status": "online",
    "authenticated": false
  },
  "requestId": "req_01J..."
}
```

有有效令牌时 `authenticated` 为 `true`。连接测试不应被当作授权成功的唯一依据。

## 4. 下载目录

### `GET /destinations`

需要 Bearer 令牌。只返回管理员已经授权的目录。

响应（HTTP 200）：

```json
{
  "ok": true,
  "data": {
    "defaultDestinationId": "dst_7f2a",
    "items": [
      {
        "id": "dst_7f2a",
        "name": "视频",
        "writable": true,
        "isDefault": true
      },
      {
        "id": "dst_c311",
        "name": "公共文件夹/临时下载",
        "writable": true,
        "isDefault": false
      }
    ]
  },
  "requestId": "req_01J..."
}
```

目录 ID 是不透明标识，客户端不得自行拼接或推断 NAS 路径。不可写目录不应列入 `items`；目录配置被撤销后，已提交任务返回 `DESTINATION_UNAVAILABLE`。

## 5. 创建任务

### `POST /video/tasks`

需要 Bearer 令牌。单个请求最多提交 50 个任务；批次内每项独立校验，接受部分成功。服务端在响应前持久化任务记录并安排执行，响应不等待视频下载完成。

请求体支持单项格式：

```json
{
  "items": [
    {
      "clientRequestId": "ext-tab42-0001",
      "source": {
        "type": "hls",
        "url": "https://media.example/video/index.m3u8",
        "audioUrl": null,
        "headers": {
          "Referer": "https://www.example/watch/42",
          "User-Agent": "Mozilla/5.0"
        }
      },
      "fileName": "示例视频",
      "destinationId": "dst_7f2a",
      "metadata": {
        "pageUrl": "https://www.example/watch/42",
        "title": "示例视频"
      }
    }
  ]
}
```

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `items` | array | 是 | 1–50 项；顺序与响应结果一致 |
| `clientRequestId` | string | 是 | 客户端生成的幂等键，1–128 字符；同一令牌下重复键不得重复创建任务 |
| `source.type` | string | 是 | `direct`、`hls`、`dash` 或 `mux` |
| `source.url` | string | 是 | 主视频直链或清单 URL；仅允许 HTTP/HTTPS |
| `source.audioUrl` | string/null | 否 | 独立音轨地址；`mux` 类型需要音轨与视频轨 |
| `source.headers` | object | 否 | 来源站点请求头，键值均为字符串；单项总计最大 16 KiB |
| `fileName` | string | 是 | 建议文件名；服务端去除路径分隔符、非法字符并强制使用 `.mp4` |
| `destinationId` | string | 否 | `GET /destinations` 返回的 ID；不接受文件系统路径 |
| `metadata.pageUrl` | string | 否 | 原始网页地址，仅作来源记录；不用于下载 |
| `metadata.title` | string | 否 | 展示标题，最大 512 字符 |

类型解释：

- `direct`：普通视频文件直链；服务端根据容器和编码判断直存、封装或转码。
- `hls`：HLS 主清单 URL。服务端解析变体清单和分片，并支持按需解密上游当前支持的 HLS 加密类型。
- `dash`：DASH MPD URL。服务端解析视频 Representation；若请求中提供 `audioUrl`，则同时取独立音轨。
- `mux`：两个独立媒体资源需要合并。主 `url` 作为视频轨，`audioUrl` 作为音频轨；必要时调用 FFmpeg。

请求头安全规则：

- 允许媒体站点需要的 `Referer`、`Origin`、`User-Agent`、`Cookie`、`Authorization` 等常用来源头；禁止客户端覆盖 `Host`、`Content-Length`、`Connection`、`Transfer-Encoding` 等 hop-by-hop/传输控制头。
- 服务端不得把请求头写入普通访问日志。按重定向请求新主机时，必须剥离 `Cookie`、`Authorization`、`Proxy-Authorization` 等凭据，避免跨源泄露。
- URL、每一次重定向及解析出的分片地址都必须通过服务端 SSRF/协议和地址安全校验。拒绝访问回环、链路本地、未授权私网及 NAS 管理接口；不接受 file、ftp、javascript 等协议作为视频任务源。
- 请求头仅用于取得该任务对应的媒体，不得用于修改 NAS 设置或访问其他服务。

创建成功（HTTP 202；批次内每项状态可不同）：

```json
{
  "ok": true,
  "data": {
    "accepted": [
      {
        "clientRequestId": "ext-tab42-0001",
        "taskId": "vid_01JABC...",
        "status": "queued",
        "statusUrl": "/api/v1/video/tasks/vid_01JABC..."
      }
    ],
    "rejected": []
  },
  "requestId": "req_01J..."
}
```

部分成功仍返回 HTTP 202；未接受项目列入 `rejected`：

```json
{
  "clientRequestId": "ext-tab42-0002",
  "error": {
    "code": "UNSUPPORTED_SOURCE",
    "message": "该来源格式暂不支持",
    "retryable": false
  }
}
```

若整个请求结构无效，返回 HTTP 400，且不创建任何任务。相同 `clientRequestId` 的重试返回原 `taskId` 并标记 `duplicate: true`，不得重复下载。

## 6. 查询任务

### `GET /video/tasks`

需要 Bearer 令牌。查询参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `status` | string | 可重复传入；仅返回匹配状态 |
| `limit` | integer | 1–100，默认 50 |
| `cursor` | string | 上一页返回的不透明游标 |

响应：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "taskId": "vid_01JABC...",
        "clientRequestId": "ext-tab42-0001",
        "status": "downloading",
        "sourceType": "hls",
        "progress": {
          "percent": 42.5,
          "downloadedBytes": 89128960,
          "totalBytes": 209715200,
          "speedBytesPerSecond": 4194304,
          "remainingSeconds": 29,
          "phase": "downloading",
          "video": { "percent": 42.5 },
          "audio": null
        },
        "fileName": "示例视频.mp4",
        "destinationId": "dst_7f2a",
        "createdAt": "2026-11-27T07:00:00Z",
        "updatedAt": "2026-11-27T07:00:10Z",
        "error": null
      }
    ],
    "nextCursor": null
  },
  "requestId": "req_01J..."
}
```

### `GET /video/tasks/{taskId}`

返回同一任务对象。不存在或对当前集成令牌不可见时返回 `404 TASK_NOT_FOUND`，避免泄露其他用户任务。

任务状态：

| 状态 | 含义 |
| --- | --- |
| `queued` | 已持久化，等待执行 |
| `downloading` | 下载视频或音频轨 |
| `assembling` | 合并分片 |
| `muxing` | 将音视频流封装为 MP4 |
| `transcoding` | 必要的编码转换 |
| `completed` | MP4 已落盘并通过完成检查 |
| `failed` | 任务失败，查看 `error` |
| `canceling` | 正在停止子进程和清理临时文件 |
| `canceled` | 已取消 |

`progress.percent` 范围为 0–100。未知总大小时 `totalBytes`、`percent` 或 `remainingSeconds` 可为 `null`。服务端可用事件流推送更新，但客户端必须能通过本端点轮询恢复状态；建议 2–5 秒轮询一次，退避上限 30 秒。

完成对象还包含：

```json
{
  "output": {
    "fileName": "示例视频.mp4",
    "sizeBytes": 209715200
  }
}
```

不得在 Extension API 中返回可被客户端直接访问的任意文件系统绝对路径。

## 7. 取消任务

### `POST /video/tasks/{taskId}/cancel`

请求体为空。可取消 queued/downloading/assembling/muxing/transcoding 任务。幂等操作：重复取消返回当前状态。已完成任务返回 `409 TASK_ALREADY_COMPLETED`。

```json
{
  "ok": true,
  "data": {
    "taskId": "vid_01JABC...",
    "status": "canceling"
  },
  "requestId": "req_01J..."
}
```

## 8. 错误码

| HTTP | 错误码 | 说明 | 可重试 |
| --- | --- | --- | --- |
| 400 | `INVALID_ARGUMENT` | JSON、字段或字段组合无效 | 否 |
| 401 | `UNAUTHORIZED` | Bearer 缺失、无效、过期或已撤销 | 重新配对 |
| 403 | `ORIGIN_NOT_ALLOWED` | 调用来源未获管理员授权 | 否 |
| 404 | `TASK_NOT_FOUND` | 任务不存在或当前令牌无权查看 | 否 |
| 409 | `TASK_ALREADY_COMPLETED` | 完成任务无法取消 | 否 |
| 413 | `PAYLOAD_TOO_LARGE` | 请求体或请求头超限 | 否 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | 非 JSON 请求 | 否 |
| 422 | `UNSUPPORTED_SOURCE` | URL、清单或来源媒体不支持 | 否 |
| 422 | `DESTINATION_UNAVAILABLE` | 目标目录不存在、不可写或已撤销 | 否 |
| 422 | `INVALID_MEDIA_HEADERS` | 请求头包含禁止字段或格式错误 | 否 |
| 429 | `RATE_LIMITED` | 达到任务/请求速率限制 | 是；遵循 Retry-After |
| 500 | `INTERNAL_ERROR` | 未预期的服务端错误 | 视情况 |
| 502 | `UPSTREAM_ERROR` | 来源站点响应失败或媒体无效 | 视情况 |
| 503 | `MEDIA_ENGINE_UNAVAILABLE` | 下载引擎或 FFmpeg 不可用 | 是 |
| 504 | `UPSTREAM_TIMEOUT` | 来源请求超时 | 是 |

任务运行期错误保存在任务对象的 `error` 中，结构为 `{code,message,retryable}`。错误信息不得包含令牌、Cookie、Authorization 值、NAS 绝对路径或完整带敏感查询参数的 URL。

## 9. Extension 调用示例

### 检查服务与令牌

```js
const response = await fetch(baseUrl + '/api/v1/connection', {
  headers: { Authorization: `Bearer ${token}` }
})
if (!response.ok) throw new Error('Motrix-SPK 不可达')
const result = await response.json()
if (!result.data.authenticated) throw new Error('令牌无效')
```

### 读取可选目录并提交 HLS 任务

```js
const destinations = await fetch(baseUrl + '/api/v1/destinations', {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.json())

const created = await fetch(baseUrl + '/api/v1/video/tasks', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    items: [{
      clientRequestId: crypto.randomUUID(),
      source: {
        type: 'hls',
        url: 'https://cdn.example/video/master.m3u8',
        headers: {
          Referer: location.href,
          'User-Agent': navigator.userAgent
        }
      },
      fileName: 'video title',
      destinationId: destinations.data.defaultDestinationId,
      metadata: { pageUrl: location.href, title: document.title }
    }]
  })
}).then(r => r.json())
```

### 批量提交 DASH 视频与独立音轨

```json
{
  "items": [
    {
      "clientRequestId": "tab-a-1",
      "source": {
        "type": "dash",
        "url": "https://cdn.example/video/manifest.mpd",
        "headers": { "Referer": "https://site.example/watch/1" }
      },
      "fileName": "视频一"
    },
    {
      "clientRequestId": "tab-a-2",
      "source": {
        "type": "mux",
        "url": "https://cdn.example/video/track.mp4",
        "audioUrl": "https://cdn.example/audio/track.m4a",
        "headers": { "Authorization": "Bearer media-origin-token" }
      },
      "fileName": "视频二"
    }
  ]
}
```

### 轮询任务

```js
async function getTask(taskId) {
  const response = await fetch(
    baseUrl + '/api/v1/video/tasks/' + encodeURIComponent(taskId),
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const body = await response.json()
  if (!response.ok) throw body.error
  return body.data
}
```

## 10. 兼容和安全要求

- 未知字段应拒绝或按版本规则忽略；不得改变已有字段含义。破坏性调整须升级主版本。
- `clientRequestId`、`taskId` 与 `destinationId` 均区分大小写。
- 服务端限制任务并发和批次请求频率；并发上限由 Motrix-SPK 设置决定。
- 建立日志时脱敏令牌、Cookie、Authorization、敏感 URL 查询参数。
- Extension 不应将网页内容、页面脚本或页面提供的 URL 当成可信服务端配置；服务端需对提交数据重新校验。
