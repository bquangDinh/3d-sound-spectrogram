import './style.css'
import fft from 'fft-js'
import ABCD from 'numeric'

function average (data: number[]) {
	return data.reduce((prev, curr) => prev + curr, 0) / data.length
}

function smooth (data: number[], alpha: number) {
	const avg = average(data) * alpha
	const smoothed: number[] = []

	for (let i = 0; i < data.length; ++i) {
		const curr = data[i]
		const prev = smoothed[i - 1] || data[data.length -1]
		const next = curr || data[0]
		const improved = average([avg, prev, curr, next])

		smoothed.push(improved)
	}

	return smoothed
}

function getTheNextHighestPowerOf2 (val: number) {
	val--

	val |= val >> 1
	val |= val >> 2
	val |= val >> 4
	val |= val >> 8
	val |= val >> 16

	val++

	return val
}

function cubicInterpolation (x: number[], y: number[]): [number[], number[]] {
	if (x.length !== y.length) {
		throw new Error('x and y must be the same length')
	}

	// Calculate the spline coefficient of x and y
	const spline = ABCD.spline(x, y)

	// Create an evenly spaced value of x
	const xSmooth = ABCD.linspace(x[0], x[x.length - 1], 150) as number[]

	const ySmooth = xSmooth.map((x) => {
		return spline.at(x)
	}) as number[]

	return [xSmooth, ySmooth]
}

function drawAudioDataToCanvas (data: Float32Array) {
	const canvasContainer = document.getElementById("canvas-container") as HTMLDivElement
	const canvas = document.getElementById("spectrogram-canvas") as HTMLCanvasElement

	if (!canvas) {
		throw new Error('No canvas is found!')
	}

	canvas.width = canvasContainer ? canvasContainer.clientWidth : window.innerWidth
	canvas.height = canvasContainer ? canvasContainer.clientHeight : window.innerHeight

	const ctx = canvas.getContext("2d")

	if (!ctx) {
		throw new Error('Canvas Context is not found')
	}

	const DELTAX = (canvas.width / data.length) + 0.025
	const MIDDLEY = canvas.height / 2

	let y: number

	// Begin drawing from the left of the canvas
	let lastX = 0
	let lastY = MIDDLEY

	for (const d of data) {
		y = MIDDLEY + (d * canvas.height / 2)

		ctx.beginPath()
		ctx.moveTo(lastX, lastY)
		ctx.lineTo(lastX + DELTAX, y)
		ctx.stroke()

		lastX = lastX + DELTAX
		lastY = y
	}
}

function normalize (val: number, min: number, max: number, newMin: number, newMax: number) {
	return ((newMax - newMin) * (val - min) / (max - min)) + newMin
}

function drawFFT (data: fft.Phasors) {
	const canvasContainer = document.getElementById("canvas-container") as HTMLDivElement
	const canvas = document.getElementById("spectrogram-canvas") as HTMLCanvasElement

	if (!canvas) {
		throw new Error('No canvas is found!')
	}

	canvas.width = canvasContainer ? canvasContainer.clientWidth : window.innerWidth
	canvas.height = canvasContainer ? canvasContainer.clientHeight : window.innerHeight

	const ctx = canvas.getContext("2d")

	if (!ctx) {
		throw new Error('Canvas Context is not found')
	}

	const mags = fft.util.fftMag(data) as number[]

	const fregs = fft.util.fftFreq(data, 8000) as number[]

	const [xSmooth, ySmooth] = cubicInterpolation(fregs, mags)

	let minFrequency: number = Number.POSITIVE_INFINITY
	let maxFrequency: number = Number.NEGATIVE_INFINITY;

	let minMagnitude: number = Number.POSITIVE_INFINITY;
	let maxMagnitude: number = Number.NEGATIVE_INFINITY;

	let fre: number,
		mag: number

	minFrequency = xSmooth[0]
	maxFrequency = xSmooth[xSmooth.length - 1]

	for (const val of ySmooth) {
		if (val < minMagnitude) {
			minMagnitude = val
		} else if (val > maxMagnitude) {
			maxMagnitude = val
		}
	}

	const getFre = (fre: number) => {
		return normalize(fre, minFrequency, maxFrequency, 0, canvas.width)
	}

	const getMag = (mag: number) => {
		return normalize(mag, minMagnitude, maxMagnitude, canvas.height - 10, 10)
	}

	const DELTAX = (canvas.width / data.length)
	const MIDDLEY = canvas.height / 2

	// Begin drawing from the left of the canvas
	let lastX = 0
	let lastY = canvas.height

	let y: number

	for (let i = 0; i < xSmooth.length; ++i) {
		fre = xSmooth[i]
		mag = ySmooth[i]

		fre = getFre(fre)
		mag = getMag(mag)

		y = mag

		ctx.beginPath()
		ctx.moveTo(lastX, lastY)
		ctx.lineTo(fre + DELTAX, y)
		ctx.stroke()

		lastX = fre + DELTAX
		lastY = y
	}
}

function readFile (ev: Event) {
	const input = ev.target as HTMLInputElement;
	const audioContext = new AudioContext()

	const reader = new FileReader()

	reader.onload = async function () {
		const arrayBuffer = reader.result as ArrayBuffer

		const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

		const audioBufferArray = audioBuffer.getChannelData(0)

		// Convert to frequencies
		// Since FFT only accept array of length of power of 2
		// So I have to do some padding here
		const arr = Array.from(audioBufferArray)

		const nextPowerOf2 = getTheNextHighestPowerOf2(arr.length)

		if (nextPowerOf2 !== arr.length) {
			for (let i = arr.length; i < nextPowerOf2; ++i) {
				arr.push(0)
			}
		}

		const frequencies = fft.fft(arr)

		drawFFT(frequencies)
	}

	if (input.files) {
		reader.readAsArrayBuffer(input.files[0])
	}
}

const audioBtn = document.getElementById('read-audio-file')

if (!audioBtn) {
	throw new Error('Audio Input cannot be found!')
}

audioBtn.addEventListener('change', readFile, false);