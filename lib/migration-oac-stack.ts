import {
  RemovalPolicy,
  Stack,
  StackProps,
  aws_cloudfront,
  aws_cloudfront_origins,
  aws_iam,
  aws_s3,
} from "aws-cdk-lib";
import { BucketAccessControl } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
// import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
// import { existsSync } from "fs";
// import { join } from "path";

export class MigrationOacStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const appBucket = new aws_s3.Bucket(this, "migration-app-bucket", {
      bucketName: "migration-to-oac",
      versioned: true,
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
      // accessControl: BucketAccessControl.PRIVATE,
      cors: [
        {
          allowedMethods: [aws_s3.HttpMethods.GET, aws_s3.HttpMethods.HEAD],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
        },
      ],
    });
    const mediaBucket = new aws_s3.Bucket(this, "migration-media-bucket", {
      bucketName: "migration-media-bucket",
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
      // accessControl: BucketAccessControl.PRIVATE,
      removalPolicy: RemovalPolicy.DESTROY,
      versioned: true,
      cors: [
        {
          allowedMethods: [aws_s3.HttpMethods.GET, aws_s3.HttpMethods.HEAD],
          // Allow specific domain name to retrics others
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
        },
      ],
    });

    // OAC
    const cfnOriginAccessControl = new aws_cloudfront.CfnOriginAccessControl(
      this,
      "OriginAccessControl",
      {
        originAccessControlConfig: {
          name: "OriginAccessControlForAppBucket",
          originAccessControlOriginType: "s3",
          signingBehavior: "always",
          signingProtocol: "sigv4",
          description: "S3 Access Control",
        },
      }
    );

    // CloudFront
    const distribution = new aws_cloudfront.Distribution(this, "Distribution", {
      comment: "distribution.",
      defaultBehavior: {
        origin: new aws_cloudfront_origins.S3Origin(appBucket),
      },
      additionalBehaviors: {
        "/images/*": {
          origin: new aws_cloudfront_origins.S3Origin(mediaBucket),
        },
      },
      defaultRootObject: "index.html",
    });

    const cfnDistribution = distribution.node
      .defaultChild as aws_cloudfront.CfnDistribution;
    // OAI削除（勝手に設定されるため）
    cfnDistribution.addOverride(
      "Properties.DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity",
      ""
    );
    cfnDistribution.addOverride(
      "Properties.DistributionConfig.Origins.1.S3OriginConfig.OriginAccessIdentity",
      ""
    );
    // OACではCustomOriginConfigは不要
    cfnDistribution.addPropertyDeletionOverride(
      "DistributionConfig.Origins.0.CustomOriginConfig"
    );
    cfnDistribution.addPropertyDeletionOverride(
      "DistributionConfig.Origins.1.CustomOriginConfig"
    );
    // デフォルトではs3のWebsiteURLが設定されてエラーとなるため、S3のドメイン名を設定する
    cfnDistribution.addPropertyOverride(
      "DistributionConfig.Origins.0.DomainName",
      appBucket.bucketRegionalDomainName
    );
    cfnDistribution.addPropertyOverride(
      "DistributionConfig.Origins.1.DomainName",
      mediaBucket.bucketRegionalDomainName
    );

    // OAC設定
    cfnDistribution.addPropertyOverride(
      "DistributionConfig.Origins.0.OriginAccessControlId",
      cfnOriginAccessControl.getAtt("Id")
    );
    cfnDistribution.addPropertyOverride(
      "DistributionConfig.Origins.1.OriginAccessControlId",
      cfnOriginAccessControl.getAtt("Id")
    );

    // S3 - BucketPolicy
    const appBucketPolicyStatement = new aws_iam.PolicyStatement({
      actions: ["s3:GetObject"],
      effect: aws_iam.Effect.ALLOW,
      principals: [new aws_iam.ServicePrincipal("cloudfront.amazonaws.com")],
      resources: [`${appBucket.bucketArn}/*`],
      conditions: {
        StringEquals: {
          "AWS:SourceArn": `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
        },
      },
    });
    const mediaBucketPolicyStatement = new aws_iam.PolicyStatement({
      actions: ["s3:GetObject"],
      effect: aws_iam.Effect.ALLOW,
      principals: [new aws_iam.ServicePrincipal("cloudfront.amazonaws.com")],
      resources: [`${mediaBucket.bucketArn}/*`],
      conditions: {
        StringEquals: {
          "AWS:SourceArn": `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
        },
      },
    });

    appBucket.addToResourcePolicy(appBucketPolicyStatement);
    mediaBucket.addToResourcePolicy(mediaBucketPolicyStatement);
  }
}
