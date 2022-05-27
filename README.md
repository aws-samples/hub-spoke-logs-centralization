## Hub/Spoke Logs Centralization

This solution allows you to setup a centralized CloudWatch Logs group to aggregate CloudWatch Log events from spoke AWS accounts into a hub AWS Account. In this pattern, hub accounts are used centralize audit resources, and spoke accounts contain the monitored resources. With all logs centralized into one log group, you can easily search across and audit logs from any number of spoke accounts. Additionally, once logs are forwarded to the hub account, they are unable to be modified by the source spoke account.

In short, this pattern:

- Creates a CloudWatch log group within the hub account with a name of `/apg/logs-from-spokes`
- Creates a CloudWatch log group within the spoke account with a name of `/apg/spoke-group`
- Creates a CloudWatch destination and CloudWatch subscription to forward logs from `/apg/spoke-group` to `/apg/logs-from-spokes`

This repository contains three projects:

- [hub-cdk](/hub-cdk)
- [spoke-cdk](/spoke-cdk)
- [benchmark](/benchmark)

## Getting started

1. Clone this repository
1. Ensure `node` and the CDK is installed
1. In `hub-cdk/`, run `npm install`
1. In `spoke-cdk/`, run `npm install`

## Deploying

1. Edit [`hub-cdk/lib/hub-cdk-stack.ts`](/hub-cdk/lib/hub-cdk-stack.ts) and set `SPOKE_ACCOUNT_IDS` to contain the spoke account ID
1. Edit [`spoke-cdk/lib/spoke-cdk-stack.ts`](/spoke-cdk/lib/spoke-cdk-stack.ts) and set `HUB_ACCOUNT_ID` to the hub account ID
1. In `hub-cdk`, run `cdk deploy` within the context of the hub account. For example, if your hub account profile is named `apg_hub`, use `cdk deploy --profile apg_hub`
1. In `spoke-cdk`, run `cdk deploy` within the context of the spoke account. For example, if your hub account profile is named `apg_spoke`, use `cdk deploy --profile apg_spoke`

## Operating

This pattern requires no scaling or active maintenance. Once fully deployed, logs in the log group of `/apg/spoke-group` in the spoke account will be automatically forwarded into the log group of `/apg/logs-from-spokes` in the hub account. To prevent log stream name conflicts, the log stream names will have the spoke account ID prepended to the original log stream name.

## Benchmarking

Use the [benchmark/](/benchmark/) harness to test the end-to-end flow. This will create a log stream within the `/apg/spoke-group` log group and send 100,000 events at 1,000 events per batch.

1. In `benchmark/`, run `npm install`
1. Using the correct profile, run `AWS_PROFILE=<profile> AWS_SDK_LOAD_CONFIG=1 node index.js`
1. Observe that in the hub account, the log group of `/apg/logs-from-spokes` contains a new log stream with the contents sent from the script

## Destroying

1. In `hub-cdk`, run `cdk destroy` within the context of the hub account
1. In `spoke-cdk`, run `cdk destroy` within the context of the spoke account

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.

