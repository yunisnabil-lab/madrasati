// Prints the current page with a meaningful suggested filename.
//
// A browser's "Save as PDF" print destination names the file after
// document.title — but the app's <title> is the generic Vite placeholder
// ("dashboard-ui") on every page, so every printed report was landing on
// disk under that same arbitrary name. This sets a real, specific title
// just for the print, then restores the previous one once printing is
// done (or dismissed).
export function printWithTitle(title) {
  const prev = document.title;
  document.title = title;
  const restore = () => {
    document.title = prev;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}
