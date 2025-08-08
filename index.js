const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ytdlp = require('yt-dlp-exec');
const path = require("path");
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

puppeteer.use(StealthPlugin());
ffmpeg.setFfmpegPath(ffmpegPath);

// Configuration
const VIDEO_DIR = "downloads";
const USED_SHORTS_FILE = "used_shorts.json";
const WATERMARK = "ig/iamvirk05";
const YT_CHANNELS = [
  "https://www.youtube.com/@mukta_art_craft/shorts",
  "https://www.youtube.com/@ARartandcraft23/shorts"
];
const SLEEP_START_HOUR = 22; // 10 PM
const SLEEP_END_HOUR = 9;    // 9 AM
const UPLOAD_INTERVAL = 3 * 60 * 60 * 1000; // 3 hours

// Create directories if needed
if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR);
if (!fs.existsSync("fonts")) fs.mkdirSync("fonts");

// Font setup (ensure you have these font files)
const FONTS = {
  watermark: "SF_Cartoonist_Hand_Bold.ttf",
  overlay: "ShinyCrystal-Yq3z4.ttf"
};

// Initialize used shorts list
let usedShorts = [];
if (fs.existsSync(USED_SHORTS_FILE)) {
  try {
    usedShorts = JSON.parse(fs.readFileSync(USED_SHORTS_FILE, "utf8"));
  } catch (e) {
    console.error("Error loading used shorts:", e);
    usedShorts = [];
  }
}

// Utility functions
const delay = (ms, variation = 0) => 
  new Promise(res => setTimeout(res, ms + (variation ? Math.random() * variation : 0)));

function getRandomCaption() {
  try {
    const captions = fs.readFileSync("caption.txt", "utf8").split("\n").filter(Boolean);
    return captions[Math.floor(Math.random() * captions.length)] || "Check this out!";
  } catch (e) {
    console.error("Error loading captions:", e);
    return "Amazing creative content!";
  }
}

function getRandomHashtags(count = 15) {
  try {
    const tags = fs.readFileSync("hashtag.txt", "utf8").split("\n").filter(Boolean);
    const selected = [];
    while (selected.length < count && tags.length) {
      const index = Math.floor(Math.random() * tags.length);
      selected.push(tags.splice(index, 1)[0]);
    }
    return selected.join(" ");
  } catch (e) {
    console.error("Error loading hashtags:", e);
    return "#art #craft #creative #diy #handmade";
  }
}

function getRandomOverlayText() {
  try {
    const overlays = fs.readFileSync("overlay.txt", "utf8").split("\n").filter(Boolean);
    const raw = overlays[Math.floor(Math.random() * overlays.length)] || "Creative DIY";
    return raw.replace(/[:\\]/g, "\\$&").replace(/'/g, "\\'").replace(/\"/g, '\\\"');
  } catch (e) {
    console.error("Error loading overlays:", e);
    return "Amazing Craft!";
  }
}

async function addWatermark(inputPath, outputPath) {
  const overlayText = getRandomOverlayText();
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters([
        {
          filter: "drawtext",
          options: {
            fontfile: path.resolve(__dirname, `fonts/${FONTS.watermark}`),
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
            fontfile: path.resolve(__dirname, `fonts/${FONTS.overlay}`),
            text: overlayText,
            fontsize: 30,
            fontcolor: "white",
            borderw: 2,
            bordercolor: "black",
            x: "(w-text_w)/2",
            y: "(h-text_h)/1.1",
            enable: "between(t,1,2)"
          }
        },
        { filter: "crop", options: "iw*0.98:ih*0.98" }
      ])
      .outputOptions(["-preset veryfast", "-threads 1", "-max_muxing_queue_size 1024"])
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", err => reject(err))
      .run();
  });
}

async function fetchYoutubeShortsLinks(page, channelUrl) {
  console.log(`🌐 Fetching shorts from: ${channelUrl}`);
  await page.goto(channelUrl, { waitUntil: "networkidle2", timeout: 60000 });
  
  // Scroll to load more content
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await delay(2000 + Math.random() * 2000);
  }
  
  // Extract all shorts links
  const links = await page.$$eval("a#thumbnail", anchors => 
    anchors.map(a => a.href).filter(href => href && href.includes("/shorts/"))
  );
  
  return [...new Set(links.map(link => link.split('?')[0]))];
}

