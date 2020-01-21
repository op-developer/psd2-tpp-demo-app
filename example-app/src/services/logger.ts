import * as winston from 'winston';

export const configureLogLevel = (level: string) => {
    const options: winston.LoggerOptions = {
        level,
        format: winston.format.json(),
        transports: [
            new winston.transports.Console(),
        ],
    };
    winston.configure(options);
};

export const logger = winston;
