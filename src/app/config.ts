import dotenv from 'dotenv';
import https from 'https';
import * as fs from 'fs';
import { logger } from '../services/logger';
import { getSsmParameters } from '../services/ssmParams';

// The global environment holder
const globalEnv = {
    TPP_NAME: 'Default TPP name',
    JWT_SIGNATURE_KID: '',
    OIDC_ACCESS_TOKEN_URL: '',
    PSD2_AIS_API_URL: '',
    TPP_OAUTH_CALLBACK_URL: '',
    OIDC_REDIRECT_URL: '',
};
// The global secrets holder
const globalSecrets = {
    API_KEY: '',
    CERT_PASSPHRASE: '',
    SESSION_SECRET: '',
    TPP_CLIENT_ID: '',
    TPP_CLIENT_SECRET: '',
};

/** Get the global environment variables. */
export const getEnv = () => globalEnv;
/** Get the global secrets variables. */
export const getSecrets = () => globalSecrets;

const appName = 'psd2-sandbox';
const serviceName = 'psd2-tpp-demo-app';

export const loadSsmParams = async (region: string) => {
    const ssmPath = `/${appName}/${process.env.APP_ENVIRONMENT}/${serviceName}`;
    const params: any = await getSsmParameters(ssmPath, region);
    globalSecrets.API_KEY = params.API_KEY;
    globalSecrets.CERT_PASSPHRASE = params.CERT_PASSPHRASE;
    globalSecrets.SESSION_SECRET = params.SESSION_SECRET;
    globalSecrets.TPP_CLIENT_ID = params.TPP_CLIENT_ID;
    globalSecrets.TPP_CLIENT_SECRET = params.TPP_CLIENT_SECRET;
    if (globalSecrets.API_KEY === undefined ||
        globalSecrets.CERT_PASSPHRASE === undefined ||
        globalSecrets.SESSION_SECRET === undefined ||
        globalSecrets.TPP_CLIENT_ID === undefined ||
        globalSecrets.TPP_CLIENT_SECRET === undefined) {
            throw Error(`Could not find all parameters in ${ssmPath} in ${region}`);
    }
};

const isProdEnvironment = () => {
  if (!process.env.APP_ENVIRONMENT) {
    throw new Error('Missing APP_ENVIRONMENT environment variable.');
  }
  return process.env.APP_ENVIRONMENT.includes('prod') || process.env.APP_ENVIRONMENT === 'psd2-sandbox';
};

const defaultAwsRegion = 'eu-central-1';
const selectRegion = () =>
    process.env.AWS_REGION !== undefined ? process.env.AWS_REGION : defaultAwsRegion;

const loadSecrets = async (secretsConfigPath: string) => {
    if (isProdEnvironment() && process.env.HOST_ENV !== 'localhost') {
        const region = selectRegion();
        await loadSsmParams(region);
        logger.info(`Loaded ${Object.keys(getSecrets()).length} secrets from SSM in ${region}`);
    } else {
        const secretVars = dotenv.parse(fs.readFileSync(secretsConfigPath));
        globalSecrets.API_KEY = secretVars.API_KEY;
        globalSecrets.CERT_PASSPHRASE = secretVars.CERT_PASSPHRASE;
        globalSecrets.SESSION_SECRET = secretVars.SESSION_SECRET;
        globalSecrets.TPP_CLIENT_ID = secretVars.TPP_CLIENT_ID;
        globalSecrets.TPP_CLIENT_SECRET = secretVars.TPP_CLIENT_SECRET;
        logger.info(`Loaded ${Object.keys(getSecrets()).length} secrets from ${secretsConfigPath}`);
        logger.debug(globalSecrets);
    }
};

/** Load environment variables from .env file, where API keys,
 * API endpoints and passwords are configured. Must be done very early
 * in the startup process.
 */
export const loadConfiguration = async (env: string, host: string) => {
    const envConfigSuffix = host === 'aws' ? 'aws' : 'localhost';

    // Defaults to test environment config
    const envConfigPath = `env/${env}.${envConfigSuffix}`;
    const apiConfigPath = `env/${env}.apis`;
    const secretsConfigPath = `env/${env}.${envConfigSuffix}.secrets`;

    const envVars = dotenv.parse(fs.readFileSync(envConfigPath));
    globalEnv.TPP_NAME = envVars.TPP_NAME;
    globalEnv.TPP_OAUTH_CALLBACK_URL = envVars.TPP_OAUTH_CALLBACK_URL;
    globalEnv.JWT_SIGNATURE_KID = envVars.JWT_SIGNATURE_KID;

    const apiVars = dotenv.parse(fs.readFileSync(apiConfigPath));
    globalEnv.OIDC_ACCESS_TOKEN_URL = apiVars.OIDC_ACCESS_TOKEN_URL;
    globalEnv.PSD2_AIS_API_URL = apiVars.PSD2_AIS_API_URL;
    globalEnv.OIDC_REDIRECT_URL = apiVars.OIDC_REDIRECT_URL;

    logger.info(`Loaded configurations ${apiConfigPath} and ${envConfigPath}`);

    await loadSecrets(secretsConfigPath);

    return globalEnv;
};

export const createConfiguredClient = () => {
  const env = process.env.APP_ENVIRONMENT;
  const clientCertPath = `certs/client-cert/${env}/client.crt`;
  const clientKeyPath = `certs/client-cert/${env}/key.pem`;
  const httpsAgent = new https.Agent({
    cert: fs.readFileSync(clientCertPath),
    key: fs.readFileSync(clientKeyPath),
    passphrase: getSecrets().CERT_PASSPHRASE,
    rejectUnauthorized: true,
  });
  return httpsAgent;
};
