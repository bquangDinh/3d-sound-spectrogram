import { util as FFTUtil } from "fft-js";
import { FileUtils, NumberUtils } from "./utils";
import { min, max } from "lodash";
import { Shader } from "./webgl/shader";
import { ShaderProgram } from "./webgl/shader-program";

export class Graph {
	private canvas!: HTMLCanvasElement
	private canvasContainer!: HTMLDivElement

	constructor(
		canvasId: string,
		canvasContainerId: string
	) {
		this.canvas = document.getElementById(canvasId) as HTMLCanvasElement
		this.canvasContainer = document.getElementById(canvasContainerId) as HTMLDivElement

		if (!this.canvas || !this.canvasContainer) {
			throw new Error('Canvas Or Container is null')
		}

		this.canvas.width = this.canvasContainer.clientWidth
		this.canvas.height = this.canvasContainer.clientHeight
	}

	public async fromFile (file: File) {
		const arrayBuffer = await FileUtils.getArrayBufferFromBlob(file)

		const audioData = await FileUtils.getAudioDataFromArrayBuffer(arrayBuffer, {
			channel: 0
		})

		// Since FFT only accept array of length of power of 2
		// So I have to do some padding here
		const audioArray = Array.from(audioData)

		const nextPowerOf2 = NumberUtils.getTheNextHighestPowerOf2(audioArray.length)

		if (nextPowerOf2 !== audioArray.length) {
			for (let i = audioArray.length; i < nextPowerOf2; ++i) {
				audioArray.push(0)
			}
		}

		const phasors = await FileUtils.getFFTFrequenciesFromArray(audioArray)

		const ctx = this.canvas.getContext('2d')

		if (!ctx) {
			throw new Error('Your browser does not support canvas')
		}

		const magnitudes = FFTUtil.fftMag(phasors) as number[]
		const frequecies = FFTUtil.fftFreq(phasors, 4000) as number[]

		const minMagnitude = min(magnitudes) as number
		const maxMagnitude = max(magnitudes) as number

		const getXFromFrequency = (fre: number) => {
			return NumberUtils.normalize({
				value: fre,
				fromRange: {
					min: frequecies[0],
					max: frequecies[frequecies.length - 1]
				},
				toRange: {
					min: 0,
					max: this.canvas.width
				}
			})
		}

		const getYFromMagnitude = (mag: number) => {
			return NumberUtils.normalize({
				value: mag,
				fromRange: {
					min: minMagnitude,
					max: maxMagnitude,
				},
				toRange: {
					// Since 0,0 is the top left corner of the canvas
					// if min is 0, and max is height, the graph will be upside down
					min: this.canvas.height - 10,
					max: this.canvas.height / 2,
				}
			})
		}

		const DELTAX = this.canvas.width / frequecies.length

		let lastX = getXFromFrequency(frequecies[0])
		let lastY = getYFromMagnitude(magnitudes[0])

		let x: number, y: number

		for (let i = 1; i < frequecies.length; ++i) {
			x = getXFromFrequency(frequecies[i])
			y = getYFromMagnitude(magnitudes[i])

			ctx.beginPath()
			ctx.moveTo(lastX, lastY)
			ctx.lineTo(x + DELTAX, y)
			ctx.stroke()

			lastX = x + DELTAX
			lastY = y
		}

	}

	public async fromMicrophone () {
		if (!navigator.mediaDevices.getUserMedia) {
			throw new Error('Your browser does not support microphone')
		}

		const ctx = this.canvas.getContext('2d')

		if (!ctx) {
			throw new Error('Your browser does not support canvas')
		}

		const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

		const audioContext = new AudioContext()

		const mic = audioContext.createMediaStreamSource(stream)

		const analyser = audioContext.createAnalyser()

		analyser.fftSize = 1024

		const bufferLength = analyser.frequencyBinCount

		const dataArray = new Uint8Array(bufferLength)

		mic.connect(analyser)

		analyser.connect(audioContext.destination)

		const draw = () => {
			requestAnimationFrame(draw)

			analyser.getByteFrequencyData(dataArray)

			ctx.fillStyle = "rgb(0, 0, 0)";
			ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

			const barWidth = (this.canvas.width / bufferLength) * 2.5;
			let barHeight;
			let x = 0;

			for (let i = 0; i < bufferLength; i++) {
				barHeight = dataArray[i];

				ctx.fillStyle = "rgb(" + (barHeight + 100) + ",50,50)";
				ctx.fillRect(
					x,
					this.canvas.height - barHeight / 2,
					barWidth,
					barHeight / 2
				);

				x += barWidth + 1;
			}
		}

		draw()
	}

