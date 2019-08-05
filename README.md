# PSD2 TPP Demo App

This repository contains a Node.js Express application demonstrating a PSD2 Third Party Provider (TPP).
The application is meant for testing purposes and integration example for PSD2 interfaces.

For more information, see <https://op-developer.fi>

The demo is hosted at <https://example.successful-personal-finances.business>.

Currently only Accounts API is included in the demo.

## Pre-requisities

- Install [Node.js](https://nodejs.org/en/)
- Install [VS Code](https://code.visualstudio.com/) for development
- Install Typescript runner for development
- Optionally install Jest plugin for VS Code

```bash
npm install -g jest
npm install -g ts-node
npm install -g typescript
npm install -g aws-cdk
```

## Getting started

- Clone the repository and install dependencies

- Generated a HTTPS certificate for localhost development as OAuth flow always redirects to a HTTPS address only

Location for `server.crt` and `server.key` is `certs/localhost-server`.

- Register and generate PSD2 certificates for MTLS and SSA signing

Place certificates to `certs/client-cert/psd2-sandbox-prod/client.crt`, `certs/client-cert/psd2-sandbox-prod/key.pem` and `certs/client-cert/psd2-sandbox-prod/ssa-signing-key.pem`.

- Configure required secrets

You can configure secrets to `psd2-sandbox-prod.localhost.secrets` or `fargate-deployment/bin/psd2-tpp-demo-conf.example.ts` depending whether you run the service locally or in AWS.

```bash
# env/psd2-sandbox-prod.localhost.secrets
API_KEY=xxxx
CERT_PASSPHRASE=yyyy
SESSION_SECRET=zzzz
TPP_CLIENT_ID=tttt
TPP_CLIENT_SECRET=mmmm
```

- Build and run the project

```bash
# Start the development version in localhost mode
# Secrets are read from env/psd2-sandbox-prod.localhost.secrets
npm run build && APP_ENVIRONMENT=psd2-sandbox npm start
```

Navigate to `https://localhost:8181` to check everything is running correctly.
You can add the server certificate to your trusted certs or you need to ignore the browser warning.

## AWS Deployment

See `Dockerfile` for build definitions and `fargate-deployment` for deployment instructions.

Deployment for localhost and AWS have to have slightly different configuration since the OAuth callback url is different.
