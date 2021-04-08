import dotenv from 'dotenv';
import https from 'https';
import * as fs from 'fs';
import { logger, configureLogLevel } from '../services/logger';
import { getSsmParameters } from '../services/ssmParams';

interface GlobalEnv {
  PSD2_AIS_API_URL: string;
  PSD2_COF_API_URL: string;
  OIDC_ACCESS_TOKEN_URL: string;
  OIDC_REDIRECT_URL: string;
  OIDC_JWKS_URL: string;
  PSD2_PIS_API_URL: string;
  LOGIN_SERVICE_URL: string;
  PIS_JWKS_URI: string;

  // From config
  TPP_NAME: string;
  TPP_OAUTH_CALLBACK_URL: string;
  TPP_OAUTH_CALLBACK_URL_ACCOUNTS: string;
  TPP_OAUTH_CALLBACK_URL_PAYMENTS: string;
  TPP_OAUTH_CALLBACK_URL_CONFIRMATION_OF_FUNDS: string;
  JWT_SIGNATURE_KID: string;

  APP_ENVIRONMENT: string;
  APP_NAME: string;
  HOST_ENV: string;

  CLIENT_CERTIFICATE: string;
  CLIENT_PRIVATE_KEY: string;
}

let globalEnv: GlobalEnv;

interface GlobalSecrets {
    API_KEY: string;
    CERT_PASSPHRASE: string;
    SESSION_SECRET: string;
    TPP_CLIENT_ID: string;
    TPP_CLIENT_SECRET: string;
}

let globalSecrets: GlobalSecrets;

/** Get the global environment variables. */
export const getEnv = () => {
  if (!globalEnv) {
    globalEnv = loadGlobalEnv();
  }
  return globalEnv;
};

/** Get the global secrets variables. */
export const getSecrets = () => {
  if (!globalSecrets) {
    throw new Error('loadSecrets before calling getSecrets!');
  }
  return globalSecrets;
};

/** Used only in tests. */
export const setEnv = (env: any) => globalEnv = env;

export const prodPublic = () => {
  return getEnv().APP_NAME === 'oop-tpp-demo-app-public';
};

const loadSecretsFromSsm = async () => {
  const region = selectRegion();
  const appGroup = process.env.APP_GROUP || 'psd2-sandbox-demo';
  const ssmPath = `/${appGroup}/${getEnv().APP_ENVIRONMENT}/${getEnv().APP_NAME}`;
  const params = await getSsmParameters(ssmPath, region);

  const secrets = {
    API_KEY: params.API_KEY,
    CERT_PASSPHRASE: params.CERT_PASSPHRASE,
    SESSION_SECRET: params.SESSION_SECRET,
    TPP_CLIENT_ID: params.TPP_CLIENT_ID,
    TPP_CLIENT_SECRET: params.TPP_CLIENT_SECRET,
  };
  if (!secrets.API_KEY ||
    !secrets.CERT_PASSPHRASE ||
    !secrets.SESSION_SECRET ||
    !secrets.TPP_CLIENT_ID ||
    !secrets.TPP_CLIENT_SECRET) {
    throw new Error(`Could not find all parameters in ${ssmPath} in ${region}`);
  }
  logger.info(`Loaded ${Object.keys(secrets).length} secrets from SSM in ${region}`);
  return secrets;
};

/** Returns true if the app is running in production mode. */
export const isProdEnvironment = () => {
  return getEnv().APP_ENVIRONMENT && getEnv().APP_ENVIRONMENT.includes('prod');
};

/** Get the log level depending if the app is running in production mode or not. */
const getLogLevel = () => isProdEnvironment() ? 'info' : 'debug';

const defaultAwsRegion = 'eu-central-1';
const selectRegion = () =>
    process.env.AWS_REGION !== undefined ? process.env.AWS_REGION : defaultAwsRegion;

const loadSecrets = async () => {
  const env = getEnv().APP_ENVIRONMENT;
  const envConfigSuffix = getEnv().HOST_ENV;

  // Defaults to test environment config
  const secretsConfigPath = `env/${prodPublic() ? 'prod-public' : env}.${envConfigSuffix}.secrets`;
  if (isProdEnvironment() && getEnv().HOST_ENV !== 'localhost') {
    const secrets = loadSecretsFromSsm();
    return secrets;
  } else {
    const secretVars = dotenv.parse(fs.readFileSync(secretsConfigPath));
    const secrets = {
      API_KEY: secretVars.API_KEY,
      CERT_PASSPHRASE: secretVars.CERT_PASSPHRASE,
      SESSION_SECRET: secretVars.SESSION_SECRET,
      TPP_CLIENT_ID: secretVars.TPP_CLIENT_ID,
      TPP_CLIENT_SECRET: secretVars.TPP_CLIENT_SECRET,
    };
    logger.info(`Loaded ${Object.keys(secrets).length} secrets from ${secretsConfigPath}`);
    return secrets;
  }
};

