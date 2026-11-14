import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { HealthyFoodGuideStack } from '../lib/healthy-food-guide-stack';

const app = new cdk.App();

new HealthyFoodGuideStack(app, 'HealthyFoodGuideStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});
