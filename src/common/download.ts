/** Saves text as a file through the browser's normal download flow (extension pages only). */
export function _downloadTextFile(filename: string, text: string): void {
	const blob = new Blob([text], { type: 'text/plain' });
	const url = (window.URL || window.webkitURL).createObjectURL(blob);
	const a = document.createElement('a');

	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();

	document.body.removeChild(a);
	window.URL.revokeObjectURL(url);
}
