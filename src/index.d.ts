import type { Plugin } from 'vite'

export interface DataLocOptions {
    /** Directory relative to Vite root, or an absolute path. Not a glob. Default: 'resources/js'. */
    include?: string
}

export default function dataLocPlugin(options?: DataLocOptions): Plugin
