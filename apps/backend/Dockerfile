# Dockerfile opcional do backend — não é necessário para rodar a V1 localmente
# (use "npm install && npm run dev" na raiz). Serve para facilitar, no futuro,
# empacotar o backend junto com FFmpeg/Whisper em um ambiente controlado.
FROM node:20-bookworm-slim AS base

# FFmpeg é necessário em runtime para os endpoints de processamento de vídeo.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps/backend ./apps/backend

RUN npm install
RUN npm run build:shared
RUN npm run build --workspace=apps/backend

ENV PORT=3333
ENV STORAGE_PATH=/app/storage
ENV FFMPEG_PATH=ffmpeg
ENV FFPROBE_PATH=ffprobe

EXPOSE 3333

CMD ["node", "apps/backend/dist/main.js"]
