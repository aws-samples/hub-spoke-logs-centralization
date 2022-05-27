#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { HubCdkStack } from '../lib/hub-cdk-stack';
import { AwsSolutionsChecks } from 'cdk-nag';

const app = new cdk.App();
new HubCdkStack(app, 'HubCdkStack', {});
cdk.Aspects.of(app).add(new AwsSolutionsChecks());