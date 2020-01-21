
import * as AWS from 'aws-sdk';
import { logger } from '../services/logger';

export const getSsmParameters = async (path: string, region: string) => {
  const params: AWS.SSM.GetParametersByPathRequest = {
    Path: path,
    MaxResults: 10,
    Recursive: true,
    WithDecryption: !path.includes('psd2-sandbox-demo'),
  };

  const ssm = new AWS.SSM({ region });
  const results: {[key: string]: string} = {};

  return new Promise<{[key: string]: string}>((resolve, reject) => {
    const getParams = (nextToken?: string | undefined) => {
      if (nextToken) {
        params.NextToken = nextToken;
      }

      ssm.getParametersByPath(params, (err: AWS.AWSError, data: AWS.SSM.GetParametersByPathResult) => {
        if (err || data.Parameters === undefined) {
          logger.error(err);
          reject(err);
        } else {
          for (const item of data.Parameters) {
            if (item.Name) {
              const name = item.Name.slice(params.Path.length + 1);
              results[name] = item.Value || '';
            }
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
