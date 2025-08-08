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

const VIDEO_DIR = "downloads";
const USED_SHORTS_FILE = "used_shorts.json";
const WATERMARK = "ig/iamvirk05";
const YT_CHANNELS = [
"https://www.youtube.com/@mukta_art_craft/shorts",
"https://www.youtube.com/@ARartandcraft23/shorts"
];

const delay = (ms, variation = 0) =>
new Promise(res => setTimeout(res, ms + (variation ? Math.floor(Math.random() * variation) : 0)));

if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR);

let usedShorts = [];
if (fs.existsSync(USED_SHORTS_FILE)) {
usedShorts = JSON.parse(fs.readFileSync(USED_SHORTS_FILE, "utf8"));
}

function getRandomCaption() {
const captions = fs.readFileSync("caption.txt", "utf8").split("\n").filter(Boolean);
return captions[Math.floor(Math.random() * captions.length)];
}

function getRandomHashtags(count = 15) {
const tags = fs.readFileSync("hashtag.txt", "utf8").split("\n").filter(Boolean);
const selected = [];
while (selected.length < count && tags.length) {
const index = Math.floor(Math.random() * tags.length);
selected.push(tags.splice(index, 1)[0]);
}
return selected.join(" ");
}

function getRandomOverlayText() {
const overlays = fs.readFileSync("overlay.txt", "utf8").split("\n").filter(Boolean);
const raw = overlays[Math.floor(Math.random() * overlays.length)];
return raw.replace(/[:]/g, "$&").replace(/'/g, "'").replace(/"/g, '"');
}

function addWatermark(inputPath, outputPath) {
const overlayText = getRandomOverlayText();
return new Promise((resolve, reject) => {
ffmpeg(inputPath)
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
boxcolor: "white@1.0",
boxborderw: 5
}
},
{
filter: "drawtext",
options: {
fontfile: path.resolve(__dirname, "fonts/ShinyCrystal-Yq3z4.ttf"),
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
{ filter: "crop", options: "iw0.98:ih0.98" }
])
.outputOptions(["-preset veryfast", "-threads 1", "-max_muxing_queue_size 1024"])
.output(outputPath)
.on("end", () => resolve(outputPath))
.on("error", err => reject(err))
.run();
});
}

async function fetchYoutubeShortsLinks(page, channelUrl) {
await page.goto(channelUrl, { waitUntil: "networkidle2" });
for (let i = 0; i < 4; i++) {
await page.evaluate(() => window.scrollBy(0, window.innerHeight));
await delay(2000);
}
const links = await page.$$eval("a", as =>
as.map(a => a.href).filter(href => href.includes("/shorts/"))
);
return [...new Set(links.map(link => link.split('?')[0]))];
}

async function downloadYoutubeShort(url, outputPath) {
return ytdlp(url, { output: outputPath, format: "mp4", quiet: true })
.then(() => outputPath)
.catch(err => {
console.error("❌ yt-dlp error:", err.message);
return null;
});
}

async function uploadReel(page, videoPath, caption) {
try {
console.log("⬆️ Uploading reel...");

if (!fs.existsSync(videoPath)) {
throw new Error(❌ Video file not found at path: ${videoPath});
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

function isSleepTime(date = new Date()) {
const hours = date.getHours();
return hours >= 22 || hours < 9;
}

async function handleSleepTime() {
if (!isSleepTime()) return;

console.log("😴 It's sleep time (10 PM - 9 AM)");

// Calculate wake up time (9 AM next day)
const now = new Date();
const wakeTime = new Date();

if (now.getHours() >= 22) {
// Already past 10 PM, sleep until 9 AM next day
wakeTime.setDate(wakeTime.getDate() + 1);
}
wakeTime.setHours(9, 0, 0, 0); // Set to 9 AM

const msUntilWake = wakeTime - now;
console.log(⏰ Sleeping until ${wakeTime.toLocaleTimeString()} (${Math.round(msUntilWake/60000)} minutes));

await delay(msUntilWake);
console.log("⏰ Wake up! Resuming operations...");
}

function cleanupFiles(paths) {
for (const file of paths) {
if (file && fs.existsSync(file)) {
fs.unlinkSync(file);
console.log(🧹 Deleted: ${file});
}
// ===== END SLEEP TIME FUNCTIONS =====

async function main() {
const browser = await puppeteer.launch({
headless: "new",
args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"]
});

const page = await browser.newPage();
await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36");
await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });

// Load session cookies from GitHub
try {
const { data } = await axios.get("https://raw.githubusercontent.com/virkx3/Repost-bot/refs/heads/main/session.json");
await page.setCookie(...data);
console.log("🔐 Session loaded from remote URL");
} catch (error) {
console.log("❌ Failed to load session from remote URL");
await browser.close();
return;
}

while (true) {
await handleSleepTime();

let downloadedPath, watermarkedPath;  

try {  
  // Pick a random YouTube channel  
  const ytChannel = YT_CHANNELS[Math.floor(Math.random() * YT_CHANNELS.length)];  

  console.log("📺 Fetching shorts from:", ytChannel);  
  const ytPage = await browser.newPage();  
  const shortsLinks = await fetchYoutubeShortsLinks(ytPage, ytChannel);  
  await ytPage.close();  

  const availableLinks = shortsLinks.filter(link => !usedShorts.includes(link));  
  if (!availableLinks.length) {  
    console.log("⚠️ No new shorts found");  
    await delay(60000);  
    continue;  
  }  

  const randomShortUrl = availableLinks[Math.floor(Math.random() * availableLinks.length)];  
  const videoId = randomShortUrl.split("/").pop();  
  const filename = `${videoId}.mp4`;  
  downloadedPath = path.join(VIDEO_DIR, filename);  

  console.log("⬇️ Downloading:", randomShortUrl);  
  const resultPath = await downloadYoutubeShort(randomShortUrl, downloadedPath);  
  if (!resultPath) continue;  

  // Add watermark  
  watermarkedPath = resultPath.replace(".mp4", "_wm.mp4");  
  await addWatermark(resultPath, watermarkedPath);  
  console.log("💧 Watermark added");  

  // Upload to Instagram  
  const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;  
  const success = await uploadReel(page, watermarkedPath, caption);  

  if (success) {  
    usedShorts.push(randomShortUrl);  
    fs.writeFileSync(USED_SHORTS_FILE, JSON.stringify(usedShorts, null, 2));  
    console.log("✅ Uploaded and recorded");  
  }  

  // Wait 3 hours or until 9 AM next day if within sleep time  
  const now = new Date();  
  let nextPostTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);  
  if (nextPostTime.getHours() >= 22 || nextPostTime.getHours() < 9) {  
    if (nextPostTime.getHours() >= 22) nextPostTime.setDate(nextPostTime.getDate() + 1);  
    nextPostTime.setHours(9, 0, 0, 0);  
  }  
  const waitTime = nextPostTime - Date.now();  
  console.log(`⏳ Waiting until ${nextPostTime.toLocaleTimeString()} (${Math.round(waitTime / 60000)} mins)`);  
  await delay(waitTime);  
} catch (err) {  
  console.error("❌ Loop error:", err.message);  
  await delay(180000, 60000); // Wait 3–4 min on error  
} finally {  
  cleanupFiles([downloadedPath, watermarkedPath]);  
}

}
}
