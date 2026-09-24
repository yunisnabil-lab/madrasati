// Turns the report's print sheet (components/PrintSheet.jsx) into a PDF, as
// base64, so it can be attached to an email. The sheet is drawn to an image
// (html2canvas) and placed on A4 pages (jsPDF) — that way Arabic letters keep
// their shapes exactly as in the printed version. Both libraries are loaded
// from cdnjs the first time they are needed, not with the app.

const LIBS = {
  html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
};

const loaded = {};
function loadScript(key) {
  if (!loaded[key]) {
    loaded[key] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIBS[key];
      s.onload = resolve;
      s.onerror = () => { delete loaded[key]; reject(new Error(`could not load ${key}`)); };
      document.head.appendChild(s);
    });
  }
  return loaded[key];
}

// sheet: the .ps-sheet element. Returns the PDF as a base64 string (no prefix).
export async function sheetToPdfBase64(sheet) {
  if (!sheet) throw new Error('report sheet not found');
  await Promise.all([loadScript('html2canvas'), loadScript('jspdf')]);

  // A4 at 96 dpi is 794px wide; draw a copy off-screen at that width
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;padding:36px 30px;background:#fff;z-index:-1';
  holder.dir = document.documentElement.dir || 'rtl';
  const copy = sheet.cloneNode(true);
  copy.classList.remove('hidden', 'print:block');
  copy.style.display = 'block';
  holder.appendChild(copy);
  document.body.appendChild(holder);

  try {
    const canvas = await window.html2canvas(holder, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width; // full height at page width, in mm

    // slice the tall image into page-sized strips
    const stripPx = Math.floor((pageH * canvas.width) / pageW);
    for (let y = 0, page = 0; y < canvas.height; y += stripPx, page++) {
      const strip = document.createElement('canvas');
      strip.width = canvas.width;
      strip.height = Math.min(stripPx, canvas.height - y);
      strip.getContext('2d').drawImage(canvas, 0, y, canvas.width, strip.height, 0, 0, canvas.width, strip.height);
      if (page > 0) pdf.addPage();
      pdf.addImage(strip.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, Math.min(pageH, imgH - page * pageH));
    }
    const dataUri = pdf.output('datauristring');
    return dataUri.slice(dataUri.indexOf('base64,') + 7);
  } finally {
    holder.remove();
  }
}
