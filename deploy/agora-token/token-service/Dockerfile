FROM node:20-alpine
WORKDIR /app
COPY package.json package.json
RUN npm install --omit=dev
COPY server.mjs server.mjs
ENV NODE_ENV=production
EXPOSE 8789
CMD ["node", "server.mjs"]