/** Load environment variables from .env file, where API keys,
 * API endpoints and passwords are configured. Must be done very early
 * in the startup process.
 */
export const loadConfiguration = async () => {
  configureLogLevel(getLogLevel());

  globalEnv = loadGlobalEnv();
  globalSecrets = await loadSecrets();

  return globalEnv;
};

export const loadGlobalEnv = (): GlobalEnv => {
  const env = process.env.APP_ENVIRONMENT;
  if (!env) {
    throw new Error('Missing APP_ENVIRONMENT variable.');
  }
  const appName = process.env.APP_NAME;
  if (!appName) {
    throw new Error('Missing APP_NAME variable.');
  }
  const hostEnv = process.env.HOST_ENV;
  if (!hostEnv) {
    throw new Error('Missing HOST_ENV variable.');
  }

  const isProdPublic = process.env.APP_NAME === 'oop-tpp-demo-app-public';
  const envConfigSuffix = process.env.HOST_ENV === 'aws' ? 'aws' : 'localhost';
  const envConfigPath = `env/${isProdPublic ? 'prod-public' : env}.${envConfigSuffix}`;
  const apiConfigPath = `env/${isProdPublic ? 'prod-public' : env}.apis`;

  const apiVars = dotenv.parse(fs.readFileSync(apiConfigPath));
  const envVars = dotenv.parse(fs.readFileSync(envConfigPath));
  logger.info(`Loaded configurations ${apiConfigPath} and ${envConfigPath}`);

  return {
    PSD2_AIS_API_URL: apiVars.PSD2_AIS_API_URL,
    PSD2_COF_API_URL: apiVars.PSD2_COF_API_URL,
    OIDC_ACCESS_TOKEN_URL: apiVars.OIDC_ACCESS_TOKEN_URL,
    OIDC_REDIRECT_URL: apiVars.OIDC_REDIRECT_URL,
    OIDC_JWKS_URL: apiVars.OIDC_JWKS_URL,
    PSD2_PIS_API_URL: apiVars.PSD2_PIS_API_URL,
    LOGIN_SERVICE_URL: apiVars.LOGIN_SERVICE_URL,
    PIS_JWKS_URI: apiVars.PIS_JWKS_URI,

    TPP_NAME: envVars.TPP_NAME,
    TPP_OAUTH_CALLBACK_URL: envVars.TPP_OAUTH_CALLBACK_URL,
    TPP_OAUTH_CALLBACK_URL_ACCOUNTS: envVars.TPP_OAUTH_CALLBACK_URL_ACCOUNTS,
    TPP_OAUTH_CALLBACK_URL_PAYMENTS: envVars.TPP_OAUTH_CALLBACK_URL_PAYMENTS,
    TPP_OAUTH_CALLBACK_URL_CONFIRMATION_OF_FUNDS: envVars.TPP_OAUTH_CALLBACK_URL_CONFIRMATION_OF_FUNDS,
    JWT_SIGNATURE_KID: envVars.JWT_SIGNATURE_KID,

    APP_ENVIRONMENT: env,
    APP_NAME: appName,
    HOST_ENV: hostEnv,

    CLIENT_CERTIFICATE: fs.readFileSync(`certs/client-cert/${isProdPublic ? 'prod-public' : env}/client.crt`, 'utf8'),
    CLIENT_PRIVATE_KEY: fs.readFileSync(`certs/client-cert/${isProdPublic ? 'prod-public' : env}/key.pem`, 'utf8'),
  };
};

export const unsetGlobalHttpProxySettings = () => {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
};

/** Create a https.Agent that is configured to use the
 * environment specific client certificate to establish
 * a mutual TLS connection.
 */
export const createConfiguredClient = () => {
  const httpsAgent = new https.Agent({
    cert: getEnv().CLIENT_CERTIFICATE,
    key: getEnv().CLIENT_PRIVATE_KEY,
    passphrase: getSecrets().CERT_PASSPHRASE,
    rejectUnauthorized: true,
  });
  return httpsAgent;
};
