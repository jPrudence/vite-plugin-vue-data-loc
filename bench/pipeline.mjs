import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import dataLoc from 'vite-plugin-vue-data-loc'

const require = createRequire(import.meta.url)
const count = 40
const rounds = 5
const timings = { baseline: [], instrumented: [] }
const root = await realpath(
    await mkdtemp(path.join(tmpdir(), 'data-loc-bench-')),
)
try {
    await mkdir(path.join(root, 'src'))
    for (let round = 0; round < rounds; round++) {
        // Rotate execution order to reduce warmup/order bias.
        const modes = Object.keys(timings)
        modes.push(...modes.splice(0, round % modes.length))
        for (const mode of modes) {
            for (let index = 0; index < count; index++) {
                const elements = Array.from(
                    { length: 150 },
                    (_, n) =>
                        `<section class="row"><span>{{ value + ${n} }}</span><button @click="value++">Update</button></section>`,
                ).join('\n')
                await writeFile(
                    path.join(root, `src/Component${index}.vue`),
                    `<script setup>import { ref } from 'vue'; const value = ref(${index});</script>\n<template>\n<!-- ${round} ${mode} ${index} -->\n<div>\n${elements}\n</div></template>`,
                )
            }
            const server = await createServer({
                configFile: false,
                root,
                logLevel: 'silent',
                resolve: {
                    alias: {
                        vue: require.resolve('vue/dist/vue.runtime.esm-bundler.js'),
                    },
                },
                plugins: [
                    vue(),
                    ...(mode === 'baseline'
                        ? []
                        : [dataLoc({ include: 'src' })]),
                ],
                server: { middlewareMode: true, hmr: false, watch: null },
                optimizeDeps: { noDiscovery: true, include: [] },
            })
            try {
                const start = performance.now()
                for (let index = 0; index < count; index++) {
                    const result = await server.transformRequest(
                        `/src/Component${index}.vue`,
                    )
                    if (
                        mode !== 'baseline' &&
                        !result.code.includes(`src/Component${index}.vue:5`)
                    ) {
                        throw new Error(`Missing instrumentation in ${mode}`)
                    }
                }
                timings[mode].push(performance.now() - start)
            } finally {
                await server.close()
            }
        }
    }
    console.log(
        `Vite client pipeline, ${count} synthetic SFCs, 451 elements each, ${rounds} rounds; excludes server startup.`,
    )
    for (const [mode, values] of Object.entries(timings)) {
        const sorted = [...values].sort((a, b) => a - b)
        console.log(
            `${mode}: median ${sorted[Math.floor(sorted.length / 2)].toFixed(1)} ms; rounds ${values.map((v) => v.toFixed(1)).join(', ')}`,
        )
    }
} finally {
    await rm(root, { recursive: true, force: true })
}
