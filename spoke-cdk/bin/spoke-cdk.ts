#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SpokeCdkStack } from '../lib/spoke-cdk-stack';
import { AwsSolutionsChecks } from 'cdk-nag';

const app = new cdk.App();
new SpokeCdkStack(app, 'SpokeCdkStack', {});
cdk.Aspects.of(app).add(new AwsSolutionsChecks());