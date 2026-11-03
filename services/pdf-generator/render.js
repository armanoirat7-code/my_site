const puppeteer = require("puppeteer-core");

const chrome =
  process.env.CHROME_PATH ||
  (process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "");

let browserPromise = null;
let chain = Promise.resolve();

function enqueue(job) {
  const run = chain.then(job, job);
  chain = run.then(
    () => {},
    () => {}
  );
  return run;
}

async function browser() {
  if (!chrome) throw new Error("chrome_missing");
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ["--disable-dev-shm-usage"],
    });
  }
  return browserPromise;
}

async function htmlToPdf(html, landscape) {
  return enqueue(async () => {
    const instance = await browser();
    const page = await instance.newPage();
    try {
      await page.setContent(html, { waitUntil: "load" });
      return await page.pdf({
        format: "A4",
        landscape: Boolean(landscape),
        printBackground: true,
        preferCSSPageSize: false,
        margin: { top: "14mm", right: "12mm", bottom: "16mm", left: "12mm" },
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate:
          '<div style="font-size:8pt;width:100%;text-align:center;font-family:Arial,sans-serif;color:#444;">Страница <span class="pageNumber"></span> из <span class="totalPages"></span></div>',
      });
    } finally {
      await page.close();
    }
  });
}

module.exports = { htmlToPdf };
