if (typeof File === "undefined") globalThis.File = class {};
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
const { exec } = require("child_process");

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
const delay = (ms, varn = 0) => new Promise(res => setTimeout(res, ms + (varn ? Math.random() * varn : 0)));

// Ensure download folder
if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

// Load used list
let usedReels = [];
if (fs.existsSync(USED_REELS_FILE)) {
  usedReels = JSON.parse(fs.readFileSync(USED_REELS_FILE, "utf8"));
}

// Caption & hashtags
function getRandomCaption() {
  const caps = fs.readFileSync("caption.txt", "utf8").split("\n").filter(Boolean);
  return caps[Math.floor(Math.random() * caps.length)];
}
function getRandomHashtags(count = 15) {
  const tags = fs.readFileSync("hashtag.txt", "utf8").split("\n").filter(Boolean);
  const sel = [];
  while (sel.length < count && tags.length) {
    sel.push(tags.splice(Math.floor(Math.random() * tags.length), 1)[0]);
  }
  return sel.join(" ");
}

// Overlay text
function getRandomOverlayText() {
  const lines = fs.readFileSync("overlay.txt", "utf8").split("\n").filter(Boolean);
  const raw = lines[Math.floor(Math.random() * lines.length)];
  return raw.replace(/[:\\]/g, "\\$&").replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Watermark
function addWatermark(inputPath, outputPath) {
  const overlayText = getRandomOverlayText();
  return new Promise((res, rej) => {
    ffmpeg(inputPath)
      .videoFilters([
        {
          filter: "drawtext",
          options: {
            fontfile: path.resolve(__dirname, "fonts/SF_Cartoonist_Hand_Bold.ttf"),
            text: WATERMARK, fontsize: 24, fontcolor: "black",
            x: "(w-text_w)-10", y: "(h-text_h)-20",
            box: 1, boxcolor: "white@1.0", boxborderw: 5
          }
        },
        {
          filter: "drawtext",
          options: {
            fontfile: path.resolve(__dirname, "fonts/ShinyCrystal-Yq3z4.ttf"),
            text: overlayText, fontsize: 30, fontcolor: "white",
            borderw: 2, bordercolor: "black",
            x: "(w-text_w)/2", y: "(h-text_h)/1.1",
            enable: "between(t,1,2)"
          }
        },
        { filter: "eq", options: "brightness=0.02:contrast=1.1" },
        { filter: "crop", options: "iw*0.98:ih*0.98" }
      ])
      .outputOptions(["-preset veryfast", "-threads 1", "-max_muxing_queue_size 1024"])
      .output(outputPath)
      .on("end", () => res(outputPath))
      .on("error", err => rej(err))
      .run();
  });
}

// YouTube Shorts downloader
async function getRandomShortUrlFromChannel(channelUrl) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(`${channelUrl}/shorts`, { waitUntil: "networkidle2" });

  const videoUrls = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a"));
    return anchors
      .map((a) => a.href)
      .filter((href) => href.includes("/shorts/"));
  });

  await browser.close();

  if (!videoUrls.length) throw new Error("No Shorts found");
  const random = videoUrls[Math.floor(Math.random() * videoUrls.length)];
  return `https://www.youtube.com${new URL(random).pathname}`;
}