async function downloadYoutubeShort(url, outputPath) {
  console.log(`⬇️ Downloading: ${url}`);
  return ytdlp(url, {
    output: outputPath,
    format: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]",
    quiet: true,
    noWarnings: true
  })
  .then(() => {
    console.log(`✅ Downloaded: ${path.basename(outputPath)}`);
    return outputPath;
  })
  .catch(err => {
    console.error("❌ Download failed:", err.message);
    return null;
  });
}

async function uploadReel(page, videoPath, caption) {
  try {
    console.log("⬆️ Starting Instagram upload...");
    
    // Validate video file
    if (!fs.existsSync(videoPath)) {
      throw new Error(`File not found: ${videoPath}`);
    }
    
    // Go to Instagram
    await page.goto("https://www.instagram.com/", { 
      waitUntil: "networkidle2", 
      timeout: 60000 
    });
    await delay(5000);
    
    // Create button
    const createButton = await page.waitForSelector('svg[aria-label="New post"]', { timeout: 10000 });
    if (!createButton) throw new Error("Create button not found");
    await createButton.click();
    console.log("🆕 Clicked Create button");
    await delay(3000);
    
    // Post selection
    await page.waitForSelector('button:has(div > div > div:has-text("Post"))', { timeout: 5000 });
    await page.click('button:has(div > div > div:has-text("Post"))');
    console.log("📸 Selected Post option");
    await delay(3000);
    
    // File upload
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) throw new Error("File input not found");
    await fileInput.uploadFile(videoPath);
    console.log("📤 Video selected");
    await delay(8000);
    
    // Handle video processing dialog
    try {
      await page.waitForSelector('div:has-text("Processing")', { timeout: 30000 });
      console.log("⏳ Video processing...");
      await page.waitForSelector('div:has-text("Processing")', { hidden: true, timeout: 120000 });
    } catch (e) {
      console.log("⚠️ Processing dialog not detected, continuing");
    }
    
    // Crop selection
    await page.waitForSelector('button:has-text("Original")', { timeout: 10000 });
    await page.click('button:has-text("Original")');
    console.log("🔲 Selected Original aspect ratio");
    await delay(2000);
    
    // Next buttons
    const nextButtons = await page.$$('div[role="button"]:has-text("Next")');
    if (nextButtons.length < 2) throw new Error("Not enough next buttons");
    
    await nextButtons[0].click();
    console.log("➡️ Clicked Next (1/2)");
    await delay(3000);
    
    await nextButtons[1].click();
    console.log("➡️ Clicked Next (2/2)");
    await delay(3000);
    
    // Caption input
    const captionBox = await page.waitForSelector('div[role="textbox"]', { timeout: 5000 });
    await captionBox.type(caption, { delay: 30 });
    console.log("📝 Caption added");
    await delay(2000);
    
    // Share button
    const shareButton = await page.waitForSelector('div[role="button"]:has-text("Share")', { timeout: 5000 });
    await shareButton.click();
    console.log("🚀 Sharing reel...");
    await delay(10000);
    
    // Verify upload completion
    try {
      await page.waitForSelector('span:has-text("Your reel has been shared.")', { timeout: 30000 });
      console.log("✅ Reel uploaded successfully");
      return true;
    } catch (e) {
      console.log("⚠️ Upload confirmation not detected, but proceeding");
      return true;
    }
    
  } catch (err) {
    console.error("❌ Upload error:", err.message);
    return false;
  }
}

function isSleepTime(date = new Date()) {
  const hours = date.getHours();
  return hours >= SLEEP_START_HOUR || hours < SLEEP_END_HOUR;
}

async function handleSleepTime() {
  if (!isSleepTime()) return;
  
  console.log("😴 Sleep time detected (10PM - 9AM)");
  
  const now = new Date();
  const wakeTime = new Date();
  
  if (now.getHours() >= SLEEP_START_HOUR) {
    wakeTime.setDate(wakeTime.getDate() + 1);
  }
  wakeTime.setHours(SLEEP_END_HOUR, 0, 0, 0);
  
  const sleepDuration = wakeTime - now;
  console.log(`⏰ Sleeping until ${wakeTime.toLocaleTimeString()} (${Math.round(sleepDuration/60000)} minutes)`);
  
  await delay(sleepDuration);
  console.log("⏰ Wake up! Resuming operations...");
}

