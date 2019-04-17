import * as cdk from '@aws-cdk/cdk';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as route53 from '@aws-cdk/aws-route53';
import * as cm from '@aws-cdk/aws-certificatemanager';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
// tslint:disable:no-unused-expression

/** Create HTTP to HTTPS redirect on ALB */
const createHttpsRedirect = (scope: cdk.Construct, awsAppPrefix: string,
                             loadBalancer: elbv2.ApplicationLoadBalancer) => {
  loadBalancer.connections.allowFromAnyIPv4(new ec2.TcpPort(80));
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
  zoneName: string;
  hostedZoneId: string;
  subdomainName: string;
  domainCertArn: string;
}

// Configuration parameters
const containerImageDirectory = '../';
const containerPort = 8181;
const ssmPolicy = 'arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess';

const applyTags = (node: cdk.ConstructNode, tags: Parameters) => {
  Object.keys(tags).forEach((name) =>
    node.apply(new cdk.Tag(name, tags[name])));
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
    const vpc = new ec2.VpcNetwork(this, `${awsAppPrefix}Vpc`, { maxAZs: 2 });
    const cluster = new ecs.Cluster(this, `${awsAppPrefix}Cluster`, { vpc });

    const taskDefinition = new ecs.FargateTaskDefinition(this, `${awsAppPrefix}TaskDefinition`);
    taskDefinition.taskRole.attachManagedPolicy(ssmPolicy);
    const container = taskDefinition.addContainer(`${awsAppPrefix}Container`, {
      image: ecs.ContainerImage.fromAsset(this, `${awsAppPrefix}Image`, {
        directory: containerImageDirectory,
      }),
      memoryLimitMiB: 256,
      environment: env,
      logging: new ecs.AwsLogDriver(this, `${awsAppPrefix}Log`, { streamPrefix: `${awsAppPrefix}` }),
    });

    container.addPortMappings({
      containerPort,
      protocol: ecs.Protocol.Tcp,
    });

    const fargateService = new ecs.FargateService(this, `${awsAppPrefix}FargateService`, {
      cluster,
      taskDefinition,
    });

    const certificate = cm.Certificate.import(this, `${awsAppPrefix}Certificate`, {
        certificateArn: dnsConfig.domainCertArn,
    });

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, `${awsAppPrefix}LoadBalancer`, {
      vpc,
      internetFacing: true,
    });
    applyTags(loadBalancer.node, tags);
    applyTags(vpc.node, tags);
    applyTags(fargateService.node, tags);

    createHttpsRedirect(this, awsAppPrefix, loadBalancer);
    loadBalancer
      .addListener(`${awsAppPrefix}HttpsListener`, {
        port: 443,
        certificateArns: [certificate.certificateArn],
      })
      .addTargets(`${awsAppPrefix}Target`, {
        protocol: elbv2.ApplicationProtocol.Http,
        port: containerPort,
        targets: [fargateService],
        healthCheck: {
          path: '/health-check',
        },
      });

    const zone = route53.HostedZone.import(this, `${awsAppPrefix}Zone`, {
      zoneName: dnsConfig.zoneName,
      hostedZoneId: dnsConfig.hostedZoneId,
    });
    new route53.CnameRecord(this, `${awsAppPrefix}Cname`, {
      zone,
      recordName: dnsConfig.subdomainName,
      recordValue: loadBalancer.dnsName,
    });

    // Output the DNS where you can access your service
    new cdk.CfnOutput(this, `${awsAppPrefix}DnsName`, { value: loadBalancer.dnsName });
  }
}
