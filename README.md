# vite-plugin-vue-data-loc

Adds `data-loc="path/to/file.vue:line"` to Vue template elements during development, linking DOM elements to their source. Injected during Vue compilation, with source maps preserved.

## Installation

```sh
npm install -D git+https://github.com/jPrudence/vite-plugin-vue-data-loc.git
```

## Configuration

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dataLoc from 'vite-plugin-vue-data-loc'

export default defineConfig({
    plugins: [vue(), dataLoc()],
})
```

### Options

`include` — directory relative to the Vite root, or absolute path. Default: `resources/js`. Globs are not supported.

```js
dataLoc({ include: 'src' })
```

Output paths are relative to the Vite root. Existing `data-loc` attributes and bindings are preserved.

## Requirements

`@vitejs/plugin-vue` 6 · Vue `^3.5.30` · Vite 7/8 · Node.js `>=20.19.0`, subject to Vite's requirements.

## Limitations

- Development only.
- External templates, preprocessors, and custom compilers without full-file SFC AST reuse are skipped.
- Attributes on Vue components reach the DOM through `$attrs` forwarding.

## Development

```sh
npm ci
npm test
npm run benchmark
```

The benchmark measures synthetic SFC transformations with and without instrumentation, excluding startup and browser rendering.

## License

[MIT](LICENSE)
