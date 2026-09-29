# Dependencies layer — cached when package.json / package-lock.json unchanged
FROM node:18.17.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps --prefer-offline

# Runtime layer — only rebuilds when source changes
FROM node:18.17.0-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js api-routes.js routes.js ./
COPY routes ./routes
COPY config ./config
COPY middleware ./middleware
COPY services ./services
COPY utils ./utils
COPY views ./views
COPY views-js ./views-js
COPY public ./public
COPY templates ./templates

EXPOSE 5000
CMD ["node", "server.js"]
