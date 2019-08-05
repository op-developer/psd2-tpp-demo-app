import * as winston from 'winston';
import { isProdEnvironment } from '../app/config';

const logLevel = () => isProdEnvironment() ? 'info' : 'debug';

const options: winston.LoggerOptions = {
    level: logLevel(),
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
    ],
};
winston.configure(options);

export const logger = winston;
