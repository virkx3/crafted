FROM node:18

# Set timezone and Puppeteer environment
ENV TZ=Asia/Kolkata
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install dependencies
RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    libfreetype6 \
    libfontconfig1 \
    fonts-noto-color-emoji \
    fonts-freefont-ttf \
    fontconfig \
    chromium \
    python3 \
    make \
    g++ \
    xvfb \
    && apt-get clean && rm -rf /var/lib/apt/lists/* && fc-cache -fv

# Set working directory
WORKDIR /app

# Copy and install node dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy all other code
COPY . .

# Expose port for health check
EXPOSE 3000

# Run with headless display
CMD bash -c "Xvfb :99 -screen 0 1024x768x16 & export DISPLAY=:99 && node index.js"
