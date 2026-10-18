# AWS Deployment & DNS Setup Guide: `faphouse3.com`

This guide explains how to deploy the serverless stack and configure DNS for **`faphouse3.com`** when you are ready.

> **Note**: As requested, do **not** run deployments yet. Use this document as your manual when you are ready.

---

## 1. AWS Resource Inventory for `faphouse3.com`

| Resource | Service | Purpose |
|---|---|---|
| **`DomainTrafficStats`** | Amazon DynamoDB | Stores visit counts for `faphouse3.com` (On-Demand mode). |
| **`faphouse3RedirectorRole`** | AWS IAM | Grants Lambda permissions for CloudWatch logs and DynamoDB `UpdateItem`. |
| **`faphouse3TrafficRedirector`** | AWS Lambda | Node.js 20.x/22.x execution engine. |
| **`faphouse3.com` (and `*.faphouse3.com`)** | AWS Certificate Manager | Public SSL/TLS certificate for HTTPS termination. |
| **`faphouse3GatewayApi`** | API Gateway (HTTP API v2) | Single Custom Domain mapped to `$default` route. |

---

## 2. Step-by-Step AWS Setup

### Step 1: Create DynamoDB Table
1. AWS Console &rarr; **DynamoDB** &rarr; **Tables** &rarr; **Create table**.
2. **Table name**: `DomainTrafficStats`
3. **Partition key**: `domain` (String)
4. **Sort key**: `metric` (String)
5. **Capacity mode**: **On-demand** (Free within tier).

---

### Step 2: Create IAM Role
1. AWS Console &rarr; **IAM** &rarr; **Roles** &rarr; **Create role**.
2. Select **AWS service** &rarr; **Lambda**.
3. Attach policy: `AWSLambdaBasicExecutionRole`.
4. Attach inline policy for DynamoDB:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["dynamodb:UpdateItem", "dynamodb:GetItem"],
         "Resource": "arn:aws:dynamodb:*:*:table/DomainTrafficStats"
       }
     ]
   }
   ```
5. Role name: `faphouse3RedirectorRole`.

---

### Step 3: Deploy Lambda Function
1. Zip files locally:
   ```bash
   zip -r function.zip lambda/ package.json
   ```
2. AWS Console &rarr; **Lambda** &rarr; **Create function**:
   - Name: `faphouse3TrafficRedirector`
   - Runtime: `Node.js 20.x` or `Node.js 22.x`
   - Role: `faphouse3RedirectorRole`
3. Add Environment Variables:
   - `TARGET_DOMAIN`: `https://faphouse2.com`
   - `INGRESS_DOMAIN`: `faphouse3.com`
   - `COUNTDOWN_SECONDS`: `10`
   - `TRACKING_TABLE_NAME`: `DomainTrafficStats`

---

### Step 4: Request SSL Certificate (ACM)
1. In AWS Certificate Manager (same region as API Gateway, e.g. `us-east-1`):
2. Click **Request public certificate**.
3. Fully Qualified Domain Names:
   - `faphouse3.com`
   - `*.faphouse3.com`
4. Validation: **DNS validation**.
5. Add the generated ACM CNAME record to the Cloudflare DNS dashboard for `faphouse3.com`.

---

### Step 5: Configure API Gateway HTTP API
1. AWS Console &rarr; **API Gateway** &rarr; **Create API** &rarr; **HTTP API**.
2. Name: `faphouse3GatewayApi`.
3. Add integration: Select Lambda &rarr; `faphouse3TrafficRedirector`.
4. Configure route: Method `ANY`, path `/{proxy+}` (or `$default`).
5. Stage: `$default` (Auto-deploy enabled).

---

### Step 6: Add Custom Domain in API Gateway
1. API Gateway &rarr; **Custom domain names** &rarr; **Create**.
2. **Domain name**: `faphouse3.com`
3. **Endpoint type**: Regional
4. **ACM certificate**: Select the validated certificate from Step 4.
5. Under **API mappings**:
   - API: `faphouse3GatewayApi`
   - Stage: `$default`
6. Note the provided **API Gateway domain name** target (e.g., `d-1a2b3c4d.execute-api.us-east-1.amazonaws.com`).

---

## 3. Cloudflare DNS Setup for `faphouse3.com`

Log into Cloudflare for `faphouse3.com` (`lex.ns.cloudflare.com` & `miki.ns.cloudflare.com`):
1. **Root Domain (@)**:
   - **Type**: `CNAME`
   - **Name**: `@`
   - **Target**: `d-1a2b3c4d.execute-api.us-east-1.amazonaws.com`
   - **Proxy status**: Proxied (Orange Cloud) with SSL mode **Full (Strict)**.
2. **WWW Subdomain**:
   - **Type**: `CNAME`
   - **Name**: `www`
   - **Target**: `d-1a2b3c4d.execute-api.us-east-1.amazonaws.com`
   - **Proxy status**: Proxied.
