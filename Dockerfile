FROM node:22-bookworm

# Cài ffmpeg, python3, pip và các công cụ bổ trợ
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    curl && \
    pip3 install --break-system-packages yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Khai báo biến môi trường để yt-dlp biết chính xác đường dẫn Node.js làm JS Runtime
ENV YT_DLP_JS_RUNTIME=node

EXPOSE 3000

CMD ["npm", "start"]