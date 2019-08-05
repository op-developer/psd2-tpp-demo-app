import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as ecs from '@aws-cdk/aws-ecs';
import * as route53 from '@aws-cdk/aws-route53';
import * as cm from '@aws-cdk/aws-certificatemanager';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
// tslint:disable:no-unused-expression

/** Create HTTP to HTTPS redirect on ALB */
const createHttpsRedirect = (scope: cdk.Construct, awsAppPrefix: string,
                             loadBalancer: elbv2.ApplicationLoadBalancer) => {
  loadBalancer.connections.allowFromAnyIpv4(ec2.Port.tcp(80));
  const rcp: elbv2.CfnListener.RedirectConfigProperty = {
    statusCode: 'HTTP_302',
    protocol: 'HTTPS',
    port: '443',
  };
  const ap: elbv2.CfnListener.ActionProperty = {
    type: 'redirect',
    redirectConfig: rcp,
  };
  const redirectProps: elbv2.CfnListenerProps = {
    defaultActions: [ap],
    loadBalancerArn: loadBalancer.loadBalancerArn,
    port: 80,
    protocol: 'HTTP',
  };
  return new elbv2.CfnListener(scope, `${awsAppPrefix}HttpRedirect`, redirectProps);
};

interface DnsConfig {
  domainName: string;
  subdomainName: string;
  domainCertArn: string;
}

// Configuration parameters
const containerImageDirectory = '../example-app';
const containerPort = 8181;
const ssmPolicy = 'AmazonSSMReadOnlyAccess';

const applyTags = (construct: cdk.Construct, tags: Parameters) => {
  Object.keys(tags).forEach((name) =>
  construct.node.applyAspect(new cdk.Tag(name, tags[name])));
};

/** Generic list of keys and values */
export interface Parameters {
  [key: string]: string;
}

export class Psd2TppDemoStack extends cdk.Stack {
  constructor(scope: cdk.App, awsAppPrefix: string, dnsConfig: DnsConfig,
              env: Parameters, tags: Parameters, props?: cdk.StackProps) {
    super(scope, `${awsAppPrefix}Stack`, props);

    // Create VPC and Fargate Cluster
    // NOTE: Limit AZs to avoid reaching resource quotas
    const vpc = new ec2.Vpc(this, `${awsAppPrefix}Vpc`, { maxAzs: 2 });
    const cluster = new ecs.Cluster(this, `${awsAppPrefix}Cluster`, { vpc });

    const taskDefinition = new ecs.FargateTaskDefinition(this, `${awsAppPrefix}TaskDefinition`);
    taskDefinition.taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName(ssmPolicy));
    const container = taskDefinition.addContainer(`${awsAppPrefix}Container`, {
      image: ecs.ContainerImage.fromAsset(containerImageDirectory),
      memoryLimitMiB: 256,
      environment: env,
      logging: new ecs.AwsLogDriver({ streamPrefix: `${awsAppPrefix}` }),
    });

    container.addPortMappings({
      containerPort,
      protocol: ecs.Protocol.TCP,
    });

    const fargateService = new ecs.FargateService(this, `${awsAppPrefix}FargateService`, {
      cluster,
      taskDefinition,
    });

    const certificate = cm.Certificate.fromCertificateArn(this, `${awsAppPrefix}Certificate`,
        dnsConfig.domainCertArn);

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, `${awsAppPrefix}LoadBalancer`, {
      vpc,
      internetFacing: true,
    });
    applyTags(loadBalancer, tags);
    applyTags(vpc, tags);

    createHttpsRedirect(this, awsAppPrefix, loadBalancer);
    loadBalancer
      .addListener(`${awsAppPrefix}HttpsListener`, {
        port: 443,
        certificateArns: [certificate.certificateArn],
      })
      .addTargets(`${awsAppPrefix}Target`, {
        protocol: elbv2.ApplicationProtocol.HTTP,
        port: containerPort,
        targets: [fargateService],
        healthCheck: {
          path: '/health-check',
        },
      });

    const zone = route53.HostedZone.fromLookup(this, `${awsAppPrefix}Zone`, {
      domainName: dnsConfig.domainName,
    });
    new route53.CnameRecord(this, `${awsAppPrefix}Cname`, {
      zone,
      recordName: dnsConfig.subdomainName,
      domainName: loadBalancer.loadBalancerDnsName,
    });

    // Output the DNS where you can access your service
    new cdk.CfnOutput(this, `${awsAppPrefix}DnsName`, { value: loadBalancer.loadBalancerDnsName });
    new cdk.CfnOutput(this, `${awsAppPrefix}ServiceName`, { value: `${dnsConfig.subdomainName}.${dnsConfig.domainName}` });
  }
}
