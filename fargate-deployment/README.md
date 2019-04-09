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

See `bin/pds2-tpp-demo-conf.example.ts` for configuring the needed parameters.
Follow the onboarding guide at OP Developer site to find out the correct values.

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
