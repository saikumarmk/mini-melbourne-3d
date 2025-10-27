import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import postcss from 'rollup-plugin-postcss';

const production = !process.env.ROLLUP_WATCH;

export default {
    input: 'src/index.js',
    output: [
        {
            file: 'dist/mini-melbourne-3d.js',
            format: 'iife',
            name: 'MelbourneMap',
            sourcemap: true
        }
    ],
    external: [],
    plugins: [
        replace({
            'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
            preventAssignment: true
        }),
        resolve({
            browser: true,
            preferBuiltins: false
        }),
        commonjs(),
        postcss({
            extract: 'mini-melbourne-3d.css',
            minimize: production,
            sourceMap: true
        }),
        production && terser()
    ],
    watch: {
        clearScreen: false
    }
};

