# The app is a plain Node/Express server that reads the brand voice skill from disk,
# so it runs in a container unchanged. Cloudflare Containers fronts it with a Worker.
FROM node:22-slim

WORKDIR /app

# Install dependencies first so a code change does not invalidate the layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# skills/ ships with the image: the voice is read-only at runtime and belongs with
# the code that loads it, so a deploy and its voice can never drift apart.
COPY server ./server
COPY public ./public
COPY skills ./skills

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/index.js"]
