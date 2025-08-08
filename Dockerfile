FROM node:18-slim

# Set environment
ENV TZ=Asia/Kolkata \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    DEBIAN_FRONTEND=noninteractive

# Install only necessary system packages
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    xvfb \
    ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/*

# Set working directory
WORKDIR /app

# Install Node.js dependencies
COPY package*.json ./
RUN npm install

# Copy rest of your app, including local fonts
COPY . .

# Clean any stale Xvfb lock and run the bot
CMD rm -f /tmp/.X99-lock && Xvfb :99 -screen 0 1024x768x24 & node index.js
