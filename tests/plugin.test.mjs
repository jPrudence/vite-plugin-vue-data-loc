import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { compileTemplate, parse } from 'vue/compiler-sfc'
import vue from '@vitejs/plugin-vue'
import dataLoc from 'vite-plugin-vue-data-loc'

const root = path.resolve('fixture-project').replace(/\\/g, '/')
const id = `${root}/resources/js/Example.vue`

function setup(options) {
    const instance = dataLoc(options)
    const vuePlugin = vue()
    instance.configResolved({ root, plugins: [vuePlugin] })
    function compile(
        source,
        filename = id,
        { record = true, reuseAst = true } = {},
    ) {
        if (record)
            assert.equal(instance.transform.handler(source, filename), null)
        const { descriptor, errors } = parse(source, { filename })
        assert.deepEqual(errors, [])
        const result = compileTemplate({
            source: descriptor.template.content,
            ast: reuseAst ? descriptor.template.ast : undefined,
            filename: filename.replace(/\\/g, '/'),
            id: filename,
            compilerOptions: vuePlugin.api.options.template.compilerOptions,
        })
        assert.deepEqual(result.errors, [])
        return result.code
    }
    return { instance, compile }
}

test('preserves absolute lines, directives, slots and existing attributes', () => {
    for (const newline of ['\n', '\r\n']) {
        const { compile } = setup()
        const source = [
            '<script setup>const visible = true</script>',
            '<template>',
            '<div v-if="visible"><span /></div>',
            '<div v-else />',
            '<template v-for="item in items" :key="item"><Widget><template #default><b /></template></Widget></template>',
            '<p data-loc="manual"><b /></p>',
            '<p :data-loc="location" />',
            '</template>',
        ].join(newline)
        const output = compile(source)
        for (const line of [3, 4, 5, 6])
            assert.ok(
                output.includes(`resources/js/Example.vue:${line}`),
                output,
            )
        assert.ok(output.includes('manual'))
        assert.ok(output.includes('_ctx.location'))
        assert.ok(!output.includes('resources/js/Example.vue:7'))
        assert.equal(compile(source, id.replaceAll('/', '\\')), output)
    }
})

test('supports relative and absolute include directories without matching sibling directories', () => {
    const source = '<template><div /></template>'
    for (const include of ['src', 'src/', `${root}/src`]) {
        const { compile } = setup({ include })
        assert.ok(
            compile(source, `${root}/src/Test.vue`).includes('src/Test.vue:1'),
        )
        for (const filename of [
            id,
            `${root}/src-extra/Test.vue`,
            `${root}/other/src/Test.vue`,
        ]) {
            assert.ok(!compile(source, filename).includes('data-loc'))
        }
    }
})

test('lets Vue encode attribute values without HTML double escaping', () => {
    const { compile } = setup()
    const output = compile(
        '<template><div /></template>',
        id.replace('Example', 'A&B'),
    )
    assert.ok(output.includes('resources/js/A&B.vue:1'))
    assert.ok(!output.includes('&amp;'))
})

test('skips ASTs with template-relative coordinates and unrecorded virtual requests', () => {
    const source = '<template><div /></template>'
    const { compile } = setup()
    assert.ok(!compile(source, id, { reuseAst: false }).includes('data-loc'))
    for (const filename of [id + '?vue&type=template', id + '.ts']) {
        assert.ok(!compile(source, filename).includes('data-loc'))
    }
})

test('releases source references when a file is deleted or the server closes', () => {
    const source = '<template><div /></template>'
    const { instance, compile } = setup()
    assert.ok(compile(source).includes('data-loc'))
    instance.watchChange(id, { event: 'delete' })
    assert.ok(!compile(source, id, { record: false }).includes('data-loc'))
    assert.ok(compile(source).includes('data-loc'))
    instance.closeBundle()
    assert.ok(!compile(source, id, { record: false }).includes('data-loc'))
})

test('rejects invalid directories and only applies before compilation in development', () => {
    for (const include of ['', ' ', null, 123]) {
        assert.throws(() => dataLoc({ include }), TypeError)
    }
    assert.equal(dataLoc().apply, 'serve')
    assert.equal(dataLoc().enforce, 'pre')
})
