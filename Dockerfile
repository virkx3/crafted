FROM node:18

# Set timezone and Puppeteer environment
ENV TZ=Asia/Kolkata
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install system dependencies (Chromium, FFmpeg, fonts, etc.)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libfreetype6 \
    libfontconfig1 \
    fonts-noto-color-emoji \
    fonts-freefont-ttf \
    fontconfig \
    chromium \
    xvfb \
    python3 \
    make \
    g++ \
    && apt-get clean && rm -rf /var/lib/apt/lists/* && fc-cache -fv

# Set app directory
WORKDIR /app

# Copy ONLY package.json and install first (caches better)
COPY package*.json ./

# Clean npm cache first and install with legacy peer deps
RUN npm cache clean --force && npm install --legacy-peer-deps || \
    (echo '🧾 NPM INSTALL FAILED — Showing logs:' && cat /root/.npm/_logs/* || true)

# Now copy the rest of your app code
COPY . .

# Expose port (optional, for Express or Railway health checks)
EXPOSE 3000

# Start bot with virtual framebuffer (Xvfb)
CMD bash -c "Xvfb :99 -screen 0 1024x768x16 & export DISPLAY=:99 && node index.js"
