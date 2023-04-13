import { util as FFTUtil } from "fft-js";
import { FileUtils, NumberUtils } from "./utils";
import { min, max } from "lodash";

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

		analyser.fftSize = 512

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
}