
import { SSM } from 'aws-sdk';
import { logger } from './logger';

export const getSsmParameters = async (path: string, region: string) => {
  const params: SSM.GetParametersByPathRequest = {
    Path: path,
    MaxResults: 10,
    Recursive: true,
    WithDecryption: true,
  };

  const results: any = {};

  return new Promise<any>((resolve, reject) => {
    const getParams = (nextToken?: string | undefined) => {
      if (nextToken) {
        params.NextToken = nextToken;
      }

      const ssm = new SSM({ region });

      ssm.getParametersByPath(params, (err: any, data: any) => {
        if (err) {
          logger.error(err);
          reject(err);
        } else {
          for (const item of data.Parameters) {
            results[item.Name.slice(params.Path.length + 1)] = item.Value;
          }
          if (data.NextToken) {
            return getParams(data.NextToken);
          } else {
            resolve(results);
            return results;
          }
        }
      });
    };
    getParams();
  });
};
