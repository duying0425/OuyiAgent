FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY src/ ./src/

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8081

EXPOSE 8081

HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:8081/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
