# Worker sempre-ligado do WhatsApp. Roda FORA do Firebase App Hosting.
FROM node:20-slim

# Fuso horário do Brasil — a IA interpreta "hoje/amanhã" e o expediente por ele.
ENV TZ=America/Sao_Paulo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# Instala dependências primeiro (cache de camada).
COPY package.json ./
RUN npm install --omit=dev --no-package-lock

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# tsx roda TypeScript direto (sem passo de build). Chama o binário LOCAL
# (node_modules/.bin/tsx) — nunca baixa nada em runtime (o FS do Cloud Run é
# somente-leitura; baixar via npx faria o container reiniciar em loop).
CMD ["node_modules/.bin/tsx", "src/index.ts"]
