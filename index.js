// Required modules
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const express = require('express');
const cheerio = require("cheerio");
const ytdl = require("ytdl-core");

// Constants
const app = express();
const PORT = process.env.PORT || 3000;
const VIDEO_DIR = "downloads";
const USED_REELS_FILE = "used_reels.json";
const WATERMARK = "ig/ramn_preet05";
const CHANNELS_FILE = "youtube_channels.txt";
const SESSION_FILE = "session.json";

// Healthcheck server
app.get('/', (_, res) => res.send('Bot is alive'));
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Healthcheck server listening on port ${PORT}`);
});

// Puppeteer + FFmpeg setup
puppeteer.use(StealthPlugin());
ffmpeg.setFfmpegPath(ffmpegPath);

// Utility: random delay
const delay = (ms, varn = 0) =>
  new Promise(res => setTimeout(res, ms + (varn ? Math.random() * varn : 0)));

// Ensure directories exist
[VIDEO_DIR, path.dirname(SESSION_FILE)].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Load used list
let usedReels = [];
if (fs.existsSync(USED_REELS_FILE)) {
  try {
    usedReels = JSON.parse(fs.readFileSync(USED_REELS_FILE, "utf8"));
  } catch (e) {
    console.error("Error loading used reels:", e.message);
  }
}

// Caption & hashtags
function getRandomCaption() {
  try {
    const caps = fs.readFileSync("caption.txt", "utf8").split("\n").filter(Boolean);
    return caps[Math.floor(Math.random() * caps.length)];
  } catch (e) {
    console.error("Error loading captions:", e.message);
    return "Check out this reel!";
  }
}

function getRandomHashtags(count = 15) {
  try {
    const tags = fs.readFileSync("hashtag.txt", "utf8").split("\n").filter(Boolean);
    return tags
      .sort(() => 0.5 - Math.random())
      .slice(0, count)
      .join(" ");
  } catch (e) {
    console.error("Error loading hashtags:", e.message);
    return "#shorts #viral #trending";
  }
}

// Overlay text
function getRandomOverlayText() {
  try {
    const lines = fs.readFileSync("overlay.txt", "utf8").split("\n").filter(Boolean);
    const raw = lines[Math.floor(Math.random() * lines.length)];
    return raw.replace(/[:\\]/g, "\\$&").replace(/'/g, "\\'").replace(/"/g, '\\"');
  } catch (e) {
    console.error("Error loading overlay text:", e.message);
    return "Must Watch!";
  }
}

// Watermark processor
function addWatermark(inputPath, outputPath) {
  return new Promise((res, rej) => {
    ffmpeg(inputPath)
      .videoFilters([
        {
          filter: "drawtext",
          options: {
            text: WATERMARK,
            fontsize: 24,
            fontcolor: "black",
            x: "(w-text_w)-10",
            y: "(h-text_h)-20",
            box: 1,
            boxcolor: "white@1.0",
            boxborderw: 5
          }
        },
        {
          filter: "drawtext",
          options: {
            text: getRandomOverlayText(),
            fontsize: 30,
            fontcolor: "white",
            borderw: 2,
            bordercolor: "black",
            x: "(w-text_w)/2",
            y: "(h-text_h)/1.1",
            enable: "between(t,1,2)"
          }
        },
        { filter: "eq", options: "brightness=0.02:contrast=1.1" },
        { filter: "crop", options: "iw*0.98:ih*0.98" }
      ])
      .outputOptions(["-preset veryfast", "-threads 1"])
      .output(outputPath)
      .on("end", () => res(outputPath))
      .on("error", err => rej(err))
      .run();
  });
}

// YouTube downloader
async function downloadFromYoutube(channelUrl) {
  try {
    const shortsUrl = `${channelUrl.replace(/\/$/, "")}/shorts`;
    const { data: html } = await axios.get(shortsUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 15000
    });

    const $ = cheerio.load(html);
    const ids = new Set();

    $("a[href^='/shorts/']").each((_, el) => {
      const id = $(el).attr("href").split("/")[2];
      if (id && !usedReels.includes(id)) ids.add(id);
    });

    if (ids.size === 0) {
      console.log(`No unused videos found for ${channelUrl}`);
      return null;
    }

    const vid = Array.from(ids)[Math.floor(Math.random() * ids.size)];
    const videoUrl = `https://www.youtube.com/shorts/${vid}`;
    console.log("🎯 Selected:", videoUrl);

    const info = await ytdl.getInfo(videoUrl);
    const cleanTitle = info.videoDetails.title
      .replace(/[^\w\s]/g, "")
      .substring(0, 50)
      .replace(/\s+/g, "_");
    const fileName = `yt_${cleanTitle}_${Date.now()}.mp4`;
    const outPath = path.join(VIDEO_DIR, fileName);

    return new Promise((resolve, reject) => {
      ytdl(videoUrl, { quality: "highestvideo" })
        .pipe(fs.createWriteStream(outPath))
        .on("finish", () => {
          console.log("✅ Downloaded:", fileName);
          resolve({ path: outPath, id: vid });
        })
        .on("error", reject);
    });
  } catch (e) {
    console.error("YouTube download failed:", e.message);
    return null;
  }
}

