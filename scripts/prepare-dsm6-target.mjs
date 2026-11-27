#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../upstream/Motrix'
)
const expectedCommit = '0ad4223f9d8c1c5a989a83035d75e7e7a7498b2b'
const expectedToolchainSha256 =
  '84c39e280bc4c70dcb7f74dd45dfe6c71e393433dcf55a2428087a879a4d9636'
const nodeVersion = '24.22.3'
const nodeArchiveSha256 =
  'f15f516e7a451982730cdc6fdb7928205f5b2935deba70e6543705f04847c911'
const nodeBinarySha256 =
  'd09440b3d78298e285c342a2f15a0924c278e0a2cfbbc1b057f8e5ebf69bbd43'
const dsmVersion = '6.2.3-25426'

async function read(relative) {
  return readFile(path.join(root, relative), 'utf8')
}

async function write(relative, value) {
  await writeFile(path.join(root, relative), value)
}

const { execFileSync } = await import('node:child_process')
const actualCommit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim()
if (actualCommit !== expectedCommit) {
  throw new Error(`Upstream source changed: expected ${expectedCommit}, got ${actualCommit}`)
}

const lock = JSON.parse(await read('scripts/synology-runtime.lock.json'))
lock.dsmVersion = dsmVersion
lock.glibc = '2.20'
lock.revision = 1
lock.targets = {
  x64: {
    infoArch: 'x86_64',
    dockerPlatform: 'linux/amd64',
    machine: 62,
    sysroot:
      'x86_64-pc-linux-gnu/x86_64-pc-linux-gnu/sys-root',
    loader: 'lib/ld-linux-x86-64.so.2',
    platforms: {
      bromolow: {
        toolchain: {
          url:
            'https://sourceforge.net/projects/dsgpl/files/Tool%20Chain/DSM%206.2.4%20Tool%20Chains/Intel%20x86%20linux%203.10.105%20%28Bromolow%29/bromolow-gcc493_glibc220_linaro_x86_64-GPL.txz/download',
          sha256: expectedToolchainSha256,
        },
        digestSource:
          'https://github.com/SynoCommunity/spksrc/blob/master/toolchain/syno-bromolow-6.2.4/digests',
      },
    },
  },
}
await write(
  'scripts/synology-runtime.lock.json',
  `${JSON.stringify(lock, null, 2)}\n`
)

// Node's official Linux x64 binary requires newer GLIBCXX symbols than DSM
// 6.2.3 ships. Pin the Node.js unofficial glibc 2.17 build for the package
// runtime; keep the CI/build host on the official Node.js distribution.
const nodeLockPath = 'scripts/fnos-runtime.lock.json'
const nodeLock = JSON.parse(await read(nodeLockPath))
nodeLock.nodeVersion = nodeVersion
nodeLock.node.x64 = {
  url: `https://unofficial-builds.nodejs.org/download/release/v${nodeVersion}/node-v${nodeVersion}-linux-x64-glibc-217.tar.xz`,
  sha256: nodeArchiveSha256,
  binarySha256: nodeBinarySha256,
}
await write(nodeLockPath, `${JSON.stringify(nodeLock, null, 2)}\n`)

// The unofficial archive adds `-glibc-217` to its top-level directory.
const preparePath = 'scripts/prepare-synology-project.mjs'
let prepare = await read(preparePath)
const oldPrefix = 'const prefix = `node-v${nodeLock.nodeVersion}-linux-${arch}`'
const newPrefix =
  "const prefix = `node-v${nodeLock.nodeVersion}-linux-${arch}${arch === 'x64' ? '-glibc-217' : ''}`"
if (!prepare.includes(oldPrefix)) {
  throw new Error('Unexpected Synology Node archive extraction path')
}
prepare = prepare.replace(oldPrefix, newPrefix)
await write(preparePath, prepare)

const infoPath = 'packaging/synology/INFO'
let info = await read(infoPath)
if (!info.includes('os_min_ver="7.2.2-72806"')) {
  throw new Error('Unexpected upstream DSM minimum; review the package metadata before patching')
}
info = info.replace(
  'os_min_ver="7.2.2-72806"',
  `os_min_ver="${dsmVersion}"`
)
await write(infoPath, info)

console.log(
  JSON.stringify(
    {
      sourceCommit: actualCommit,
      target: 'DS3615xs-j / Bromolow / x86_64',
      installMetadataMinimum: dsmVersion,
      sysroot: 'DSM 6.2.4 Bromolow, kernel 3.10.105, glibc 2.20',
      toolchainSha256: expectedToolchainSha256,
      nodeRuntime: `Node.js v${nodeVersion} glibc-2.17 x64 build`,
      nodeArchiveSha256,
      nodeBinarySha256,
      note: 'Probe only: package is not installable until ABI and NAS acceptance pass.',
    },
    null,
    2
  )
)
