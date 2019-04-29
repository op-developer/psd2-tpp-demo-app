FROM node:12-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build

CMD HOST_ENV=aws npm start
EXPOSE 8181
LABEL name='PSD2 TPP Demo'
LABEL version='2.1.0'
