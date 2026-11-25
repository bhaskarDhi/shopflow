FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production 
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY migrations ./migrations
EXPOSE 3000
USER 1000
HEALTHCHECK --interval=30s --timeout=3s CMD ["wget", "-qO-", "http://localhost:3000/healthz"]
CMD [ "node","src/server.js" ]