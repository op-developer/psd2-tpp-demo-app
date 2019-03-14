import * as fs from 'fs';
import * as jwt from 'jsonwebtoken';
import { getEnv } from '../app/config';

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

const asymmetricSign = (claims: object) => {
  // tslint:disable-next-line:max-line-length
  // https://openbanking.atlassian.net/wiki/spaces/DZ/pages/36667724/The+OpenBanking+OpenID+Dynamic+Client+Registration+Specification+-+v1.0.0-rc2#TheOpenBankingOpenIDDynamicClientRegistrationSpecification-v1.0.0-rc2-SSAheader
  const algorithm = 'ES256';
  const signCert = fs.readFileSync(`certs/client-cert/${process.env.APP_ENVIRONMENT}/ssa-signing-key.pem`, 'ascii');
  const jwtOptions = {
      header: {
          typ: 'JWT',
          kid: getEnv().JWT_SIGNATURE_KID,
      },
      algorithm,
  };
  return jwt.sign(JSON.stringify(claims), signCert, jwtOptions);
};

export const createClaimsQuery = (
    authorizationId: string,
    oauthState: string,
    scope: string,
    nonce: string,
    clientId: string,
    callbackUrl: string) => {
    return asymmetricSign(createRequestClaims(authorizationId, oauthState, scope, nonce, clientId, callbackUrl));
};
