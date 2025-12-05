const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const https = require("https");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const IMGS_DIR = path.join(__dirname, "imgs");
if (!fs.existsSync(IMGS_DIR)) fs.mkdirSync(IMGS_DIR);

function downloadImage(imgUrl, filePath) {
  return new Promise((resolve) => {
    https
      .get(imgUrl, (res) => {
        if (res.statusCode !== 200) return resolve(false);

        const file = fs.createWriteStream(filePath);
        res.pipe(file);

        file.on("finish", () => file.close(() => resolve(true)));
        file.on("error", () => resolve(false));
      })
      .on("error", () => resolve(false));
  });
}

function zipFolder() {
  return new Promise((resolve) => {
    const output = fs.createWriteStream("images.zip");
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.pipe(output);
    archive.directory(IMGS_DIR, false);
    archive.finalize();
  });
}

app.post("/download", async (req, res) => {
  const { url } = req.body;

  if (!url) return res.status(400).send("URL required!");

  fs.readdirSync(IMGS_DIR).forEach((f) =>
    fs.unlinkSync(path.join(IMGS_DIR, f))
  );

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });

  const imgUrls = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")];
    return imgs
      .map((img) => img.getAttribute("src"))
      .filter((src) => src && typeof src === "string");
  });

  const tasks = imgUrls.map((src, index) => {
    if (!src.startsWith("http")) {
      if (src.startsWith("//")) src = "https:" + src;
      else return Promise.resolve();
    }

    const ext = path.extname(src.split("?")[0]) || ".jpg";
    const filepath = path.join(IMGS_DIR, `img_${index}${ext}`);
    return downloadImage(src, filepath);
  });

  await Promise.all(tasks);
  await browser.close();

  await zipFolder();

  res.sendFile(path.join(__dirname, "images.zip"));
});

app.listen(4000, () => console.log("Server running on port 4000"));
