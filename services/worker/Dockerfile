FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
EXPOSE 8080
USER 1000
HEALTHCHECK --interval=30s --timeout=3s CMD ["wget", "-qO-", "http://localhost:8080/"]
CMD [ "node","src/worker.js" ]