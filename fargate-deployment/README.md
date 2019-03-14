# Fargate Deployment

Contains an example infrastructure for hosting the Demo Application in AWS.

## Log in to the relevant AWS account

Check that your AWS account is configured properly and log in.

```bash
# Install from https://github.com/remind101/assume-role
# Log in the session
eval $(assume-role <aws-account-name>)
```

## Initial setup

Before first deployment you need to bootstrap the project.

```bash
# Install or update CDK globally
npm i -g aws-cdk
# Initialize the environment
cdk bootstrap <aws-account-id>/eu-central-1
```

### Configure SSM Parameters

Use store-parameter.py to configure following parameters:

`python3 ../store-parameter.py -e psd2-sandbox -a psd2-tpp-demo-app -k API_KEY -v acE2Vo0x0ncuUeV9j5rwyl3BxAQHYPpSmAwSoe1U2vn72J4kggMPxBpYnPinYzF`

* /psd2-sandbox/psd2-sandbox/psd2-tpp-demo-app/API_KEY acE2Vo0x0ncuUeV9j5rwyl3BxAQHYPpSmAwSoe1U2vn72J4kggMPxBpYnPinYzF
* /psd2-sandbox/psd2-sandbox/psd2-tpp-demo-app/CERT_PASSPHRASE LWGwnA622FBOSq3jJJlx1h46OBNz0tWz3ON1140Ggj93HI0cL0g3iL8VOO6wMMv
* /psd2-sandbox/psd2-sandbox/psd2-tpp-demo-app/SESSION_SECRET q8LdtM8dDslgIJs5D9I2bWcf68IOZPqG2hUlX5oYguiIRu64nb92FADmEpEusyS
* /psd2-sandbox/psd2-sandbox/psd2-tpp-demo-app/TPP_CLIENT_ID 2tiYqBEoFqBR08yRqGEUB4RdCoYwasHxm4cVi0nxwpa7YAjj6dakKq38LxKI1F5
* /psd2-sandbox/psd2-sandbox/psd2-tpp-demo-app/TPP_CLIENT_SECRET 8USCRQmW4uuB80rgJ9ebJOA3akjpuFPFGit3x8loC92jVlOp3QV6xqH79AFM2SS

## Normal deployment

After you have made your changes to the stack, run.

```bash
npm run build && cdk deploy
```

## Other commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
