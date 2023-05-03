declare module 'fft-js' {
	type Phasors = [number, number][]

	function dft(vector: number[]): Phasors
	function fft(vector: number[]): Phasors
	function fftInPlace(): unknown
	function idft(phasors: Phasors): Phasors
	function ifft(phasors: Phasors): Phasors
	const util: {
		exponent: () => void
		fftFreq: (phasors: Phasors, freq: number) => unknown
		fftMag: (phasors: Phasors) => unknown
	}
}