async function downloadFromYoutube(channelUrl) {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  try {
    const shortsPage = channelUrl.replace(/\/$/, "") + "/shorts";
    await page.goto(shortsPage, { waitUntil: "networkidle2", timeout: 60000 });

    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await new Promise(r => setTimeout(r, 2000));

    const shortUrls = await page.evaluate(() => {
      return Array.from(new Set(Array.from(document.querySelectorAll("a"))
        .map(a => a.href)
        .filter(href => href.includes("/shorts/"))));
    });

    if (!shortUrls.length) throw new Error("No Shorts found");

    const selectedUrl = shortUrls[Math.floor(Math.random() * shortUrls.length)];
    console.log("🎯 Selected:", selectedUrl);

    const output = `video_${Date.now()}.mp4`;
    const downloadCmd = `yt-dlp -f mp4 -o "${path.join(VIDEO_DIR, output)}" "${selectedUrl}"`;

    await new Promise((resolve, reject) => {
      exec(downloadCmd, (error, stdout, stderr) => {
        if (error) {
          console.error("yt-dlp error:", stderr);
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });

    return path.join(VIDEO_DIR, output);

  } catch (e) {
    console.error("❌ downloadFromYoutube failed:", e.message);
    return null;
  } finally {
    await browser.close();
  }
}


// Cleanup
function cleanupFiles(paths) {
  paths.forEach(p => {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  });
}

function isSleepTime(d = new Date()) {
  const h = d.getHours();
  return h >= 22 || h < 9;
}
async function handleSleepTime() {
  if (!isSleepTime()) return;
  const now = new Date(), wake = new Date(now);
  wake.setDate(now.getHours() >= 22 ? now.getDate() + 1 : now.getDate());
  wake.setHours(9, 0, 0, 0);
  console.log("😴 Sleeping until 9 AM...", wake);
  await delay(wake - now);
}

// Upload to Instagram (you already pasted working version above — no changes)
async function uploadReel(page, videoPath, caption) {
  try {
    console.log("⬆️ Uploading reel...");

    if (!fs.existsSync(videoPath)) {
      throw new Error(`❌ Video file not found at path: ${videoPath}`);
    }

    await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2" });

    await page.setViewport({ width: 1366, height: 900 });
    await delay(5000, 2000); // Random delay between 5-7 seconds

    // Click Create
    const createBtn = await page.evaluateHandle(() => {
      const spans = Array.from(document.querySelectorAll("span"));
      return spans.find(span => span.textContent.includes("Create"));
    });
    if (!createBtn) throw new Error("❌ Create button not found");
    await createBtn.click();
    console.log("🆕 Clicked Create");
    await delay(2000, 1000); // Random delay between 2-3 seconds

    // Click "Post" in the popup
    await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll("span"));
      const postBtn = spans.find(span => span.textContent.trim() === "Post");
      if (postBtn) {
        postBtn.click();
      }
    });
    console.log("✅ Brute force click for Post done.");
    await delay(2000, 1000);

    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      throw new Error("❌ File input not found — cannot proceed");
    }

    await fileInput.uploadFile(videoPath);
    console.log("📤 Video file attached");
    await delay(8000, 3000); // Random delay between 8-11 seconds

    console.log("🔍 Trying brute force click for OK popup...");
    await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll("button"));
      allButtons.forEach(btn => {
        if (btn.innerText.trim().toUpperCase() === "OK") {
          btn.click();
        }
      });
    });
    await delay(3000, 2000);

    await page.waitForSelector('div[aria-label="Select crop"], svg[aria-label="Select crop"]', { visible: true });
    await page.click('div[aria-label="Select crop"], svg[aria-label="Select crop"]');
    console.log("✅ Clicked crop icon");

    await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span'));
      const found = spans.find(el => el.innerText.trim() === 'Original');
      if (found) {
        found.click();
        console.log("✅ Clicked Original by brute force");
      }
    });

    const nextButtons = await page.$$('div[role="button"]');
    let clickedNext = false;
    for (const button of nextButtons) {
      const text = await page.evaluate(el => el.textContent.trim(), button);
      if (text === "Next") {
        await button.click();
        console.log("➡️ Clicked first Next");
        clickedNext = true;
        await delay(4000, 2000); // Random delay between 4-6 seconds
        break;
      }
    }
    if (!clickedNext) throw new Error("❌ First Next button not found");

    const nextButtons2 = await page.$$('div[role="button"]');
    clickedNext = false;
    for (const button of nextButtons2) {
      const text = await page.evaluate(el => el.textContent.trim(), button);
      if (text === "Next") {
        await button.click();
        console.log("➡️ Clicked second Next");
        clickedNext = true;
        await delay(4000, 2000); // Random delay between 4-6 seconds
        break;
      }
    }
    if (!clickedNext) throw new Error("❌ Second Next button not found");

    await page.type('div[role="textbox"]', caption, { delay: 30 });
    console.log("📝 Caption entered");
    await delay(2000, 1000);

    // Share button
    await page.waitForSelector("div[role='button']");
    const shareBtns = await page.$$('div[role="button"]');
    let clicked = false;
    for (const btn of shareBtns) {
      const txt = await page.evaluate(el => el.innerText.trim(), btn);
      if (txt === "Share") {
        await btn.click();
        console.log("✅ Clicked Share button");
        clicked = true;
        break;
      }
    }
    if (!clicked) console.log("❌ Could not find Share button!");

    return true;
  } catch (err) {
    console.error("❌ uploadReel error:", err.message);
    return false;
  }
}


// Main loop
async function main() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();
  page.setViewport({ width: 1366, height: 900 });

  if (fs.existsSync(SESSION_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    await page.setCookie(...cookies);
    console.log("🍪 Loaded session from session.json");
  }

  while (true) {
    let reelPath, wmPath;

    try {
      await handleSleepTime();

      const channels = fs.readFileSync(CHANNELS_FILE, "utf8")
                         .split("\n").map(l => l.trim()).filter(Boolean);
      const channelUrl = channels[Math.floor(Math.random() * channels.length)];
      console.log("📡 Selected YouTube Channel:", channelUrl);

      reelPath = await downloadFromYoutube(channelUrl);
      if (!reelPath) {
        console.error("❌ Failed to download video, retrying in 3 mins...");
        await delay(180000);
        continue;
      }

      wmPath = reelPath.replace(".mp4", "_wm.mp4");
      await addWatermark(reelPath, wmPath);

      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      const uploadSuccess = await uploadReel(page, wmPath, caption);

      if (uploadSuccess) {
        console.log("✅ Upload successful");
        usedReels.push(channelUrl);
        fs.writeFileSync(USED_REELS_FILE, JSON.stringify(usedReels, null, 2));
        const cookies = await page.cookies();
        fs.writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2));
        console.log("💾 Session saved to session.json");
      }

      let next = new Date(Date.now() + 3 * 60 * 60 * 1000);
      if (isSleepTime(next)) {
        next.setDate(next.getHours() >= 22 ? next.getDate() + 1 : next.getDate());
        next.setHours(9, 0, 0, 0);
      }
      console.log("⏰ Waiting until:", next.toLocaleString());
      await delay(next - new Date());

    } catch (err) {
      console.error("❌ Error in loop:", err.message);
      await delay(180000);
    } finally {
      cleanupFiles([reelPath, wmPath]);
    }
  }
}

main();
