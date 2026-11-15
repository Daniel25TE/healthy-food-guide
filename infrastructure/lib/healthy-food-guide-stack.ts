import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as path from 'path';
import { Construct } from 'constructs';

export class HealthyFoodGuideStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const githubPagesOrigin = this.node.tryGetContext('githubPagesOrigin') as string;
    if (!githubPagesOrigin || githubPagesOrigin === 'REPLACE_WITH_YOUR_GITHUB_PAGES_URL') {
      throw new Error(
        'Set the githubPagesOrigin context value before deploying.\n' +
        'Example: cdk deploy --context githubPagesOrigin=https://daniel25te.github.io'
      );
    }

    // --- DynamoDB Table ---
    const table = new dynamodb.Table(this, 'Table', {
      tableName: 'healthy-food-guide',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      pointInTimeRecovery: false, // disabled to minimize cost for this prototype
      removalPolicy: cdk.RemovalPolicy.DESTROY, // safe to delete with the stack
    });

    // --- CloudWatch Log Group for Lambda ---
    const lambdaLogGroup = new logs.LogGroup(this, 'LambdaLogGroup', {
      logGroupName: `/aws/lambda/healthy-food-guide-api`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- Lambda Function ---
    const apiHandler = new lambda.Function(this, 'ApiHandler', {
      functionName: 'healthy-food-guide-api',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda')),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        TABLE_NAME: table.tableName,
        ALLOWED_ORIGIN: githubPagesOrigin,
      },
      logGroup: lambdaLogGroup,
    });

    // Least-privilege IAM: only the specific actions needed on this table
    apiHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
      ],
      resources: [table.tableArn],
    }));

    // --- HTTP API Gateway ---
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'healthy-food-guide-api',
      corsPreflight: {
        allowOrigins: [githubPagesOrigin],
        allowHeaders: ['Content-Type'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        maxAge: cdk.Duration.hours(1),
      },
    });

    const lambdaIntegration = new apigwv2integrations.HttpLambdaIntegration(
      'LambdaIntegration',
      apiHandler
    );

    httpApi.addRoutes({ path: '/events', methods: [apigwv2.HttpMethod.POST], integration: lambdaIntegration });
    httpApi.addRoutes({ path: '/comments/{recipeId}', methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST], integration: lambdaIntegration });

    // Throttle the default stage: 3 req/sec steady, burst up to 10
    const cfnStage = httpApi.defaultStage?.node.defaultChild as apigwv2.CfnStage;
    cfnStage.defaultRouteSettings = {
      throttlingRateLimit: 3,
      throttlingBurstLimit: 10,
    };

    // --- CloudWatch Log Group for API Gateway ---
    new logs.LogGroup(this, 'ApiGwLogGroup', {
      logGroupName: `/aws/apigateway/healthy-food-guide`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- Billing Alarm ---
    // SNS topic → email → CloudWatch alarm triggers when estimated charges exceed $5
    const billingTopic = new sns.Topic(this, 'BillingAlarmTopic', {
      topicName: 'healthy-food-guide-billing-alarm',
    });
    billingTopic.addSubscription(
      new snsSubscriptions.EmailSubscription('danielalejandrosud25@gmail.com')
    );
    const billingAlarm = new cloudwatch.Alarm(this, 'BillingAlarm', {
      alarmName: 'healthy-food-guide-billing-5usd',
      alarmDescription: 'Alert when estimated AWS charges exceed $5',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensionsMap: { Currency: 'USD' },
        statistic: 'Maximum',
        period: cdk.Duration.hours(6),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    billingAlarm.addAlarmAction(new cloudwatchActions.SnsAction(billingTopic));

    // --- Output ---
    new cdk.CfnOutput(this, 'ApiBaseUrl', {
      value: httpApi.apiEndpoint,
      description: 'Set this as API_BASE_URL in assets/js/api.js',
    });
  }
}
