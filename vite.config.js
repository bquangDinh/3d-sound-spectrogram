/** @type {import('vite').UserConfig} */
import { defineConfig } from 'vite';

import eslint from 'vite-plugin-eslint';
import { createHtmlPlugin } from 'vite-plugin-html';
import removeConsole from "vite-plugin-remove-console";

const PROJECT_ID = '8b403c6e-ac30-4dfb-839c-37e1bd0edc11'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
		eslint(),
		removeConsole(),
		createHtmlPlugin({
			minify: true,
			inject: {
				data: {
					PROJECT_ID,
				}
			}
		})
	],
	build: {
		assetsDir: './',
	},
	base: './'
});