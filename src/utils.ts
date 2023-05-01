import { fft, Phasors } from "fft-js"
import { vec2, vec3, vec4 } from "gl-matrix"

export interface IAudioBufferOptions {
	channel?: number
}

export interface Range {
	min: number,
	max: number
}

export interface INormalize {
	value: number,
	fromRange: Range,
	toRange: Range
}

export interface IVector3 {
	x: number,
	y: number,
	z: number,
}

export const NumberUtils = {
	getTheNextHighestPowerOf2: (val: number) => {
		val--

		val |= val >> 1
		val |= val >> 2
		val |= val >> 4
		val |= val >> 8
		val |= val >> 16

		val++

		return val
	},
	average: (data: number[]) => {
		return data.reduce((prev, curr) => prev + curr, 0) / data.length
	},
	normalize: (payload: INormalize) => {
		const { value, fromRange, toRange } = payload

		return ((toRange.max - toRange.min) * (value - fromRange.min) / (fromRange.max - fromRange.min)) + toRange.min
	},
	getIndexFromXYZ: (x: number, y: number, z: number, dims: vec3) => {
		return x + dims[0] * (y + dims[1] * z)
	},
	// Same function as min in GLSL
	mix: (a: number | vec2 | vec3 | vec4, b: number | vec2 | vec3 | vec4, value: number) => {
		const interpolate = (a: number, b: number, v: number) => {
			// https://registry.khronos.org/OpenGL-Refpages/gl4/html/mix.xhtml
			return a * (1 - v) + b * a
		}

		if (typeof a !== typeof b) {
			throw new Error('type a must be the same as type b')
		}

		if (typeof a === 'number' && typeof b == 'number') {
			// mix two numbers
			return interpolate(a, b, value)
		}

		if (Array.isArray(a) && Array.isArray(b)) {
			const la = a.length
			const lb = b.length

			if (la === 2 && lb === 2) {
				// vec2
				return vec2.fromValues(
					interpolate(a[0], b[0], value),
					interpolate(a[1], b[1], value),
				)
			}

			if (la === 3 && lb === 3) {
				// vec3
				return vec3.fromValues(
					interpolate(a[0], b[0], value),
					interpolate(a[1], b[1], value),
					interpolate(a[2], b[2], value),
				)
			}

			if (la === 4 && lb === 4) {
				// vec4
				return vec4.fromValues(
					interpolate(a[0], b[0], value),
					interpolate(a[1], b[1], value),
					interpolate(a[2], b[2], value),
					interpolate(a[3], b[3], value),
				)
			}
		}

		throw new Error('Invalid mix arguments!')
	},
}

export const ColorUtils = {
	interpolateColorByHeight: (height: number, maxHeight: number) => {
		const percentage = height / maxHeight

		if (percentage > 1 || percentage < 0) {
			throw new Error('Invalid height value or max height value for interpolate color')
		}

		let color: vec3

		if (percentage <= 0.4) {
			color = NumberUtils.mix([1, 0, 0], [1, 0, 1], percentage) as vec3
		} else if (percentage <= 0.6) {
			color = NumberUtils.mix([1, 0, 1], [0, 0, 1], (0.6 - percentage) / 0.2) as vec3
		} else if (percentage <= 0.8) {
			color = NumberUtils.mix([0, 0, 1], [0, 1, 1], (0.8 - percentage) / 0.2) as vec3
		} else {
			color = NumberUtils.mix([0, 1, 1], [0, 1, 0], (1 - percentage) / 0.2) as vec3
		}

		return color
	}
}

export const FileUtils = {
	getArrayBufferFromBlob: (blob: Blob): Promise<ArrayBuffer> => {
		const reader = new FileReader()

		reader.readAsArrayBuffer(blob)

		return new Promise((resolve, reject) => {
			reader.onload = function () {
				const arrayBuffer = reader.result as ArrayBuffer

				if (!arrayBuffer) {
					reject('Array Buffer is null')
				}

				resolve(arrayBuffer)
			}
		})
	},
	getAudioDataFromArrayBuffer: async (arrayBuffer: ArrayBuffer, {
		channel = 0,
	}: IAudioBufferOptions): Promise<Float32Array> => {
		const audioContext = new AudioContext()

		const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

		// Get audio buffer from a channel
		const audioBufferArray = audioBuffer.getChannelData(channel)

		return audioBufferArray
	},
	getFFTFrequenciesFromArray: (array: number[]): Phasors => {
		const clone = [...array]

		const nextPowerOf2 = NumberUtils.getTheNextHighestPowerOf2(clone.length)

		// Padding
		if (nextPowerOf2 !== clone.length) {
			for (let i = 0; i < nextPowerOf2; ++i) clone.push(0)
		}

		return fft(clone)
	}
}

