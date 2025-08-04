const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const unzipper = require("unzipper");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const express = require("express");

puppeteer.use(StealthPlugin());
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (_, res) => res.send('Bot is alive'));
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Healthcheck on port ${PORT}`);
});

const ZIP_URL = "https://www.dropbox.com/scl/fi/k9hfqt399zwtfvkb19t44/4000-Arts-Crafts-Reels-Profilecard.com-20230805T075144Z-014.zip?rlkey=pi9uwa71skr40nqfpsp0e4j9f&e=2&st=e13a47fv&dl=1"; // ?dl=1
const ZIP_FILE = "videos.zip";
const VIDEO_DIR = "downloads";
const SOUND_DIR = "sounds";
const WATERMARK = "ig/iamvirk05";

const delay = ms => new Promise(r => setTimeout(r, ms));

// ------------------ DOWNLOAD + UNZIP ------------------

async function downloadZip() {
  if (fs.existsSync(ZIP_FILE)) {
    const stats = fs.statSync(ZIP_FILE);
    console.log(`✅ ZIP already downloaded, size: ${stats.size} bytes`);
    if (stats.size < 100 * 1024 * 1024) {
      console.log("⚠️ ZIP too small, redownloading...");
      fs.unlinkSync(ZIP_FILE);
    } else return;
  }

  console.log("📥 Downloading ZIP...");
  const res = await axios({ url: ZIP_URL, method: "GET", responseType: "stream" });
  const output = fs.createWriteStream(ZIP_FILE);
  res.data.pipe(output);
  await new Promise(r => output.on("finish", r));
  console.log(`✅ ZIP downloaded, size: ${fs.statSync(ZIP_FILE).size} bytes`);
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

// ------------------ VIDEO PICK & EDIT ------------------

function pickRandomVideo() {
  const files = walkSync(VIDEO_DIR).filter(f => f.endsWith(".mp4"));
  if (!files.length) throw new Error("❌ No videos left!");
  const file = files[Math.floor(Math.random() * files.length)];
  console.log(`🎥 Picked: ${file}`);
  return file;
}

function pickRandomSound() {
  const sounds = walkSync(SOUND_DIR).filter(f => f.endsWith(".mp3") || f.endsWith(".wav"));
  if (!sounds.length) throw new Error("❌ No sound files found in sounds/");
  const file = sounds[Math.floor(Math.random() * sounds.length)];
  console.log(`🔊 Picked sound: ${file}`);
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

function processVideo(input, output, audioFile) {
  const overlayText = getRandomOverlayText();
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(input)
      .input(audioFile)
      .complexFilter([
        {
          filter: 'drawtext',
          options: {
            fontfile: path.resolve(__dirname, 'fonts/SF_Cartoonist_Hand_Bold.ttf'),
            text: WATERMARK,
            fontsize: 24,
            fontcolor: 'white',
            x: '(w-text_w)-10',
            y: '(h-text_h)-20',
            box: 1,
            boxcolor: 'black@1.0',
            boxborderw: 5
          },
          inputs: '[0:v]',
          outputs: 'v1'
        },
        {
          filter: 'drawtext',
          options: {
            fontfile: path.resolve(__dirname, 'fonts/RubikGemstones-Regular.ttf'),
            text: overlayText,
            fontsize: 36,
            fontcolor: 'white',
            borderw: 2,
            bordercolor: 'black',
            x: '(w-text_w)/2',
            y: '(h-text_h)/1.2',
            enable: 'between(t,1,4)'
          },
          inputs: 'v1',
          outputs: 'v2'
        },
        {
          filter: 'eq',
          options: 'brightness=0.02:contrast=1.1',
          inputs: 'v2',
          outputs: 'v3'
        },
        {
          filter: 'crop',
          options: 'iw*0.98:ih*0.98',
          inputs: 'v3',
          outputs: 'v'
        }
      ])
      .outputOptions([
        '-map [v]', // final video stream from filter
        '-map 1:a', // audio from second input
        '-shortest',
        '-preset veryfast'
      ])
      .output(output)
      .on('end', () => resolve(output))
      .on('error', reject)
      .run();
  });
}


// ------------------ UPLOAD ------------------

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

// ------------------ MAIN LOOP ------------------

async function main() {
  await downloadZip();
  await unzip();

  const browser = await puppeteer.launch({ headless: false, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  // Load session
  try {
    const cookies = JSON.parse(fs.readFileSync("session.json", "utf8"));
    await page.setCookie(...cookies);
    console.log("✅ Session loaded");
  } catch {
    console.log("⚠️ session.json not found or invalid");
  }

  while (true) {
    let reelPath, processedPath;
    try {
      reelPath = pickRandomVideo();
      const soundPath = pickRandomSound();
      processedPath = reelPath.replace(".mp4", `_final_${Date.now()}.mp4`);
      await processVideo(reelPath, processedPath, soundPath);

      const caption = `${getRandomCaption()}\n\n${getRandomHashtags()}`;
      const uploaded = await uploadReel(page, processedPath, caption);

      if (uploaded) {
        fs.unlinkSync(reelPath);
        console.log(`🗑️ Deleted: ${reelPath}`);
      } else {
        console.log("❌ Upload failed — not deleted");
      }

      console.log("⏱️ Sleeping 3 hours");
      await delay(3 * 60 * 60 * 1000);

    } catch (err) {
      console.error("❌ Loop error:", err);
      await delay(180000);
    } finally {
      if (processedPath && fs.existsSync(processedPath)) fs.unlinkSync(processedPath);
    }
  }
}

main();
