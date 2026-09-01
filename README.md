# AI Video Cutter — V1 (base local)

Plataforma **local-first** de edição automática de vídeos com IA, inspirada em ferramentas como OpusClip e Recut.
Esta é a **V1**: a arquitetura completa de frontend + backend, storage e integração com FFmpeg, **sem** a
inteligência artificial ainda (transcrição, detecção de melhores momentos, legendas automáticas e
reenquadramento vertical chegam na V2).

Roda 100% no seu computador — sem AWS, sem banco de dados externo, sem deploy.

```
Frontend (Next.js) → API REST → Backend (NestJS) → FFmpeg → storage/
```

---

## 1. Descrição do projeto

O objetivo final da ferramenta é: receber uma URL ou arquivo de vídeo, transcrever o áudio, usar IA para
encontrar os melhores momentos, cortar automaticamente, gerar legendas, reenquadrar para 9:16 com
enquadramento automático de pessoas, e permitir revisar/editar/exportar os cortes.

Nesta V1, o foco é **apenas a base**: projetos, upload, player, timeline, corte manual via FFmpeg e a
persistência em disco — tudo desenhado para que a IA (Whisper + LLM) seja plugada depois sem reescrever nada.

---

## 2. Requisitos

- **Node.js** ≥ 18.18 (recomendado 20.x — testado com v20.19.6)
- **npm** ≥ 10
- **FFmpeg** e **FFprobe** instalados e acessíveis no PATH (ou apontados via `.env`)

## 3. Instalação do Node.js

Baixe o instalador em https://nodejs.org (versão LTS) ou, no Windows, instale via:

```powershell
winget install OpenJS.NodeJS.LTS
```

Confirme com:

```bash
node --version
npm --version
```

## 4. Instalação do FFmpeg

O backend depende dos binários `ffmpeg` e `ffprobe` para cortar vídeos, gerar thumbnails e ler metadados.

**Windows (winget):**

```powershell
winget install Gyan.FFmpeg
```

**Windows (Chocolatey):**

```powershell
choco install ffmpeg
```

**macOS:**

```bash
brew install ffmpeg
```

**Linux (Debian/Ubuntu):**

```bash
sudo apt update && sudo apt install ffmpeg
```

Depois de instalar, feche e reabra o terminal e confirme:

```bash
ffmpeg -version
ffprobe -version
```

Se preferir não colocá-los no PATH, aponte os caminhos completos em `FFMPEG_PATH` / `FFPROBE_PATH` no `.env`
(veja a seção seguinte). Sem o FFmpeg instalado, o resto da aplicação funciona normalmente — apenas os
endpoints que processam vídeo (`/videos/:id/info`, `/projects/:id/upload`, `/clips/:id/render`) retornarão erro
até o FFmpeg estar disponível.

## 5. Configuração do ambiente

Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

E ajuste se necessário (os valores padrão já funcionam para a maioria dos casos):

```env
PORT=3333
STORAGE_PATH=../../storage
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
MAX_UPLOAD_SIZE_MB=2048
FRONTEND_URL=http://localhost:3030
NEXT_PUBLIC_API_URL=http://localhost:3333
```

## 6. Instalação das dependências

Na raiz do monorepo:

```bash
npm install
```

Isso instala as dependências de `apps/frontend`, `apps/backend`, `packages/shared-types` e
`packages/shared-utils` (npm workspaces) e compila os pacotes compartilhados automaticamente
(`postinstall` → `build:shared`).

## 7. Como executar o frontend (isoladamente)

```bash
npm run dev:frontend
```

Abre em **http://localhost:3030**.

## 8. Como executar o backend (isoladamente)

```bash
npm run dev:backend
```

Sobe a API em **http://localhost:3333**. Teste com:

```bash
curl http://localhost:3333/health
# {"status":"ok"}
```

## 9. Como executar tudo simultaneamente

```bash
npm run dev
```

Sobe frontend e backend juntos (via `concurrently`), depois de garantir que os pacotes compartilhados estejam
compilados.

---

## 10. Estrutura do projeto

```text
ai-video-cutter/
├── apps/
│   ├── frontend/            # Next.js + React + Tailwind
│   │   ├── app/              # rotas (dashboard, projetos, editor, settings)
│   │   ├── components/       # layout, dashboard, projects, video, clips, captions
│   │   ├── services/api.ts   # cliente HTTP único, usado por toda a UI
│   │   ├── hooks/             # useProjects, useProject, useClips
│   │   ├── types/             # re-export dos tipos compartilhados
│   │   └── lib/                # utilitários (formatação, cn, mapas de status)
│   │
│   └── backend/              # NestJS
│       └── src/
│           ├── modules/
│           │   ├── health/         # GET /health
│           │   ├── projects/       # CRUD de projetos + upload
│           │   ├── videos/         # info/streaming do vídeo original
│           │   ├── clips/          # criação/render/streaming de cortes
│           │   └── processing/     # FfmpegService + stubs de IA/transcrição/legendas
│           ├── common/
│           │   ├── filters/        # HttpExceptionFilter
│           │   ├── interceptors/   # LoggingInterceptor
│           │   ├── storage/        # StorageService (paths seguros, anti path-traversal)
│           │   └── utils/          # constantes, streaming HTTP com Range, etc.
│           └── config/             # configuração via dotenv
│
├── packages/
│   ├── shared-types/          # Project, Clip, VideoInfo, VideoFormat, etc.
│   └── shared-utils/          # formatTime, generateId, sanitização de path
│
├── storage/                   # todo vídeo/thumbnail/corte fica aqui (git-ignored)
│   ├── originals/ temp/ audio/ transcripts/ clips/ exports/
│   └── projects/{id}/
│       ├── project.json
│       ├── original.mp4
│       ├── thumbnail.jpg
│       ├── clips.json
│       ├── clips/{clipId}.mp4
│       └── exports/
│
├── scripts/ensure-storage.js
├── docker-compose.yml         # opcional — não é necessário para a V1
├── .env.example
└── package.json                # workspaces + scripts raiz
```

