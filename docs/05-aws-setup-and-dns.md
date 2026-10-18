# AWS Deployment & Domain / DNS Configuration Guide

This guide documents all AWS services and DNS configurations needed to deploy the multi-domain traffic gateway.

> **Note**: As requested, do **not** run deployments yet. Use this document as your deployment manual when you are ready.

---

## 1. AWS Services Checklist

| Service | Resource Name | Purpose | Configuration Details |
|---|---|---|---|
| **DynamoDB** | `DomainTrafficStats` | Stores domain visit counts and timestamps | Partition Key: `domain` (String)<br>Sort Key: `metric` (String)<br>Capacity: On-Demand |
| **IAM** | `TrafficGatewayLambdaRole` | Allows Lambda to write logs and update DynamoDB | Managed Policy: `AWSLambdaBasicExecutionRole`<br>Custom Policy: `dynamodb:UpdateItem`, `dynamodb:GetItem` |
| **AWS Lambda** | `MultiDomainTrafficGateway` | Executes domain tracking and redirect logic | Runtime: Node.js 20.x or 22.x<br>Memory: 256 MB<br>Timeout: 3-5 seconds |
| **ACM** | Multi-Domain Certificate | Provides HTTPS SSL/TLS encryption for domains | Domains: `faphouse.com`, `*.faphouse.com`, `faphouse2.com`, `faphouse3.com` |
| **API Gateway** | `MultiDomainGatewayApi` | Routes web requests from custom domains to Lambda | Type: HTTP API (v2)<br>Route: `$default` -> Lambda integration |

---

## 2. Step-by-Step Provisioning Guide

### Step 1: Create the DynamoDB Table
1. Open the **AWS Console** -> **DynamoDB** -> **Tables** -> **Create table**.
2. **Table name**: `DomainTrafficStats`
3. **Partition key**: `domain` (String)
4. **Sort key**: `metric` (String)
5. **Table settings**: Select **Custom settings** -> Set **Read/write capacity** to **On-demand**.
6. Click **Create table**.

---

### Step 2: Create the IAM Execution Role
1. Navigate to **IAM** -> **Roles** -> **Create role**.
2. Select **AWS service** -> Use case: **Lambda**.
3. Attach policy: `AWSLambdaBasicExecutionRole` (grants permission to write CloudWatch logs).
4. Add an inline policy granting DynamoDB access:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "dynamodb:UpdateItem",
           "dynamodb:GetItem"
         ],
         "Resource": "arn:aws:dynamodb:*:*:table/DomainTrafficStats"
       }
     ]
   }
   ```
5. Name the role: `TrafficGatewayLambdaRole`.

---

### Step 3: Create and Package the Lambda Function
1. On your local machine, zip your lambda directory:
   ```bash
   zip -r function.zip lambda/ package.json
   ```
2. Navigate to **AWS Lambda** -> **Create function**.
3. **Function name**: `MultiDomainTrafficGateway`
4. **Runtime**: `Node.js 20.x` (or `Node.js 22.x`)
5. **Architecture**: `arm64` (Graviton2 is ~20% cheaper) or `x86_64`.
6. **Execution role**: Choose existing role -> Select `TrafficGatewayLambdaRole`.
7. Under **Configuration** -> **Environment variables**:
   - `TRACKING_TABLE_NAME`: `DomainTrafficStats`
   - `TARGET_REDIRECT_DOMAIN`: `https://faphouse2.com`

---

### Step 4: Create the API Gateway (HTTP API)
1. Open **API Gateway** -> **Create API** -> Choose **HTTP API** -> **Build**.
2. **Integrations**: Add **Lambda** -> Choose `MultiDomainTrafficGateway`.
3. **API name**: `MultiDomainGatewayApi`.
4. **Configure routes**:
   - Method: `ANY`
   - Resource path: `/{proxy+}` (or `$default`)
5. **Stage**: Name it `$default` with Auto-deploy enabled.

---

### Step 5: Request Public SSL Certificates (ACM)
For API Gateway to terminate HTTPS traffic for custom domains, certificates must be issued in AWS Certificate Manager:
1. Open **AWS Certificate Manager (ACM)** (in the same AWS region as your API Gateway, e.g. `us-east-1`).
2. Click **Request a public certificate**.
3. Fully qualified domain names:
   - `faphouse3.com`
   - `*.faphouse3.com`
   - *(Optional: include `faphouse.com` and `faphouse2.com` if also migrating edge routing)*
4. Validation method: **DNS validation**.
5. ACM provides CNAME records (e.g. `_c89b...faphouse3.com` -> `_a12f...acm-validations.aws.`).
6. Add these CNAME validation records into the domain's DNS manager (Cloudflare).

---

### Step 6: Configure API Gateway Custom Domain Names
For each domain (`faphouse.com`, `faphouse2.com`, `faphouse3.com`):
1. In API Gateway, navigate to **Custom domain names** -> **Create**.
2. **Domain name**: `faphouse3.com`
3. **Endpoint type**: Regional
4. **ACM certificate**: Select the certificate validated in Step 5.
5. Click **Create domain name**.
6. Under the newly created custom domain, click **API mappings** -> **Configure API mappings**:
   - **API**: `MultiDomainGatewayApi`
   - **Stage**: `$default`
   - **Path**: Leave blank (root mapping)
7. Save. Repeat this for each domain.
8. API Gateway will display an **API Gateway domain name** target (e.g., `d-1a2b3c4d.execute-api.us-east-1.amazonaws.com`).

---

## 3. DNS Configuration (Connecting Domains to API Gateway)

In the DNS management panel for each domain (e.g. Cloudflare):

### If Using Cloudflare (Recommended):
1. Log in to your Cloudflare dashboard for `faphouse3.com`.
2. Under **DNS** -> **Records**:
   - **Type**: `CNAME`
   - **Name**: `@` (root domain)
   - **Target**: `d-1a2b3c4d.execute-api.us-east-1.amazonaws.com`
   - **Proxy status**:
     - *Option 1 (DNS Only / Gray Cloud)*: API Gateway handles SSL termination via ACM directly.
     - *Option 2 (Proxied / Orange Cloud)*: Cloudflare provides edge caching and DDoS mitigation; Cloudflare SSL mode should be set to **Full (Strict)**.
3. Repeat for `www` subdomain:
   - **Type**: `CNAME`
   - **Name**: `www`
   - **Target**: `d-1a2b3c4d.execute-api.us-east-1.amazonaws.com`
