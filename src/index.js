import path from 'node:path'

function hasDataLoc(node) {
    return node.props.some(
        (prop) =>
            (prop.type === 6 && prop.name === 'data-loc') ||
            (prop.type === 7 &&
                prop.name === 'bind' &&
                prop.arg?.type === 4 &&
                prop.arg.isStatic &&
                prop.arg.content === 'data-loc'),
    )
}

/**
 * @param {import('./index.js').DataLocOptions} [options]
 * @returns {import('vite').Plugin}
 */
export default function dataLocPlugin({ include = 'resources/js' } = {}) {
    if (typeof include !== 'string' || !include.trim()) {
        throw new TypeError('include must be a non-empty directory path')
    }

    let root
    let sourceDirectory
    const sources = new Map()

    function recordSource(code, id) {
        const filename = id.replace(/\\/g, '/')
        if (
            !filename.endsWith('.vue') ||
            filename.includes('?') ||
            !filename.startsWith(sourceDirectory)
        ) {
            return
        }
        sources.set(filename, {
            code,
            relativePath: path.relative(root, filename).replace(/\\/g, '/'),
        })
    }

    function transformNode(node, context) {
        if (node.type !== 1 || node.tag === 'template' || hasDataLoc(node)) {
            return
        }
        const source = sources.get(context.filename.replace(/\\/g, '/'))
        // Only reused full-file SFC ASTs have absolute source coordinates.
        if (!source || context.root.source !== source.code) {
            return
        }
        node.props.push({
            type: 6,
            name: 'data-loc',
            nameLoc: node.loc,
            value: {
                type: 2,
                content: `${source.relativePath}:${node.loc.start.line}`,
                loc: node.loc,
            },
            loc: node.loc,
        })
    }

    return {
        name: 'vite-plugin-vue-data-loc',
        apply: 'serve',
        enforce: 'pre',
        configResolved(config) {
            root = config.root
            sourceDirectory =
                path
                    .resolve(root, include)
                    .replace(/\\/g, '/')
                    .replace(/\/$/, '') + '/'
            const vue = config.plugins.find(
                (plugin) => plugin.name === 'vite:vue',
            )
            if (!vue?.api?.options || !/^6\./.test(vue.api.version)) {
                throw new Error(
                    'vite-plugin-vue-data-loc requires @vitejs/plugin-vue 6',
                )
            }
            const template = vue.api.options.template ?? {}
            const compilerOptions = template.compilerOptions ?? {}
            vue.api.options = {
                ...vue.api.options,
                template: {
                    ...template,
                    compilerOptions: {
                        ...compilerOptions,
                        nodeTransforms: [
                            ...(compilerOptions.nodeTransforms ?? []),
                            transformNode,
                        ],
                    },
                },
            }
        },
        watchChange(id, change) {
            if (change.event === 'delete') {
                sources.delete(id.replace(/\\/g, '/'))
            }
        },
        async handleHotUpdate(context) {
            const filename = context.file.replace(/\\/g, '/')
            if (
                filename.endsWith('.vue') &&
                filename.startsWith(sourceDirectory)
            ) {
                recordSource(await context.read(), filename)
            }
        },
        closeBundle() {
            sources.clear()
        },
        transform: {
            filter: { id: /\.vue$/ },
            handler(code, id) {
                recordSource(code, id)
                return null
            },
        },
    }
}
