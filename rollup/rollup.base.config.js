const resolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');
const sourceMaps = require('rollup-plugin-sourcemaps');
const camelCase = require('lodash.camelcase');
const typescript = require('rollup-plugin-typescript2');
const uglify = require('rollup-plugin-uglify');
const json = require('rollup-plugin-json');
const ignore = require( 'rollup-plugin-ignore' );

const pkg = require('../package.json')

const libraryName = 'diaspora'

module.exports = (minify, externalize) => {
	const libName = camelCase(libraryName);
	const getFileName = libFile => {
		const extRegex = /(\.(t|j)sx?)/;
		if(!externalize){
			libFile = libFile.replace(extRegex, '.standalone$1');
		}
		if(minify){
			libFile = libFile.replace(extRegex, '.min$1');
		}
		return libFile;
	}
	const globals = externalize ? {
		'lodash': '_',
		'sequential-event': 'SE',
	} : undefined

	const commonjsConfig = {
		namedExports: {
			'node_modules/lodash/lodash.js': Object.keys(require('lodash'))
		}
	};

	const config = {
		input: 'lib/index.js',
		output: [
			{ file: getFileName(`umd/${libName}.js`), name: libName, format: 'umd', sourcemap: true, globals, exports: 'named' },
			{ file: getFileName(`es5/${libName}.js`), name: libName, format: 'es', sourcemap: true, globals, exports: 'named' },
		],
		// Indicate here external modules you don't wanna include in your bundle (i.e.: 'lodash')
		external: (externalize ? ['lodash', 'sequential-event'] : []).concat(['winston', 'request-promise']),
		
		watch: {
			include: 'src/**',
		},
		plugins: [
			// Compile TypeScript files
			typescript(),
			
			json(),
			
			ignore('winston', 'request-promise'),
		].concat(minify ? [
			// Minify
			uglify(),
		] : []).concat([
			// Allow node_modules resolution, so you can use 'external' to control
			// which external modules to include in the bundle
			// https://github.com/rollup/rollup-plugin-node-resolve#usage
			resolve({
				browser: true,
			}),
			// Allow bundling cjs modules (unlike webpack, rollup doesn't understand cjs)
			commonjs(commonjsConfig),
			
			// Resolve source maps to the original source
			sourceMaps(),
		]),
	}
	return config;
};