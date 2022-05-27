import { Duration, Stack, StackProps, RemovalPolicy, ArnFormat } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { NagSuppressions } from 'cdk-nag';

const SPOKE_ACCOUNT_IDS = ['<Spoke Account ID>'];
const DESTINATION_NAME = 'SpokeLogsDestination';
const DESTINATION_GROUP_NAME = '/apg/logs-from-spokes';
const LAMBDA_FORWARDER_NAME = 'LogForwarder';

export class HubCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const roleToWriteToLogs = new iam.Role(this, 'DestinationRole', {
      assumedBy: new iam.ServicePrincipal('logs.amazonaws.com', {
        conditions: {
          StringEquals: {
            'aws:SourceAccount': this.account,
          },
        },
      }),
    });
    NagSuppressions.addStackSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Wildcard permissions are used to allow execution of the Lambda',
          appliesTo: ['Resource::<LogForwarder5335F456.Arn>:*'],
        },
      ],
      true
    );
    const destinationLogGroup = new logs.LogGroup(this, 'HubLogGroup', {
      logGroupName: DESTINATION_GROUP_NAME,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const lambdaLogGroup = new logs.LogGroup(this, 'LambdaLogGroup', {
      logGroupName: `/aws/lambda/${LAMBDA_FORWARDER_NAME}`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const lambdaRole = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    const logForwarder = new lambdaNodejs.NodejsFunction(this, 'LogForwarder', {
      functionName: LAMBDA_FORWARDER_NAME,
      role: lambdaRole,
      timeout: Duration.minutes(1),
      environment: {
        AGGREGATION_GROUP_NAME: destinationLogGroup.logGroupName,
      },
      tracing: lambda.Tracing.ACTIVE,
    });
    destinationLogGroup.grantWrite(lambdaRole);
    lambdaLogGroup.grantWrite(lambdaRole);

    logForwarder.addPermission('PermissionForHubAccount', {
      principal: new iam.ServicePrincipal('logs.amazonaws.com'),
      sourceAccount: this.account,
    });

    for (let i = 0; i < SPOKE_ACCOUNT_IDS.length; i++) {
      logForwarder.addPermission(`PermissionForSpokeAccount${i}`, {
        principal: new iam.ServicePrincipal('logs.amazonaws.com'),
        sourceArn: this.formatArn({
          service: 'logs',
          account: SPOKE_ACCOUNT_IDS[i],
          resource: 'log-group',
          resourceName: '*',
          arnFormat: ArnFormat.COLON_RESOURCE_NAME,
        }),
        sourceAccount: SPOKE_ACCOUNT_IDS[i],
      });
    }

    NagSuppressions.addResourceSuppressions(
      lambdaRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'xray:PutTelemetryRecords + xray:PutTraceSegments requires a resource of *',
          appliesTo: ['Resource::*'],
        },
      ],
      true
    );

    const cwDestination = new logs.CrossAccountDestination(this, 'LambdaDestination', {
      role: roleToWriteToLogs,
      targetArn: logForwarder.functionArn,
      destinationName: DESTINATION_NAME,
    });
    const destinationArn = this.formatArn({
      service: 'logs',
      resource: 'destination',
      resourceName: DESTINATION_NAME,
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
    });
    cwDestination.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:PutSubscriptionFilter'],
        principals: SPOKE_ACCOUNT_IDS.map((accountId) => new iam.ArnPrincipal(accountId)),
        resources: [destinationArn],
      })
    );

    // Attach an explicit dependency to require the Lambda permission to be created before the CW Destination
    // Without the dependency, the creation of the Destination could fail when it tries to test if it can invoke
    // the Lambda with an error of "Could not deliver test message to specified destination."
    const permissionNodeForHubAccount = logForwarder.node.findChild('PermissionForHubAccount');
    cwDestination.node.addDependency(permissionNodeForHubAccount);
  }
}