export const UIUtils = {
	generateSelect: (className: string, onSelected?: (val: string) => void) => {
		const elements = document.getElementsByClassName(className)

		const length = elements.length

		let select: HTMLSelectElement
		let selectedItemContainer: HTMLDivElement
		let selectItemVal: HTMLDivElement
		let itemsContainer: HTMLDivElement
		let numItems: number

		const closeAllSelect = (element?: Element) => {
			const selectEles = document.getElementsByClassName(className)

			let itemsCon: HTMLDivElement

			for (let i = 0; i < selectEles.length; ++i) {
				// Skip the current select that being used
				if (element && selectEles[i] === element) {
					continue
				}

				itemsCon = selectEles[i].getElementsByClassName('items')[0] as HTMLDivElement

				if (itemsCon) {
					itemsCon.classList.add('d-hide')
				}
			}
		}

		// Initialize select for all elements
		for (let i = 0; i < length; ++i) {
			select = elements[i].getElementsByTagName('select')[0] as HTMLSelectElement

			selectedItemContainer = elements[i].getElementsByClassName('select-selected')[0] as HTMLDivElement

			selectItemVal = selectedItemContainer.getElementsByClassName('select-selected--val')[0] as HTMLDivElement

			itemsContainer = elements[i].getElementsByClassName('items')[0] as HTMLDivElement

			if (!select || !selectedItemContainer || !itemsContainer || !selectItemVal) {
				throw new Error('Not enough elements to construct select')
			}

			numItems = select.length

			// Make sure to hide the items container
			itemsContainer.classList.add('d-hide')

			// Make sure items container is empty since we're going to add items into the container
			while (itemsContainer.firstChild) {
				itemsContainer.removeChild(itemsContainer.firstChild)
			}

			// Make sure item contaienr is at the right position
			itemsContainer.style.top = `-300px`

			// Fetch items of select into items container
			for (let j = 0; j < numItems; ++j) {
				// If the option has no value (usually for placeholder)
				// Then don't add it
				if (select.options[j].value === 'NULL') {
					continue
				}

				// Create new option item
				const optionItem = document.createElement('div')

				optionItem.classList.add('item')

				// Check if this option is selected
				if (select.options[j].selected) {
					optionItem.classList.add('selected')

					selectItemVal.innerHTML = select.options[j].innerHTML
				}

				optionItem.innerHTML = select.options[j].innerHTML

				// Add event
				optionItem.addEventListener('click', (e) => {
					/**
					 * When an option item is clicked, update the original select box
					 * and update the selected item
					 */

					// [BUG]: it will use the next app select one because closure

					// Update the select box selected option
					select.selectedIndex = j

					// Update the selected item
					selectItemVal.innerHTML = optionItem.innerHTML

					// Remove .selected from the previous selected
					const previousSelectedItems = itemsContainer.getElementsByClassName('selected')

					for (let k = 0; k < previousSelectedItems.length; ++k) previousSelectedItems[k].classList.remove('selected')

					// Update option item class names
					optionItem.classList.add('selected')

					// Hide the items container
					itemsContainer.classList.add('d-hide')

					// Call callback
					if (onSelected) {
						onSelected(select.options[j].value)
					}
				})

				// Add option item to items container
				itemsContainer.appendChild(optionItem)
			}

			// Add event for selected item
			selectedItemContainer.addEventListener('click', (e) => {
				const target = e.target as HTMLDivElement

				const parent = target.parentNode!.parentElement

				const ic = parent?.getElementsByClassName('items')[0] as HTMLDivElement

				if (!ic) {
					throw new Error('Event target element not found!')
				}

				// toggle display
				ic.classList.toggle('d-hide')

				if (!ic.classList.contains('d-hide')) {
					const itemsContainerHeight = ic.clientHeight
					const offset = 5

					ic.style.top = `${-itemsContainerHeight - offset}px`
				}

				e.stopPropagation()
			})
		}

		document.addEventListener('click', (e) => {
			closeAllSelect()

			e.stopPropagation()
		})
	}
}