#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { MigrationOacStack } from "../lib/migration-oac-stack";

const app = new cdk.App();
new MigrationOacStack(app, "MigrationOacStack", {});
