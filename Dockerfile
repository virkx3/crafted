FROM node:18

# Set timezone and Puppeteer environment
ENV TZ=Asia/Kolkata
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install OS dependencies
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

# Set working directory
WORKDIR /app

# Copy and clean install dependencies
COPY package*.json ./
RUN rm -rf node_modules package-lock.json && npm cache clean --force && \
    npm install --legacy-peer-deps || \
    (echo '🧾 NPM INSTALL FAILED — Showing logs:' && cat /root/.npm/_logs/* || true)

# Copy application source
COPY . .

# Healthcheck port
EXPOSE 3000

# Start headless browser + app
CMD bash -c "Xvfb :99 -screen 0 1024x768x16 & export DISPLAY=:99 && npm start"
