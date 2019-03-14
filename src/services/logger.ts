import * as winston from 'winston';

export const isProdEnv = () =>
    process.env.APP_ENVIRONMENT === 'psd2-sandbox';

const logLevel = () => isProdEnv() ? 'info' : 'debug';

const options: winston.LoggerOptions = {
    level: logLevel(),
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
    ],
};
winston.configure(options);

export const logger = winston;
