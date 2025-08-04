const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const unzipper = require("unzipper");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");

puppeteer.use(StealthPlugin());
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.send('Bot is alive'));
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Healthcheck on port ${PORT}`);
});

const ZIP_URL = "https://www.dropbox.com/scl/fi/k9hfqt399zwtfvkb19t44/4000-Arts-Crafts-Reels-Profilecard.com-20230805T075144Z-014.zip?rlkey=pi9uwa71skr40nqfpsp0e4j9f&e=2&st=e13a47fv&dl=1";
const ZIP_FILE = "videos.zip";
const VIDEO_DIR = "downloads";
const WATERMARK = "ig/iamvirk05";

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// === DOWNLOAD ZIP WITH PUPPETEER ===
async function downloadZip() {
  if (fs.existsSync(ZIP_FILE)) {
    console.log("✅ ZIP already downloaded");
    return;
  }
  console.log("📥 Downloading ZIP from Dropbox direct link...");
  const res = await axios({ url: ZIP_URL, method: "GET", responseType: "stream" });
  const output = fs.createWriteStream(ZIP_FILE);
  res.data.pipe(output);
  await new Promise(r => output.on("finish", r));
  console.log("✅ ZIP downloaded");
}

// === UNZIP ===
async function unzip() {
  if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR);
  const files = fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith(".mp4"));
  if (files.length) {
    console.log("✅ Videos already unzipped");
    return;
  }
  console.log("📦 Unzipping videos...");
  await fs.createReadStream(ZIP_FILE).pipe(unzipper.Extract({ path: VIDEO_DIR })).promise();
  console.log("✅ Unzipped");
}

function pickRandomVideo() {
  const files = fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith(".mp4"));
  if (!files.length) throw new Error("❌ No videos left!");
  const file = files[Math.floor(Math.random() * files.length)];
  return path.join(VIDEO_DIR, file);
}

function getRandomCaption() {
  const lines = fs.readFileSync("caption.txt", "utf8").split("\n").filter(Boolean);
  return lines[Math.floor(Math.random() * lines.length)];
}

function getRandomHashtags(count = 15) {
  const tags = fs.readFileSync("hashtag.txt", "utf8").split("\n").filter(Boolean);
  const selected = [];
  while (selected.length < count && tags.length) {
    const i = Math.floor(Math.random() * tags.length);
    selected.push(tags.splice(i, 1)[0]);
  }
  return selected.join(" ");
}

function getRandomOverlayText() {
  const overlays = fs.readFileSync("overlay.txt", "utf8").split("\n").filter(Boolean);
  return overlays[Math.floor(Math.random() * overlays.length)].replace(/'/g, "\\'");
}

function addWatermark(input, output) {
  const overlayText = getRandomOverlayText();
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .videoFilters([
        {
          filter: "drawtext",
          options: {
            fontfile: path.resolve(__dirname, "fonts/SF_Cartoonist_Hand_Bold.ttf"),
            text: WATERMARK,
            fontsize: 24,
            fontcolor: "black",
            x: "(w-text_w)-10",
            y: "(h-text_h)-20",
            box: 1,
            boxcolor: "black@1.0",
            boxborderw: 5
          }
        },
        {
          filter: "drawtext",
          options: {
            fontfile: path.resolve(__dirname, "fonts/RubikGemstones-Regular.ttf"),
            text: overlayText,
            fontsize: 36,
            fontcolor: "white",
            borderw: 2,
            bordercolor: "black",
            x: "(w-text_w)/2",
            y: "(h-text_h)/1",
            boxcolor: "white@1.0",
            enable: "between(t,1,4)"
          }
        },
        { filter: "eq", options: "brightness=0.02:contrast=1.1" },
        { filter: "crop", options: "iw*0.98:ih*0.98" }
      ])
      .outputOptions(["-preset veryfast", "-threads 1"])
      .output(output)
      .on("end", () => resolve(output))
      .on("error", reject)
      .run();
  });
}

function isSleepTime() {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 9;
}

async function handleSleepTime() {
  if (!isSleepTime()) return;
  const now = new Date();
  const wake = new Date();
  if (now.getHours() >= 22) wake.setDate(wake.getDate() + 1);
  wake.setHours(9, 0, 0, 0);
  const ms = wake - now;
  console.log(`😴 Sleeping until ${wake.toLocaleTimeString()} (${Math.round(ms/60000)} min)`);
  await delay(ms);
}

async function uploadReel(page, videoPath, caption) {
  console.log(`⬆️ Uploading ${videoPath}...`);
  await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2" });
  await page.setViewport({ width: 1366, height: 900 });
  await delay(5000);

  const createBtn = await page.evaluateHandle(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    return spans.find(span => span.textContent.includes("Create"));
  });
  if (!createBtn) throw new Error("❌ No Create button");
  await createBtn.click();
  await delay(2000);

  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    const postBtn = spans.find(span => span.textContent.trim() === "Post");
    if (postBtn) postBtn.click();
  });
  await delay(2000);

  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) throw new Error("❌ No file input");
  await fileInput.uploadFile(videoPath);
  await delay(8000);

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    btns.forEach(btn => { if (btn.innerText.trim().toUpperCase() === "OK") btn.click(); });
  });
  await delay(3000);

  await page.click('div[aria-label="Select crop"], svg[aria-label="Select crop"]');
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'));
    const found = spans.find(el => el.innerText.trim() === 'Original');
    if (found) found.click();
  });

  const nexts = await page.$$('div[role="button"]');
  for (const b of nexts) {
    const t = await page.evaluate(el => el.textContent.trim(), b);
    if (t === "Next") { await b.click(); break; }
  }
  await delay(4000);

  const nexts2 = await page.$$('div[role="button"]');
  for (const b of nexts2) {
    const t = await page.evaluate(el => el.textContent.trim(), b);
    if (t === "Next") { await b.click(); break; }
  }
  await delay(4000);

  await page.type('div[role="textbox"]', caption, { delay: 30 });
  await delay(2000);

  const shareBtns = await page.$$('div[role="button"]');
  for (const btn of shareBtns) {
    const txt = await page.evaluate(el => el.innerText.trim(), btn);
    if (txt === "Share") {
      await btn.click();
      console.log("✅ Shared");
      return true;
    }
  }
  console.log("❌ Could not find Share");
  return false;
}

async function main() {
  await downloadZip();
  await unzip();

  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/127 Safari/537.36");

  try {
    const { data } = await axios.get("https://raw.githubusercontent.com/virkx3/crafted/refs/heads/main/session.json");
    await page.setCookie(...data);
  } catch {
    console.log("❌ Failed to load session");
    return;
  }

  while (true) {
    let reelPath, watermarkedPath;
    try {
      await handleSleepTime();

      reelPath = pickRandomVideo();
      watermarkedPath = reelPath.replace(".mp4", `_wm_${Date.now()}.mp4`);
      await addWatermark(reelPath, watermarkedPath);

      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      const uploaded = await uploadReel(page, watermarkedPath, caption);

      if (uploaded) {
        fs.unlinkSync(reelPath);
        console.log(`🗑️ Deleted ${path.basename(reelPath)}`);
      }

      console.log("⏱️ Sleeping 3 hours");
      await delay(3 * 60 * 60 * 1000);
    } catch (err) {
      console.error("❌ Loop error:", err);
      await delay(180000);
    } finally {
      if (watermarkedPath && fs.existsSync(watermarkedPath)) fs.unlinkSync(watermarkedPath);
    }
  }
}

main();
