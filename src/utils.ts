import { fft, Phasors } from "fft-js"
import { vec3 } from "gl-matrix"

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