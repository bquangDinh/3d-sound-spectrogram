import './style.css'

import { Graph } from './graph'

// export async function onReadFile (e: Event) {
// 	// Retrieve the input file target
// 	const inputFile = e.target as HTMLInputElement

// 	if (inputFile.files) {
// 		const graph = new Graph('spectrogram-canvas', 'canvas-container')

// 		graph.fromFile(inputFile.files[0])
// 	}
// }

// const audioBtn = document.getElementById('read-audio-file')

// if (!audioBtn) {
// 	throw new Error('Audio Input cannot be found!')
// }

// audioBtn.addEventListener('change', onReadFile, false);

const graph = new Graph('spectrogram-canvas', 'canvas-container')

graph.fromMicrophone()