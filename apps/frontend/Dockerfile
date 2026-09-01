# Dockerfile opcional do frontend — não é necessário para rodar a V1 localmente
# (use "npm install && npm run dev" na raiz).
FROM node:20-bookworm-slim AS base

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps/frontend ./apps/frontend

RUN npm install
RUN npm run build:shared
RUN npm run build --workspace=apps/frontend

ENV NEXT_PUBLIC_API_URL=http://localhost:3333
WORKDIR /app/apps/frontend

EXPOSE 3030

CMD ["npm", "run", "start"]