function cleanupFiles(files) {
  files.forEach(file => {
    if (file && fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
        console.log(`🧹 Cleaned up: ${path.basename(file)}`);
      } catch (e) {
        console.error("Error cleaning file:", e);
      }
    }
  });
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,  // Set to true for production
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--window-size=1366,900"
    ],
    defaultViewport: null
  });
  
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");
  
  // Load Instagram session from local file
  try {
    if (!fs.existsSync("session.json")) {
      throw new Error("session.json not found");
    }
    
    const sessionData = JSON.parse(fs.readFileSync("session.json", "utf8"));
    await page.setCookie(...sessionData);
    console.log("🔐 Session loaded from session.json");
    
    // Verify login
    await page.goto("https://www.instagram.com/accounts/edit/", { waitUntil: "networkidle2" });
    await delay(3000);
    
    if (page.url().includes("/login")) {
      throw new Error("Session invalid - redirect to login");
    }
    console.log("✅ Session verified");
    
  } catch (err) {
    console.error("❌ Session error:", err.message);
    console.log("⚠️ Please update session.json with valid cookies");
    await browser.close();
    process.exit(1);
  }
  
  // Main loop
  while (true) {
    let originalPath = null;
    let watermarkedPath = null;
    
    try {
      await handleSleepTime();
      
      // Select random channel
      const channelUrl = YT_CHANNELS[Math.floor(Math.random() * YT_CHANNELS.length)];
      
      // Fetch shorts links
      const shortsLinks = await fetchYoutubeShortsLinks(page, channelUrl);
      if (shortsLinks.length === 0) {
        console.log("⚠️ No shorts found, trying next channel");
        await delay(30000);
        continue;
      }
      
      // Find unused short
      const unusedShorts = shortsLinks.filter(link => !usedShorts.includes(link));
      if (unusedShorts.length === 0) {
        console.log("⚠️ All shorts used in this channel, trying next");
        await delay(30000);
        continue;
      }
      
      const selectedShort = unusedShorts[Math.floor(Math.random() * unusedShorts.length)];
      console.log("🎬 Selected short:", selectedShort);
      
      // Download video
      const videoId = selectedShort.split("/shorts/")[1] || Date.now();
      originalPath = path.join(VIDEO_DIR, `${videoId}.mp4`);
      const downloadResult = await downloadYoutubeShort(selectedShort, originalPath);
      
      if (!downloadResult || !fs.existsSync(originalPath)) {
        throw new Error("Download failed");
      }
      
      // Add watermark
      watermarkedPath = path.join(VIDEO_DIR, `${videoId}_wm.mp4`);
      await addWatermark(originalPath, watermarkedPath);
      console.log("💧 Watermark added");
      
      // Prepare caption
      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      console.log("📝 Generated caption:", caption.substring(0, 50) + "...");
      
      // Upload to Instagram
      const uploadSuccess = await uploadReel(page, watermarkedPath, caption);
      
      if (uploadSuccess) {
        // Update used shorts
        usedShorts.push(selectedShort);
        fs.writeFileSync(USED_SHORTS_FILE, JSON.stringify(usedShorts, null, 2));
        console.log("📝 Updated used shorts list");
      } else {
        console.log("⚠️ Upload failed, will retry this short later");
      }
      
      // Wait for next upload
      console.log(`⏳ Next upload in ${UPLOAD_INTERVAL/60000} minutes...`);
      await delay(UPLOAD_INTERVAL);
      
    } catch (err) {
      console.error("❌ Main loop error:", err.message);
      await delay(300000); // Wait 5 minutes on error
    } finally {
      cleanupFiles([originalPath, watermarkedPath]);
    }
  }
}

// Start the bot
main().catch(err => {
  console.error("🚨 Critical error:", err);
  process.exit(1);
});

// Express server for health checks
app.get("/", (req, res) => res.send("YouTube to Instagram Bot is running"));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
