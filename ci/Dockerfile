ARG FROM_BASE=${DOCKER_REGISTRY:-}docker.io/node:${BASE_TAG:-23.11.0-alpine3.21}
FROM $FROM_BASE

LABEL Maintainers="bobb@k8s.home"
LABEL Version="1.0"
LABEL Description="web interface"

ARG NODE_VERSION='3.9.13'
LABEL version.node="$NODE_VERSION"

RUN mkdir -p /app/public
WORKDIR /app
COPY package.json package-lock.json server.js /app
COPY public /app/public

RUN set -o verbose \
    && npm install express

ENTRYPOINT [ "node", "server.js" ]
