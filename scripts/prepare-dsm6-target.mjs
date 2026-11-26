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
      note: 'Probe only: package is not installable until ABI and NAS acceptance pass.',
    },
    null,
    2
  )
)