// Instagram uploader
async function uploadReel(page, videoPath, caption) {
  try {
    await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
    await page.setViewport({ width: 1280, height: 800 });
    await delay(4000, 2000);

    // Create button
    const createBtn = await page.waitForSelector('svg[aria-label="New post"]', { timeout: 10000 });
    await createBtn.click();
    console.log("🆕 Clicked Create");
    await delay(3000, 1000);

    // File upload
    const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 5000 });
    await fileInput.uploadFile(videoPath);
    console.log("📤 Video file attached");
    await delay(10000, 3000);

    // Crop handling
    await page.waitForSelector('div[aria-label="Select crop"]', { timeout: 15000 });
    await page.click('div[aria-label="Select crop"]');
    console.log("✅ Clicked crop icon");

    const originalBtn = await page.waitForXPath('//span[text()="Original"]', { timeout: 5000 });
    await originalBtn.click();
    console.log("✅ Selected Original aspect");
    await delay(2000);

    // Navigation
    const nextBtns = await page.$$x('//div[text()="Next"]');
    for (let i = 0; i < Math.min(2, nextBtns.length); i++) {
      await nextBtns[i].click();
      console.log(`➡️ Clicked Next (${i + 1}/2)`);
      await delay(4000, 2000);
    }

    // Caption
    const captionBox = await page.waitForSelector('div[role="textbox"]', { timeout: 5000 });
    await captionBox.type(caption, { delay: 30 });
    console.log("📝 Caption entered");
    await delay(2000, 1000);

    // Sharing
    const shareBtn = await page.waitForXPath('//div[text()="Share"]', { timeout: 5000 });
    await shareBtn.click();
    console.log("✅ Clicked Share button");
    await delay(10000, 3000);

    return true;
  } catch (err) {
    console.error("Upload error:", err.message);
    return false;
  }
}

// Cleanup utility
function cleanupFiles(paths) {
  paths.forEach(p => {
    if (p && fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
        console.log(`🧹 Cleaned up: ${path.basename(p)}`);
      } catch (e) {
        console.error("Cleanup error:", e.message);
      }
    }
  });
}

// Sleep scheduler
function isSleepTime(d = new Date()) { 
  const h = d.getHours();
  return h >= 22 || h < 9;
}

async function handleSleepTime() {
  if (!isSleepTime()) return;
  
  const now = new Date();
  const wake = new Date(now);
  wake.setHours(9, 0, 0, 0);
  if (now.getHours() >= 22) wake.setDate(wake.getDate() + 1);
  
  const sleepDuration = wake - now;
  console.log(`😴 Sleeping until ${wake.toLocaleTimeString()}...`);
  await delay(sleepDuration);
}

// Main workflow
async function main() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });
  
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(60000);

  // Session handling
  if (fs.existsSync(SESSION_FILE)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
      await page.setCookie(...cookies);
      console.log("🍪 Session restored");
    } catch (e) {
      console.error("Session load error:", e.message);
    }
  }

  while (true) {
    let reelPath, wmPath;

    try {
      await handleSleepTime();

      // Channel selection
      const channels = fs.readFileSync(CHANNELS_FILE, "utf8")
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean);
      
      if (channels.length === 0) {
        console.error("No channels available");
        await delay(600000);
        continue;
      }

      const channelUrl = channels[Math.floor(Math.random() * channels.length)];
      console.log("📡 Selected channel:", channelUrl);

      // Download video
      const result = await downloadFromYoutube(channelUrl);
      if (!result) {
        await delay(180000);
        continue;
      }

      reelPath = result.path;
      wmPath = reelPath.replace(".mp4", "_wm.mp4");

      // Process video
      await addWatermark(reelPath, wmPath);
      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;

      // Upload to Instagram
      const uploadSuccess = await uploadReel(page, wmPath, caption);
      
      if (uploadSuccess) {
        console.log("✅ Upload successful");
        usedReels.push(result.id);
        
        // Save state
        fs.writeFileSync(USED_REELS_FILE, JSON.stringify(usedReels, null, 2));
        const cookies = await page.cookies();
        fs.writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2));
        console.log("💾 State saved");
      }

      // Schedule next run
      const nextRun = new Date(Date.now() + 3 * 60 * 60 * 1000);
      console.log("⏰ Next run at:", nextRun.toLocaleTimeString());
      await delay(nextRun - new Date());

    } catch (err) {
      console.error("❌ Critical error:", err.message);
      await delay(300000);
    } finally {
      cleanupFiles([reelPath, wmPath]);
    }
  }
}

// Error handling for main
main().catch(err => {
  console.error("Fatal error in main:", err);
  process.exit(1);
});
