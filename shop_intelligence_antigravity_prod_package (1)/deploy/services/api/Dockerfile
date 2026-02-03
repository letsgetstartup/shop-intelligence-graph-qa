FROM node:20-alpine

RUN apk add --no-cache git bash rsync

WORKDIR /app

ARG REPO_URL=https://github.com/letsgetstartup/shop-intelligence-graph-qa.git
ARG REPO_REF=main

# Clone the app source
RUN git clone --depth 1 --branch ${REPO_REF} ${REPO_URL} /app

# Copy QueryWeaver overlay into the repo
COPY queryweaver_overlay/ /tmp/qw/
RUN rsync -av /tmp/qw/ /app/

# Install dependencies
RUN npm ci || npm install
RUN npm i pg ioredis zod

ENV NODE_ENV=production
ENV PORT=3001

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/entrypoint.sh"]
