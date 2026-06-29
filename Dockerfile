FROM node:22-bookworm

# Cài ffmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg python3 python3-pip && \
    pip3 install --break-system-packages yt-dlp

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm","start"]