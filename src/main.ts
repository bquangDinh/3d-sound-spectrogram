import './style.css'

import { Graph, GraphOptions } from './graph'

import { UIUtils } from './utils'

document.addEventListener('DOMContentLoaded', async () => {
	const graph = new Graph('spectrogram-canvas', 'canvas-container')

	await graph.init()

	UIUtils.generateSelect('app-select', (val) => {
		console.log('Selected', val)
	})

	const optionBtns = document.getElementsByClassName('option-btn')

	for (let i = 0; i < optionBtns.length; ++i) {
		optionBtns[i].addEventListener('click', (e) => {
			// https://salesforce.stackexchange.com/questions/397178/lwc-event-target-dataset-sometimes-empty-sometimes-not
			const target = e.currentTarget as HTMLElement

			const category = target.dataset.opsCategory as GraphOptions

			const value = target.dataset.opsValue

			if (!value) {
				throw new Error(`No value was found with category: ${category}`)
			}

			// unselect the source option
			const sourceOptionBtns = document.querySelectorAll(`button[data-ops-category='${category}']`) as NodeListOf<HTMLElement>

			sourceOptionBtns.forEach((el) => el.dataset.select = "0")

			// mark this option as selected
			target.dataset['select'] = "1"

			// save option to graph
			graph.setOption(category, value)
		})
	}

	// Start!
	graph.run()
}, false)