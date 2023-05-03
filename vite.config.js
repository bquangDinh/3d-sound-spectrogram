/** @type {import('vite').UserConfig} */
import { defineConfig } from 'vite';

import eslint from 'vite-plugin-eslint';
// import { createHtmlPlugin } from 'vite-plugin-html';
import removeConsole from "vite-plugin-remove-console";

// const URL = 'https://qdinh.me/project/a367df59-b8b0-4265-ad20-cc9f74cfb9f7'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
		eslint(),
		removeConsole(),
		// createHtmlPlugin({
		// 	minify: false,
		// 	inject: {
		// 		data: {
		// 			URL,
		// 		}
		// 	}
		// })
	],
	build: {
		assetsDir: './',
	},
	base: './'
});