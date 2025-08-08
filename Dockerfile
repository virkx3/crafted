FROM node:18

# Set timezone and Puppeteer environment
ENV TZ=Asia/Kolkata
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install OS-level dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libfreetype6 \
    libfontconfig1 \
    fonts-noto-color-emoji \
    fonts-freefont-ttf \
    fontconfig \
    chromium \
    xvfb \
    && apt-get clean && rm -rf /var/lib/apt/lists/* && fc-cache -fv

# Set app working directory
WORKDIR /app

# Copy package.json and install Node.js dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps || \
    (echo '🧾 NPM INSTALL FAILED — Showing logs:' && cat /root/.npm/_logs/* || true)

# Copy rest of app files
COPY . .

# Expose port (optional if using Express)
EXPOSE 3000

# Start headless Xvfb with Node
CMD bash -c "Xvfb :99 -screen 0 1024x768x16 & export DISPLAY=:99 && node index.js"