**Sem banco de dados nesta versão.** Projetos e cortes são persistidos como JSON dentro de
`storage/projects/{id}/`. A troca futura para PostgreSQL/Prisma é isolada: cada módulo injeta um repositório
através de um token (`PROJECT_REPOSITORY`, `CLIP_REPOSITORY`) — basta escrever uma nova implementação da
mesma interface e trocar o `provide/useClass` no respectivo `*.module.ts`.

---

## 11. Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Healthcheck (`{"status":"ok"}`) |
| POST | `/projects` | Cria projeto (`name`, `sourceType: 'url'\|'upload'`, `sourceUrl?`) |
| GET | `/projects` | Lista projetos |
| GET | `/projects/:id` | Busca um projeto |
| DELETE | `/projects/:id` | Remove projeto e seus arquivos |
| POST | `/projects/:id/upload` | Upload de vídeo (`multipart/form-data`, campo `file`) |
| POST | `/projects/:id/download` | Reinicia download de projeto `sourceType: url` |
| GET | `/videos/:projectId/info` | Duração, resolução, fps e formato (via ffprobe) |
| GET | `/videos/:projectId/stream` | Stream do vídeo original (suporta `Range`) |
| GET | `/videos/:projectId/thumbnail` | Thumbnail JPEG do projeto |
| POST | `/projects/:id/clips` | Cria um corte (`startTime`, `endTime`, `format?`, `title?`) |
| GET | `/projects/:id/clips` | Lista cortes de um projeto |
| GET | `/clips/:id` | Busca um corte |
| POST | `/clips/:id/render` | Renderiza o corte com FFmpeg |
| GET | `/clips/:id/stream` | Stream do corte renderizado (suporta `Range`) |

---

## 12. Roadmap

```text
[x] Estrutura inicial
[x] Frontend
[x] Backend
[x] Projetos
[x] Upload
[x] Player
[x] Timeline
[x] Corte manual
[x] Download por URL (direto + yt-dlp)
[x] extractAudio / generateCaptions / reframe 16:9·9:16·1:1
[x] Progresso de render (async + polling)
[x] Transcrição Whisper (OpenAI / CLI / heurística)
[x] Análise com IA (OpenAI ou heurística local)
[x] Detecção automática dos melhores momentos
[x] Geração automática de cortes
[x] Legendas automáticas (SRT/ASS)
[x] Legendas estilizadas + burn-in
[x] Reenquadramento 9:16 com face tracking (heurística de pele)
[x] Detecção de rosto (aproximação por tom de pele)
[x] Auto tracking (offset de crop por amostra de frames)
[x] Fila de processamento (jobs persistidos)
[x] Settings reais (storage/settings.json)
[x] Exportação em lote
[x] UI de fila + toasts + health check + limpeza temp
[ ] Editor avançado (trim fino na UI)
[ ] GPU acceleration
```

Quando a Fase 1 estiver validada (fluxo: criar projeto → upload **ou URL** → player → marcar início/fim →
criar corte no formato desejado → renderizar com progresso → visualizar/baixar), o próximo passo é a **V2:
Whisper + transcrição + IA para encontrar automaticamente os melhores momentos** — implementando as
interfaces já preparadas em `AiService`, `TranscriptionService` e `CaptionService`.

**Download por URL:** arquivos diretos (`.mp4`, etc.) usam HTTP. YouTube/Vimeo/TikTok precisam do binário
[`yt-dlp`](https://github.com/yt-dlp/yt-dlp) no PATH ou `YT_DLP_PATH` no `.env`.
---

## 13. Segurança (mesmo sendo local)

- Todo caminho de arquivo passa por `StorageService.resolveSafePath`, que impede path traversal.
- Upload valida extensão (`.mp4`, `.mov`, `.mkv`, `.webm`, `.avi`) e respeita `MAX_UPLOAD_SIZE_MB`.
- FFmpeg/FFprobe são executados via `child_process.spawn` com argumentos em array — nunca uma string de
  shell montada por concatenação — eliminando risco de command injection.
- Todos os DTOs são validados com `class-validator` (`ValidationPipe` global com `whitelist`/`forbidNonWhitelisted`).
- Erros não tratados nunca vazam stack trace/caminhos internos para o cliente (`HttpExceptionFilter`).
- Sem autenticação, banco de dados externo, Redis ou pagamentos nesta versão — por design.

`npm audit` ainda aponta alguns avisos moderados/altos vindos de dependências internas do NestJS 10
(`@nestjs/platform-express`, `@nestjs/config`) e do próprio Next.js 14, só resolvíveis com um upgrade de major
(NestJS 12 / Next 15+). Como a aplicação roda apenas em `localhost`, isso não é bloqueante para a V1, mas é um
bom próximo passo antes de expor o backend além do seu computador.
