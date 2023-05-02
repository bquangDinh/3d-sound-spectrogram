import './style.scss'

import { Graph, GraphOptions } from './graph'

import { UIUtils } from './utils/utils'

import { CONSTANTS } from './constants/constants'

document.addEventListener(
	'DOMContentLoaded',
	async () => {
		const graph = new Graph(
			CONSTANTS.DOM_ELEMENTS.CANVAS_ID,
			CONSTANTS.DOM_ELEMENTS.CANVAS_CONTAINER_ID,
		)

		await graph.init()

		UIUtils.generateSelect(CONSTANTS.DOM_ELEMENTS.APP_SELECT_CLASSNAME, (val) => {
			graph.setOption('soundtrack', val)
		})

		UIUtils.adjustControllerLayout()

		// Check if WebGL is supported
		const gl = document.createElement('canvas').getContext('webgl2')

		if (!gl) {
			if (typeof WebGL2RenderingContext !== 'undefined') {
				// Browser does support WebGL2 but the OS is blocking the browser from using it
				// other OS has no gpu driver that capable for WebGL
				UIUtils.setSubHeaderText(
					'Your browser appears to support WebGL2 but it might be disabled by your OS',
					'warn',
				)
			} else {
				// no support for WebGL at all
				UIUtils.setSubHeaderText(
					'Your browser does not support WebGL2. Please try with another browser',
					'warn',
				)
			}
		}

		const optionBtns = document.getElementsByClassName(
			CONSTANTS.DOM_ELEMENTS.OPTION_BTN_CLASSNAME,
		) as HTMLCollectionOf<HTMLElement>

		const useWebWorkerCheckboxContainer = document.getElementById(
			CONSTANTS.DOM_ELEMENTS.WEBWORKER_CHECKBOX_CONTAINER_ID,
		)

		for (let i = 0; i < optionBtns.length; ++i) {
			const btn = optionBtns[i] as HTMLButtonElement

			const c = btn.dataset.opsCategory as GraphOptions
			const v = btn.dataset.opsValue

			// These option buttons are only available when WebGL is supported
			if (c === 'cameraMovement' || (c === 'graph' && v !== 'fft-2d')) {
				if (!gl) {
					UIUtils.toggleOptionButton(btn, true)
				}
			}

			optionBtns[i].addEventListener('click', (e) => {
				// https://salesforce.stackexchange.com/questions/397178/lwc-event-target-dataset-sometimes-empty-sometimes-not
				const target = e.currentTarget as HTMLElement

				const category = target.dataset.opsCategory as GraphOptions

				const value = target.dataset.opsValue

				if (!value) {
					throw new Error(`No value was found with category: ${category}`)
				}

				// special cases
				if (category === 'graph') {
					// In order to use these options, need WebGL supported
					// If WebGL isn't supported, then there is no point to execute
					// Except FFT2D becasuse it can draw on canvas if there's not WebGL
					if (!gl && value !== CONSTANTS.RENDERERS.NAMES.FFT2D) {
						// webgl is not supported
						return
					}

					if (value !== CONSTANTS.RENDERERS.NAMES.FFT3D) {
						// fft3d-pointgrdi and fft-2d not support webworker
						// so hide this option
						if (useWebWorkerCheckboxContainer) {
							useWebWorkerCheckboxContainer.classList.add('d-none')
						}
					} else {
						if (useWebWorkerCheckboxContainer) {
							useWebWorkerCheckboxContainer.classList.remove('d-none')
						}
					}

					// There is no camera support for FFT2D
					if (value === CONSTANTS.RENDERERS.NAMES.FFT2D) {
						document
							.querySelectorAll(
								`.${CONSTANTS.DOM_ELEMENTS.OPTION_BTN_CLASSNAME}[data-ops-category='cameraMovement']`,
							)
							.forEach((el) => {
								el.classList.add('disabled')
								el.setAttribute('disabled', 'disabled')
							})
					} else {
						// Enable camera movement
						document
							.querySelectorAll(
								`.${CONSTANTS.DOM_ELEMENTS.OPTION_BTN_CLASSNAME}[data-ops-category='cameraMovement']`,
							)
							.forEach((el) => {
								el.classList.remove('disabled')
								el.removeAttribute('disabled')
							})
					}
				}

				// unselect the source option
				const sourceOptionBtns = document.querySelectorAll(
					`button[data-ops-category='${category}']`,
				) as NodeListOf<HTMLElement>

				sourceOptionBtns.forEach((el) => (el.dataset.select = '0'))

				// mark this option as selected
				target.dataset['select'] = '1'

				// save option to graph
				graph.setOption(category, value)
			})
		}

		if (!gl) {
			// enable FFT2D only
			const fft2dbtn = document.querySelector(
				`.${CONSTANTS.DOM_ELEMENTS.OPTION_BTN_CLASSNAME}[data-ops-value="fft-2d"]`,
			) as HTMLButtonElement

			if (fft2dbtn) {
				fft2dbtn.dataset['select'] = '1'

				graph.setOption('graph', CONSTANTS.RENDERERS.NAMES.FFT2D)
			}
		}

		const useWebWorkerCheckbox = document.getElementById(
			CONSTANTS.DOM_ELEMENTS.USE_WEBWORKER_CHECKBOX_ID,
		) as HTMLInputElement

		if (useWebWorkerCheckbox) {
			useWebWorkerCheckbox.addEventListener('change', (ev) => {
				const target = ev.target as HTMLInputElement

				graph.setOption('webworker', target.checked)
			})
		}

		document.addEventListener('resize', () => {
			UIUtils.adjustControllerLayout()
		})

		const audioBtn = document.getElementById('file-audio-input')

		if (!audioBtn) {
			throw new Error('Audio File Input not found')
		}

		audioBtn.addEventListener(
			'change',
			(e: Event) => {
				const inputFile = e.currentTarget as HTMLInputElement

				if (inputFile.files) {
					graph.setSourceFromFile(inputFile.files[0])
				}
			},
			false,
		)

		// Start!
		graph.run()
	},
	false,
)