	private async fromMic () {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

		const audioContext = new AudioContext()

		const mic = audioContext.createMediaStreamSource(stream)

		const analyser = audioContext.createAnalyser()

		analyser.fftSize = 512

		mic.connect(analyser)

		analyser.connect(audioContext.destination)

		return analyser
	}

	public async testWebGL () {
		const gl = this.canvas.getContext('webgl2')

		if (!gl) {
			throw new Error('Your browser does not support WebGL2')
		}

		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

		const vertexShaderSource = `#version 300 es

			// an attribute is an input (in) to a vertex shader.
			// It will receive data from a buffer
			in vec2 a_position;

			uniform vec2 u_resolution;

			// all shaders have a main function
			void main() {
				// Convert the position from pixels to -1 -> +1 in clip space
				vec2 zeroToOne = a_position / u_resolution;
				vec2 zeroToTwo = zeroToOne * 2.0;
				vec2 clipSpace = zeroToTwo - 1.0;

				gl_Position = vec4(clipSpace, 0, 1);
			}
		`;

		const fragmentShaderSource = `#version 300 es

			// fragment shaders don't have a default precision so we need
			// to pick one. highp is a good default. It means "high precision"
			precision highp float;

			// we need to declare an output for the fragment shader
			out vec4 outColor;

			void main() {
				// Just set the output to a constant reddish-purple
				outColor = vec4(1, 0, 0.5, 1);
			}
		`;

		const vertexShader = new Shader(gl, vertexShaderSource, gl.VERTEX_SHADER)

		const fragmentShader = new Shader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER)

		const shaderProgram = new ShaderProgram(gl, [vertexShader, fragmentShader])

		const positionAttributeLocation = gl.getAttribLocation(shaderProgram.program, 'a_position')

		// Create VAO
		const vao = gl.createVertexArray()

		// Use this VAO
		gl.bindVertexArray(vao)

		// Create position buffer that contains every point's locations in FFT
		const lineBuffer = gl.createBuffer()

		const indexBuffer = gl.createBuffer()

		const analyser = await this.fromMic()

		const bufferLength = analyser.frequencyBinCount

		const dataArray = new Uint8Array(bufferLength)

		let pointPositions: number[] = []

		let indices: number[] = []

		const draw = () => {
			requestAnimationFrame(draw)

			// Make sure the buffer is cleared
			pointPositions = []

			indices = []

			// Fetch dataArray with data from the microphone
			analyser.getByteFrequencyData(dataArray)

			const DELTAX = gl.canvas.width / bufferLength

			// Start drawing from the bottom-left corner of the canvas
			let lastX = 0, lastY = 0

			let y: number

			pointPositions.push(lastX, lastY)

			for (let i = 0; i < bufferLength; ++i) {
				y = dataArray[i]

				pointPositions.push(lastX + DELTAX, y)

				indices.push(i, i + 1)

				// Update lastX, lastY
				lastX += DELTAX
				lastY = y
			}

			// Tell WebGL to use the array buffer
			gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer)

			// Fetch the array buffer
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pointPositions), gl.DYNAMIC_DRAW)

			// Tell WebGL to use the indices array buffer
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)

			// Fetch the index buffer
			gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.DYNAMIC_DRAW)

			// Use line buffer
			gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer)

			gl.enableVertexAttribArray(positionAttributeLocation)

			// Instruct WebGL how to read the buffer
			const size = 2 // x, y components
			const type = gl.FLOAT
			const normalize = false
			const stride = 0
			const offset = 0

			gl.vertexAttribPointer(positionAttributeLocation, size, type, normalize, stride, offset)

			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)

			// Make canvas transparent
			gl.clearColor(0, 0, 0, 0)
			gl.clear(gl.COLOR_BUFFER_BIT)

			shaderProgram.use()

			gl.bindVertexArray(vao)

			shaderProgram.setVec2('u_resolution', [gl.canvas.width, gl.canvas.height])

			gl.drawElements(gl.LINES, indices.length, gl.UNSIGNED_SHORT, 0)

			console.log(indices)
		}

		draw()
	}
}