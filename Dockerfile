FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV SQLITE_PATH=/data/site.sqlite
ENV NODE_OPTIONS=--experimental-sqlite
COPY --from=build /app/dist ./dist
COPY --from=build /app/data-core ./data-core
COPY --from=build /app/ai-core ./ai-core
COPY --from=build /app/data/products.json ./data/products.json
COPY --from=build /app/data/contacts.json ./data/contacts.json
COPY docker/server.js ./docker/server.js
RUN mkdir -p /data /app/uploads
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/products').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "docker/server.js"]
