/**
 * Saves a file where the person picks, through the browser's save dialog where it has one, or as a
 * download otherwise. Resolves to the saved file's name, or null when the person cancels the dialog.
 */
export async function saveFile(file: File, type: { description: string; extension: string }): Promise<string | null> {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: file.name,
        types: [{ description: type.description, accept: { [file.type]: [type.extension] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(file);
      await writable.close();
      return handle.name;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return file.name;
}
