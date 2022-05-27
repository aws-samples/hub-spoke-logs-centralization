import { Stack, StackProps, Resource, ArnFormat, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';

const HUB_ACCOUNT_ID = '<Hub Account ID>';
const HUB_CW_LOGS_DESTINATION_NAME = 'SpokeLogsDestination';

interface ExternalDestinationProps {
  readonly destinationArn: string;
}

class ExternalDestination extends Resource implements logs.ILogSubscriptionDestination {
  public readonly destinationArn: string;

  constructor(scope: Construct, id: string, props: ExternalDestinationProps) {
    super(scope, id);

    this.destinationArn = props.destinationArn;
  }

  public bind(_scope: Construct, _sourceLogGroup: logs.ILogGroup): logs.LogSubscriptionDestinationConfig {
    return { arn: this.destinationArn };
  }
}

export class SpokeCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const cwGroup = new logs.LogGroup(this, 'SpokeGroup', {
      logGroupName: '/apg/spoke-group',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const destinationArn = this.formatArn({
      account: HUB_ACCOUNT_ID,
      service: 'logs',
      resource: 'destination',
      resourceName: HUB_CW_LOGS_DESTINATION_NAME,
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
    });

    const dest = new ExternalDestination(this, 'ExternalDestination', {
      destinationArn,
    });
    

    cwGroup.addSubscriptionFilter('Cross', {
      destination: dest,
      filterPattern: logs.FilterPattern.allEvents(),
    });
  }
}
