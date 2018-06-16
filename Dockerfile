FROM node:8
WORKDIR /opt/instapage-api
COPY api/package.json ./
COPY api/yarn.lock ./
RUN yarn install
COPY api/*.js ./
EXPOSE 3000
CMD [ "node", "index.js" ]