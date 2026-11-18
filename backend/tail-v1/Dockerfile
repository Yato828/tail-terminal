FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV HOST=0.0.0.0 PORT=8787 DATA_DIR=/app/data
EXPOSE 8787
CMD ["node", "src/server.js"]
