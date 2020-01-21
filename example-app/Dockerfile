FROM node:13-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build

CMD HOST_ENV=aws npm start
EXPOSE 8181
LABEL name='PSD2 TPP Demo'
FROM node:13-alpine AS build
WORKDIR /app
COPY . .
RUN rm -rf node_modules
RUN npm install && npm run build

## Stage 2
FROM node:13-alpine
WORKDIR /app

COPY --from=build /app/certs /app/certs
COPY --from=build /app/env /app/env
COPY --from=build /app/views /app/views
COPY --from=build /app/public /app/public
COPY --from=build /app/dist /app/dist
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/package-lock.json /app/package-lock.json

RUN NODE_ENV=production npm install
RUN chown -R nobody:nobody /app

USER nobody

CMD ["npm", "run", "start-fargate"]
EXPOSE 8181
LABEL name='TPP Demo'
LABEL version='2.1.0'
