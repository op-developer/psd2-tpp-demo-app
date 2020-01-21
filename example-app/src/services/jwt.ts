import * as fs from 'fs';
import panva, { JWS, JWKS } from 'jose';
import { getEnv, getSecrets, prodPublic } from '../app/config';
import { logger } from './logger';
import fetch from 'node-fetch';

const env = getEnv();

const b64uRegExp = /^[a-zA-Z0-9_-]*$/;

const fromBase64 = (base64: string) => {
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const toBase64 = (base64url: string) => {
  return base64url.replace(/-/g, '+').replace(/_/g, '/');
};

const encode = (input: any, encoding: any = 'utf8') => {
  return fromBase64(Buffer.from(input, encoding).toString('base64'));
};

const decode = (input: string) => {
  if (!b64uRegExp.test(input)) {
    throw new TypeError('input is not a valid base64url encoded string');
  }
  return Buffer.from(toBase64(input), 'base64').toString('utf8');
};

// tslint:disable-next-line:max-line-length
// See https://openbanking.atlassian.net/wiki/spaces/DZ/pages/83919096/Open+Banking+Security+Profile+-+Implementer+s+Draft+v1.1.2
const createRequestClaims = (
  authorizationId: string,
  oauthState: string,
  scope: string,
  nonce: string,
  clientId: string,
  callbackUrl: string) => {
    const now = Math.floor(new Date().getTime() / 1000);
    const authorizationIdContent = {
      authorizationId: {
          value: authorizationId,
          essential: true,
      },
    };

    return {
      aud: 'https://mtls.apis.op.fi',
      iss: clientId,
      response_type: 'code id_token',
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope,
      state: oauthState,
      nonce,
      max_age: 24 * 60 * 60,
      exp: (now + (15 * 60)),
      iat: now,
      claims: {
        userinfo: authorizationIdContent,
        id_token: {
          ...authorizationIdContent,
          acr: {
            essential: true,
            values: [
              'urn:openbanking:psd2:sca',
              'urn:openbanking:psd2:ca'],
            },
          },
        },
      };
  };

const createExemptionClaims = (
    authorizationId: string | undefined,
    oauthState: string,
    nonce: string,
    clientId: string) => {
      const authorizationIdContent = {
        authorizationId: {
            value: authorizationId,
            essential: true,
        },
      };

      return {
        max_age: 24 * 60 * 60,
        aud: 'https://mtls.apis.op.fi',
        scope: 'payments',
        iss: clientId,
        claims: {
          id_token: {
            ...authorizationIdContent,
            acr: {
              essential: true,
              values: [
                'urn:openbanking:psd2:ca'],
            },
          },
          userinfo: authorizationIdContent,
        },
        response_type: 'token',
        state: oauthState,
        nonce,
        client_id: clientId,
      };
    };

const asymmetricSign = (claims: object, ssaSigningKey: Buffer) => {
  // tslint:disable-next-line:max-line-length
  // https://openbanking.atlassian.net/wiki/spaces/DZ/pages/36667724/The+OpenBanking+OpenID+Dynamic+Client+Registration+Specification+-+v1.0.0-rc2#TheOpenBankingOpenIDDynamicClientRegistrationSpecification-v1.0.0-rc2-SSAheader
  const jwk = panva.JWK.asKey({
    key: ssaSigningKey,
    passphrase: getSecrets().CERT_PASSPHRASE,
  },
  {
    kid: env.JWT_SIGNATURE_KID || undefined,
    alg: prodPublic() ? 'RS256' : 'ES256',
  });
  const res = panva.JWS.sign(claims, jwk, {kid: jwk.kid});
  return res;
};

/** Get the private key for signing the Software Statement Assertion (SSA). */
export const getSsaSigningKey = (envk: string) => {
  return fs.readFileSync(`certs/client-cert/${prodPublic() ? 'prod-public' : envk}/ssa-signing-key.pem`);
};

export const createClaimsQuery = (
    authorizationId: string,
    oauthState: string,
    scope: string,
    nonce: string,
    clientId: string,
    callbackUrl: string,
    ssaSigningKey: Buffer) => {
    return asymmetricSign(
      createRequestClaims(authorizationId, oauthState, scope, nonce, clientId, callbackUrl), ssaSigningKey);
};

export const createExemptionQuery = (
  authorizationId: string | undefined,
  oauthState: string,
  nonce: string,
  clientId: string,
  ) => {
  return asymmetricSign(
    createExemptionClaims(
                            authorizationId,
                            oauthState,
                            nonce,
                            clientId),
                            getSsaSigningKey(getEnv().APP_ENVIRONMENT),
                          );
};

export const createDetachedSignature = (payload: any, ssaSigningKey: Buffer) => {
  const jws = asymmetricSign(payload, ssaSigningKey);
  const [header, b64Payload, signature] = jws.split('.');
  return `${header}..${signature}`;
};

export const verifyResponseSignature = async (signature: string, body: string) => {
    let keystoreAsJSON;
    const jws = signature.split('..')[0] + '.'
    + fromBase64(Buffer.from(body).toString('base64'))
    + '.' + signature.split('..')[1];
    try {
        const response = await fetch(env.PIS_JWKS_URI, { method: 'GET'});
        keystoreAsJSON = await response.json();
        const keystore = JWKS.asKeyStore(keystoreAsJSON);
        JWS.verify(jws, keystore);
    }
    catch (err) {
      logger.error('Payments returned invalid x-jws-signature');
      return false;
    }
    return true;
};
