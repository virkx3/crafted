FROM node:18-slim

# Avoid Puppeteer install warnings
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install system dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    xvfb \
    ffmpeg \
    fonts-freefont-ttf \
    ttf-mscorefonts-installer \
    --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files and install Node dependencies
COPY package*.json ./
RUN npm install

# Copy rest of the app
COPY . .

# Expose the port for health check
EXPOSE 3000

# Run the bot
CMD ["npm", "start"]
