import { vec3, vec4 } from 'gl-matrix'
import { CONSTANTS } from '../constants/constants'
import { max, min } from 'lodash'
import { NumberUtils } from '../utils/utils'
import { EdgeVertexIndices, TriangleTable } from '../constants/lookup-table'

class TriangulateFFT {
	ffts: Uint8Array[] = []

	private readonly DIMENSIONS: vec3 = [512, 24, 65]

	private readonly VOXEL_SIZE = 1

	private readonly ISO_LEVEL = 0

	private data: vec4[] = []

	private vertices: number[] = []

	public maxX = Number.NEGATIVE_INFINITY

	public minX = Number.POSITIVE_INFINITY

	public maxZ = Number.NEGATIVE_INFINITY

	public minZ = Number.POSITIVE_INFINITY

	constructor() {
		// Initialize vertices data array
		// Each data is a vec4 contains x, y, z coordinate of the point and density value as 0
		// call z -> y -> z is COLUMN-MAJOR order
		for (let z = 0; z < this.DIMENSIONS[2]; ++z) {
			for (let y = 0; y < this.DIMENSIONS[1]; ++y) {
				for (let x = 0; x < this.DIMENSIONS[0]; ++x) {
					this.data.push(
						vec4.fromValues(
							x * this.VOXEL_SIZE,
							y * this.VOXEL_SIZE,
							z * this.VOXEL_SIZE,
							0,
						),
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

		this.triangulate()
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
			fft: Uint8Array

		let zIndex = 0

		// Update every vertices's densities
		for (let z = 0; z < this.DIMENSIONS[2]; ++z) {
			zIndex = this.DIMENSIONS[2] - 1 - z

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
					index = NumberUtils.getIndexFromXYZ(x, y, zIndex, this.DIMENSIONS)

					if (x >= fft.length) {
						// No data at x, then height is 0
						height = 0
					} else {
						height = NumberUtils.normalize({
							value: fft[x],
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

					value = height - this.data[index][1]

					// Update densities
					if (value < 0 || height === 0) {
						this.data[index][3] = 0
					} else {
						this.data[index][3] = value / height
					}
				}
			}
		}
	}

	private triangulate() {
		this.vertices = []

		this.minX = Number.POSITIVE_INFINITY

		this.maxX = Number.NEGATIVE_INFINITY

		this.minZ = Number.POSITIVE_INFINITY

		this.maxZ = Number.NEGATIVE_INFINITY

		let cube: vec4[] = []

		let index: number

		for (let z = 0; z < this.DIMENSIONS[2] - 1; ++z) {
			for (let y = 0; y < this.DIMENSIONS[1] - 1; ++y) {
				for (let x = 0; x < this.DIMENSIONS[0] - 1; ++x) {
					// Get 8 points of a voxel
					/**
					 * i = 0  (binary: 000)
						i = 1  (binary: 001)
						i = 2  (binary: 010)
						i = 3  (binary: 011)
						i = 4  (binary: 100)
						i = 5  (binary: 101)
						i = 6  (binary: 110)
						i = 7  (binary: 111)
					 */
					for (let i = 0; i < 8; ++i) {
						index = NumberUtils.getIndexFromXYZ(
							x + (i & 1), // access the least significant bit
							y + ((i >> 1) & 1), // shift right and access the least significant bit
							z + ((i >> 2) & 1), // shift right two times and access the least significant bit
							this.DIMENSIONS,
						)

						cube.push(this.data[index])
					}

					this.triangulateCube([...cube])

					cube = []
				}
			}
		}
	}

	// Construct the mesh from cube configuration
	// Implementation is inspired from https://www.youtube.com/watch?v=M3iI2l0ltbE&t=270s
	private triangulateCube(cube: vec4[]) {
		let cubeIndex = 0

		for (let i = 0; i < 8; ++i) {
			if (cube[i][3] > this.ISO_LEVEL) {
				cubeIndex |= 1 << i
			}
		}

		// Look up the triangulation for the current cubeIndex
		// Each entry is the index of the edge
		const triangulation = TriangleTable[cubeIndex]

		// The last number in triangulation is -1 indicates termination
		// I don't need it here, so I skip the last number
		let edgeIndex: number
		let i1: number, i2: number

		const vertexPos: vec3[] = []

		for (let i = 0; i < triangulation.length - 1; ++i) {
			edgeIndex = triangulation[i]

			// Lookup the indices of the corner points making up the current edge
			i1 = EdgeVertexIndices[edgeIndex][0]
			i2 = EdgeVertexIndices[edgeIndex][1]

			// Interpolate
			vertexPos.push(this.vertexInterp(cube[i1], cube[i2]))
		}

		for (let i = 0; i < vertexPos.length; i += 3) {
			this.addTriangle(vertexPos[i], vertexPos[i + 1], vertexPos[i + 2])
		}
	}

	// Interpolate between two points based on iso level
	// Point is a vec4 that contains x, y, x, d
	// d is the density value of the point
	// x, y, z is the coordinate of the point in world space
	private vertexInterp(p1: vec4, p2: vec4, iso?: number) {
		const isoLevel = iso ?? this.ISO_LEVEL

		if (Math.abs(isoLevel - p1[3]) < Number.EPSILON)
			return vec3.fromValues(p1[0], p1[1], p1[2])
		if (Math.abs(isoLevel - p2[3]) < Number.EPSILON)
			return vec3.fromValues(p2[0], p2[1], p2[2])
		if (Math.abs(p2[3] - p1[3]) < Number.EPSILON || (p2[3] === 0 && p1[3] === 0))
			return vec3.fromValues(p1[0], p1[1], p1[2])

		const mu = (isoLevel - p1[3]) / (p2[3] - p1[3])

		const p: vec3 = vec3.fromValues(
			p1[0] + mu * (p2[0] - p1[0]),
			p1[1] + mu * (p2[1] - p1[1]),
			p1[2] + mu * (p2[2] - p1[2]),
		)

		return p
	}

	/**
	 * Add triangle points and its normal surface to vertices array buffer
	 * @param p1 1st point
	 * @param p2 2nd point
	 * @param p3 3rd point
	 */
	private addTriangle(p1: vec3, p2: vec3, p3: vec3) {
		// Calculate normal vector
		const p12 = vec3.sub(vec3.create(), p1, p2)
		const p13 = vec3.sub(vec3.create(), p1, p3)

		const normal = vec3.cross(vec3.create(), p12, p13)

		this.minX = min([this.minX, p1[0], p2[0], p3[0]]) ?? Number.POSITIVE_INFINITY

		this.maxX = max([this.maxX, p1[0], p2[0], p3[0]]) ?? Number.NEGATIVE_INFINITY

		this.minZ = min([this.minZ, p1[2], p2[2], p3[2]]) ?? Number.POSITIVE_INFINITY

		this.maxZ = max([this.maxZ, p1[2], p2[2], p3[2]]) ?? Number.NEGATIVE_INFINITY

		this.vertices.push(
			p1[0],
			p1[1],
			p1[2],
			normal[0],
			normal[1],
			normal[2],
			p2[0],
			p2[1],
			p2[2],
			normal[0],
			normal[1],
			normal[2],
			p3[0],
			p3[1],
			p3[2],
			normal[0],
			normal[1],
			normal[2],
		)
	}
}

const runner = new TriangulateFFT()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: Worker = self as any

ctx.addEventListener('message', (e) => {
	const { type, data, bufferIndex } = e.data

	if (!type || !data) {
		throw new Error('Invalid data transfered to worker')
	}

	if (type === CONSTANTS.WORKER.SOURCE_FROM_MAIN_THREAD) {
		if (data && data instanceof ArrayBuffer) {
			runner.addFFT(data)
			runner.update()

			// console.log(`minx: ${runner.minX} | minz: ${runner.minZ} | maxx: ${runner.maxX} | maxz: ${runner.maxZ}`)

			// After runner done triangulate
			// Send data back to main thread
			const result = runner.writeToBuffer()

			ctx.postMessage(
				{
					type: CONSTANTS.WORKER.RESULT_FROM_WORKER,
					data: result,
					min: {
						x: runner.minX,
						z: runner.minZ,
					},
					max: {
						x: runner.maxX,
						z: runner.maxZ,
					},
					bufferIndex,
				},
				[result],
			)
		}
	}
})
