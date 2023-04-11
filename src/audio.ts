/**
 * Read File event
 * @param e
 * @returns ArrayBuffer
 */
export function onReadFile (e: Event): Promise<ArrayBuffer> {
	// Retrieve the input file target
	const inputFile = e.target as HTMLInputElement

	// Create a new file reader
	const reader = new FileReader()

	if (inputFile.files) {
		reader.readAsArrayBuffer(inputFile.files[0])
	}

	return new Promise((resolve, reject) => {
		// When reader finished reading the data
		reader.onload = async function () {
			const arrayBuffer = reader.result as ArrayBuffer

			if (!arrayBuffer) {
				reject('Array Buffer is null')
			}

			resolve(arrayBuffer)
		}
	})
}