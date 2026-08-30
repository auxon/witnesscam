import puppeteer from "puppeteer-core";

const chrome =
  process.env.CHROME || "/usr/bin/google-chrome";
const base = process.env.BASE_URL || "http://localhost:5173/";

const errors = [];
const log = [];

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--use-fake-ui-for-media-stream"],
});

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes("404") || text.includes("favicon")) return;
    errors.push(`console: ${text}`);
  });

  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(base, { waitUntil: "networkidle0" });
  log.push(`title=${await page.title()}`);

  const brand = await page.$eval(".brand", (el) => el.textContent.trim());
  if (!brand.includes("WitnessCam")) throw new Error(`bad brand: ${brand}`);

  const holder = await page.waitForSelector(".field input");
  await holder.click({ clickCount: 3 });
  await holder.type("Richard Hein");

  const buttons = await page.$$eval(".actions .btn", (els) =>
    els.map((e) => e.textContent.trim()),
  );
  log.push(`studio buttons: ${buttons.join(" | ")}`);
  if (!buttons.includes("Sample still")) throw new Error("missing Sample still");

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("Sample still"),
    );
    btn?.click();
  });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].some((b) =>
        b.textContent.includes("Seal evidence"),
      ),
    { timeout: 8000 },
  );
  log.push("sample still loaded");

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("Seal evidence"),
    );
    btn?.click();
  });
  await page.waitForFunction(
    () => location.hash.includes("/bag/"),
    { timeout: 15000 },
  );
  log.push(`sealed url=${page.url()}`);

  const seal = await page.$eval(".seal", (el) => el.textContent.trim());
  log.push(`seal=${seal}`);
  if (!seal.includes("INTACT")) throw new Error(`seal not intact: ${seal}`);

  const hash = await page.$eval("dd.mono.wrap", (el) => el.textContent.trim());
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(`bad hash: ${hash}`);
  log.push(`contentHash=${hash}`);

  const op = await page.$$eval("dd.mono.wrap", (els) =>
    els.map((e) => e.textContent.trim()),
  );
  const opReturn = op.find((t) => t.startsWith("6a"));
  if (!opReturn) throw new Error("missing OP_RETURN");
  log.push(`opReturn=${opReturn.slice(0, 16)}… len=${opReturn.length}`);

  const types = await page.$$eval(".log li strong", (els) =>
    els.map((e) => e.textContent.trim()),
  );
  log.push(`events=${types.join(",")}`);
  for (const t of ["CAPTURED", "ENCRYPTED", "HASHED", "TIMESTAMPED"]) {
    if (!types.includes(t)) throw new Error(`missing event ${t}`);
  }

  await page.type('.transfer input[placeholder^="Newsroom"]', "Ottawa Newsdesk");
  await page.type(
    '.transfer input[placeholder^="Handed"]',
    "Handoff for story",
  );
  await page.click(".transfer .btn");
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".log li strong")].some(
        (e) => e.textContent === "TRANSFERRED",
      ),
    { timeout: 8000 },
  );
  log.push("transferred");

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("Open verify desk"),
    );
    btn?.click();
  });
  await page.waitForFunction(() => location.hash.includes("/verify/"));
  const verdict = await page.$eval(".verdict", (el) => el.textContent.trim());
  log.push(`verdict=${verdict}`);
  if (!verdict.startsWith("MATCH")) throw new Error(`verify failed: ${verdict}`);

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("nav button")].find((b) =>
      b.textContent.includes("Ledger"),
    );
    btn?.click();
  });
  await page.waitForSelector("table.ledger tbody tr");
  const rows = await page.$$eval("table.ledger tbody tr", (els) => els.length);
  log.push(`ledger rows=${rows}`);
  if (rows < 1) throw new Error("empty ledger");

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("nav button")].find((b) =>
      b.textContent.includes("Lineage"),
    );
    btn?.click();
  });
  await page.waitForFunction(() =>
    document.body.innerText.includes("STaCS DNA"),
  );
  log.push("lineage ok");

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("nav button")].find((b) =>
      b.textContent.includes("Locker"),
    );
    btn?.click();
  });
  await page.waitForSelector(".bag-row");
  log.push("locker has bag");

  await page.setViewport({ width: 390, height: 844 });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("nav button")].find((b) =>
      b.textContent.includes("Studio"),
    );
    btn?.click();
  });
  await page.waitForSelector(".studio");
  const studio = await page.$eval(".studio", (el) => {
    const cs = getComputedStyle(el);
    return { columns: cs.gridTemplateColumns, width: el.getBoundingClientRect().width };
  });
  log.push(`mobile studio columns=${studio.columns} width=${studio.width}`);
  if (studio.width > 400) throw new Error("mobile studio too wide");

  if (errors.length) {
    console.log(log.join("\n"));
    console.error("JS errors:\n" + errors.join("\n"));
    process.exit(1);
  }
  console.log(log.join("\n"));
  console.log("E2E_OK");
} catch (err) {
  console.log(log.join("\n"));
  console.error(err);
  process.exit(1);
} finally {
  await browser.close();
}
