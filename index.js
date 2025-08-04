const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const unzipper = require("unzipper");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (_, res) => res.send('Bot is alive'));
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Healthcheck on port ${PORT}`);
});

puppeteer.use(StealthPlugin());
ffmpeg.setFfmpegPath(ffmpegPath);

const ZIP_URL = "https://www.dropbox.com/scl/fi/k9hfqt399zwtfvkb19t44/4000-Arts-Crafts-Reels-Profilecard.com-20230805T075144Z-014.zip?rlkey=pi9uwa71skr40nqfpsp0e4j9f&e=2&st=e13a47fv&dl=1";
const ZIP_FILE = "videos.zip";
const VIDEO_DIR = "downloads";
const WATERMARK = "ig/iamvirk05";

const delay = ms => new Promise(r => setTimeout(r, ms));

// === UTILS ===
async function downloadZip() {
  if (fs.existsSync(ZIP_FILE)) {
    const stats = fs.statSync(ZIP_FILE);
    console.log(`✅ ZIP already downloaded, size: ${stats.size} bytes`);
    if (stats.size < 100 * 1024 * 1024) {
      console.log("⚠️ ZIP too small, redownloading...");
      fs.unlinkSync(ZIP_FILE);
    } else {
      return;
    }
  }

  console.log("📥 Downloading ZIP...");
  const res = await axios({ url: ZIP_URL, method: "GET", responseType: "stream" });
  const output = fs.createWriteStream(ZIP_FILE);
  res.data.pipe(output);
  await new Promise(r => output.on("finish", r));
  const stats = fs.statSync(ZIP_FILE);
  console.log(`✅ ZIP downloaded, size: ${stats.size} bytes`);
}

async function unzip() {
  if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR);
  const files = walkSync(VIDEO_DIR).filter(f => f.endsWith(".mp4"));
  if (files.length) {
    console.log(`✅ Already unzipped (${files.length} videos)`);
    return;
  }

  console.log("📦 Unzipping...");
  await new Promise((resolve, reject) => {
    fs.createReadStream(ZIP_FILE)
      .pipe(unzipper.Parse())
      .on('entry', entry => {
        const fileName = path.basename(entry.path);
        if (fileName.endsWith('.mp4')) {
          entry.pipe(fs.createWriteStream(path.join(VIDEO_DIR, fileName)));
        } else {
          entry.autodrain();
        }
      })
      .on('close', resolve)
      .on('error', reject);
  });
  console.log("✅ Unzipped");
}

function walkSync(dir) {
  return fs.readdirSync(dir).flatMap(f => {
    const p = path.join(dir, f);
    return fs.statSync(p).isDirectory() ? walkSync(p) : p;
  });
}

function pickRandomVideo() {
  const files = walkSync(VIDEO_DIR).filter(f => f.endsWith(".mp4"));
  if (!files.length) throw new Error("❌ No videos left!");
  const file = files[Math.floor(Math.random() * files.length)];
  console.log(`🎥 Picked: ${file}`);
  return file;
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

async function main() {
  await downloadZip();
  await unzip();

  while (true) {
    let reelPath, watermarkedPath;
    try {
      await handleSleepTime();

      reelPath = pickRandomVideo();
      watermarkedPath = reelPath.replace(".mp4", `_wm_${Date.now()}.mp4`);
      await addWatermark(reelPath, watermarkedPath);

      console.log("✅ Watermarked:", watermarkedPath);
      fs.unlinkSync(reelPath);
      console.log(`🗑️ Deleted: ${reelPath}`);

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
