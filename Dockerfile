FROM node:22-alpine AS build
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmmirror.com
COPY package.json package-lock.json* ./
RUN npm ci --registry="${NPM_REGISTRY}" --replace-registry-host=always
COPY . .
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmmirror.com
COPY --from=build /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev --registry="${NPM_REGISTRY}" --replace-registry-host=always
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
EXPOSE 3000
CMD ["node", "dist-server/server/index.js"]
