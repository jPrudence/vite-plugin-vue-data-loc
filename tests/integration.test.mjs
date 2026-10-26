import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import { createServer as createServer7 } from 'vite7'
import vue from '@vitejs/plugin-vue'
import dataLoc from 'vite-plugin-vue-data-loc'

const require = createRequire(import.meta.url)

for (const [version, createViteServer] of [
    [7, createServer7],
    [8, createServer],
]) {
    test(`works through Vite ${version} client, SSR and template updates`, async () => {
        const root = await realpath(
            await mkdtemp(path.join(tmpdir(), 'data-loc-')),
        )
        let server
        try {
            await mkdir(path.join(root, 'src'))
            const filename = path.join(root, 'src/Test.vue').replace(/\\/g, '/')
            const source =
                '<script setup lang="ts">const show = true</script>\n<template>\n<div v-if="show"><span data-loc="manual" /></div>\n</template>'
            await writeFile(filename, source)
            let visited = 0
            const vuePlugin = vue({
                template: {
                    compilerOptions: {
                        nodeTransforms: [
                            () => {
                                visited++
                            },
                        ],
                    },
                },
            })
            const dataLocPlugin = dataLoc({ include: 'src' })
            server = await createViteServer({
                configFile: false,
                root,
                logLevel: 'silent',
                resolve: {
                    alias: {
                        vue: require.resolve('vue/dist/vue.runtime.esm-bundler.js'),
                    },
                },
                plugins: [vuePlugin, dataLocPlugin],
                server: { middlewareMode: true, hmr: false, watch: null },
                optimizeDeps: { noDiscovery: true, include: [] },
            })
            const main = await server.transformRequest('/src/Test.vue')
            assert.ok(main.code.includes('src/Test.vue:3'), main.code)
            const templateUrl = '/src/Test.vue?vue&type=template&lang.js'
            const client = await server.transformRequest(templateUrl)
            assert.ok(client.code.includes('src/Test.vue:3'), client.code)
            assert.ok(client.code.includes('manual'))
            assert.ok(visited > 0, 'preserves existing compiler transforms')
            assert.ok(client.map, 'retains Vue source maps')

            const ssr =
                await server.environments.ssr.transformRequest('/src/Test.vue')
            assert.ok(ssr.code.includes('src/Test.vue:3'), ssr.code)

            const updated = source.replace('<div v-if', '\n<div v-if')
            await writeFile(filename, updated)
            const context = {
                file: filename,
                timestamp: Date.now(),
                modules: [
                    ...(server.moduleGraph.getModulesByFile(filename) ?? []),
                ],
                read: async () => updated,
                server,
            }
            await dataLocPlugin.handleHotUpdate(context)
            await vuePlugin.handleHotUpdate(context)
            server.moduleGraph.invalidateAll()
            // Request the virtual template first: real template-only HMR may skip the main SFC.
            const hot = await server.transformRequest(templateUrl)
            assert.ok(hot.code.includes('src/Test.vue:4'), hot.code)
        } finally {
            await server?.close()
            await rm(root, { recursive: true, force: true })
        }
    })
}

test('native hook filter rejects virtual template requests', () => {
    const instance = dataLoc()
    assert.ok(instance.transform.filter.id.test('/src/Test.vue'))
    assert.equal(
        instance.transform.filter.id.test('/src/Test.vue?vue&type=template'),
        false,
    )
    assert.equal(instance.transform.filter.id.test('/src/main.ts'), false)
})

test('compiler integration requires the supported Vue plugin', () => {
    assert.throws(
        () =>
            dataLoc().configResolved({
                root: process.cwd(),
                plugins: [],
            }),
        /requires @vitejs\/plugin-vue 6/,
    )
})
