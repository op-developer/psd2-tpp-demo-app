#!/usr/bin/env node
// tslint:disable:no-unused-expression
import * as cdk from '@aws-cdk/cdk';
import { Psd2TppDemoStack, Parameters } from '../lib/psd2-tpp-demo-stack';
import * as ssm from '@aws-cdk/aws-ssm';
import { SSM_PARAMETERS, STACK_TAGS, AWS_CONFIG, DNS_CONFIG } from './psd2-tpp-demo-conf.op';

const appName = 'psd2-sandbox';
const serviceName = 'psd2-tpp-demo-app';
const environmentName = 'psd2-sandbox-prod';
const awsAppPrefix = 'Psd2Tpp';

const storeParameters = (stack: cdk.Stack, params: Parameters) => {
  Object.keys(params).forEach((name) =>
    new ssm.StringParameter(stack, `${awsAppPrefix}Parameter-${name}`, {
      name: `/${appName}/${environmentName}/${serviceName}/${name}`,
      stringValue: params[name],
    }));
};

const containerEnv = { APP_ENVIRONMENT: environmentName };

const app = new cdk.App();
const demoStack = new Psd2TppDemoStack(app, awsAppPrefix,
  DNS_CONFIG, containerEnv, STACK_TAGS, {
    env: {
        region: AWS_CONFIG.AwsRegion,
        account: AWS_CONFIG.AwsAccount,
    },
  });

storeParameters(demoStack, SSM_PARAMETERS);

app.run();
