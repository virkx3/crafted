# Use Node.js 18 base image
FROM node:18-bullseye

# Install system dependencies
RUN apt-get update && \
    apt-get install -y \
    python3 \
    python3-pip \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxrender1 \
    libxtst6 \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libxcb1 \
    libxss1 \
    lsb-release \
    wget \
    xdg-utils \
    libgl1 \
    ffmpeg \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install --no-cache-dir yt-dlp

# Set Puppeteer config
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install Node dependencies with retries
RUN npm install --no-optional || \
    npm install --no-optional || \
    npm install --no-optional || \
    npm install --no-optional

# Copy app source
COPY . .

# Create required directories
RUN mkdir -p downloads fonts

# Set environment variables
ENV NODE_ENV=production

# Expose port for health checks
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
