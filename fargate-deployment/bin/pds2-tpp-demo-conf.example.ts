/** Example configuration - Replace with your own configuration variables */

export const SSM_PARAMETERS = {
  API_KEY: 'GFYHSwv9Rl34qry3KKkflV1fNX26C1xLitdqOfTKviLSsGMabRgfs7IVLSukV5P',
  CERT_PASSPHRASE: 'wKWGdQKmLlIQhopWg4jRiTEW4SzSe5ynG3yWPSuYlDZpW0zlzSMpE2sk7sjCeU5',
  SESSION_SECRET: 'EnclLKcGa0cGSegdOka3pWZXDDNq3tD5FhhpiyzTB4kqNKZnICGL2ZUYCzDJfF9',
  TPP_CLIENT_ID: 'qbWt4PTA3COZr6Zc00Nc9FDejPpWFQSMVTzhgUXskmiF7yLAFS8a2PrReekvbR2',
  TPP_CLIENT_SECRET: 'MWnlVZHfkTTlZcxgWfkuhKO2y4eVfoigug8eCQwaP1t7A6FIYf12ccD5FFA7ZHa',
};

export const STACK_TAGS = {
  Application: 'psd2-sandbox',
  CostCenter: '1111111111',
  WorkOrder: '88888888',
};

export const AWS_CONFIG = {
AwsAccount: '91919191919',
AwsRegion: 'eu-central-1',
};

export const DNS_CONFIG = {
domainName: 'domain.com',
subdomainName: 'example',
domainCertArn:
  'arn:aws:acm:eu-central-1:91919191919:certificate/de804ccf-9d01-4cb8-9570-70a295e20240',
};
