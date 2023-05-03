import { vec3 } from 'gl-matrix'
import { CONSTANTS } from '../constants/constants'
import { max } from 'lodash'
import { NumberUtils } from '../utils/utils'

class Runner {
	ffts: Uint8Array[] = []

	private readonly DIMENSIONS: vec3 = [512, 24, 65]

	private readonly VOXEL_SIZE = 2

	private vertices: number[] = []

	constructor() {
		// Initialize vertices data array
		// Each data is a vec4 contains x, y, z coordinate of the point and density value as 0
		// call z -> y -> z is COLUMN-MAJOR order
		for (let z = 0; z < this.DIMENSIONS[2]; ++z) {
			for (let y = 0; y < this.DIMENSIONS[1]; ++y) {
				for (let x = 0; x < this.DIMENSIONS[0]; ++x) {
					this.vertices.push(
						x * this.VOXEL_SIZE,
						y * this.VOXEL_SIZE,
						z * this.VOXEL_SIZE,
						0,
					)
				}
			}
		}
	}

	public addFFT(buffer: ArrayBuffer) {
		// If the array is full, then throw the old one
		if (this.ffts.length > this.DIMENSIONS[2]) {
			this.ffts.shift()
		}

		// read buffer
		const dataView = new DataView(buffer)

		// Uint8 is 1 byte each
		const length = dataView.byteLength

		const fft = new Uint8Array(length)

		let value: number

		for (let i = 0; i < length; ++i) {
			// Since uint8 is 1 byte each
			value = dataView.getUint8(i)

			fft[i] = value
		}

		// add to ffts
		this.ffts.push(fft)
	}

	public update() {
		this.updateData()
	}

	public writeToBuffer(): ArrayBuffer {
		const buffer = new ArrayBuffer(this.vertices.length * 4)

		const dataView = new DataView(buffer)

		for (let i = 0; i < this.vertices.length; ++i) {
			dataView.setFloat32(i * 4, this.vertices[i])
		}

		return buffer
	}

	private updateData() {
		// If FFT data is empty, then nothing to do here
		if (this.ffts.length === 0) return

		const MAX_HEIGHT = this.VOXEL_SIZE * this.DIMENSIONS[1]

		let height: number,
			value: number,
			index: number,
			maxHeightFFT: number,
			fft: Uint8Array,
			xComp: number

		// Update every vertices's densities
		for (let z = 0; z < this.DIMENSIONS[2]; ++z) {
			// fft[z] is undefined here so skip this iteration
			if (z >= this.ffts.length) {
				continue
			}

			fft = this.ffts[this.ffts.length - 1 - z]

			maxHeightFFT = max(fft) ?? 0

			// For some rare cases
			// Like with the Airpods that has a very powerful noise-canceling tech built-in
			// The FFT graph may come out empty leading to maxHeightFFT = 0
			// Dividing to zero is forbidden
			// So to make sure it doesn't happen, just skip this iteration
			if (maxHeightFFT === 0) continue

			for (let y = 0; y < this.DIMENSIONS[1]; ++y) {
				for (let x = 0; x < this.DIMENSIONS[0]; ++x) {
					index = NumberUtils.getIndexFromXYZ(x, y, z, this.DIMENSIONS)

					index *= 4

					xComp = this.vertices[index] / this.VOXEL_SIZE

					if (xComp >= fft.length) {
						// No data at x, then height is 0
						height = 0
					} else {
						height = NumberUtils.normalize({
							value: fft[xComp],
							fromRange: {
								min: 0,
								max: maxHeightFFT,
							},
							toRange: {
								min: 0,
								max: MAX_HEIGHT - this.VOXEL_SIZE,
							},
						})
					}

					value = height - this.vertices[index + 1]

					// Update densities
					if (value < 0 || height === 0) {
						this.vertices[index + 3] = 0
					} else {
						this.vertices[index + 3] = value / height
					}
				}
			}
		}
	}
}

let runner: Runner | null = null

// Check if runner has been created
// Make sure it is created once
if (!runner) {
	runner = new Runner()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: Worker = self as any

ctx.addEventListener('message', (e) => {
	if (!runner) {
		// runner not ready
		return
	}

	const { type, data, bufferIndex } = e.data

	if (!type || !data) {
		throw new Error('Invalid data transfered to worker')
	}

	if (type === CONSTANTS.WORKER.SOURCE_FROM_MAIN_THREAD) {
		if (data && data instanceof ArrayBuffer) {
			runner.addFFT(data)
			runner.update()

			// After runner done triangulate
			// Send data back to main thread
			const result = runner.writeToBuffer()

			ctx.postMessage(
				{
					type: CONSTANTS.WORKER.RESULT_FROM_WORKER,
					data: result,
					bufferIndex,
				},
				[result],
			)
		}
	}
})
