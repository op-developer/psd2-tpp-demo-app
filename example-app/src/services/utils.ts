import { isProdEnvironment } from '../app/config';
import { logger } from './logger';

const getErrorString = (err: any) => {
  if (err instanceof Error) {
      const error: Error = err;
      return `${error.name}: ${error.message} ${error.stack}`;
  }
  return JSON.stringify(err);
};

/** Stringify error message and log it.
 * @returns Returns the message after stringifying it.
 *          In production env a constant string is returned.
 */
export const logErrorMessage = (err: any) => {
  const errorStr = getErrorString(err);
  logger.error(errorStr);

  if (isProdEnvironment()) {
    return 'Error in application. Please check logs.';
  }

  return errorStr;
};

export const toKeysAndValues = (o: any) => {
    return Object.keys(o).map((k) => (
      {
        name: k,
        value: JSON.stringify(o[k]),
      }
    ),
  );
};

export const replaceAll = (str: string, find: string, replace: string) => {
  return str.replace(new RegExp(find, 'g'), replace);
};
