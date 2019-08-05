import { isProdEnvironment } from '../app/config';

/** Stringify error messages to be displayed.
 * Returns constant response in production environment.
 */
export const errToStr = (err: any) => {
  if (isProdEnvironment()) {
    return 'Error in application. Please check logs.';
  }

  if (err instanceof Error) {
      const error: Error = err;
      return `${error.name}: ${error.message} ${error.stack}`;
  }
  return JSON.stringify(err);
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
