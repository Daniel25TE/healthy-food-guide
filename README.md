# Healthy Food Guide

A mobile-friendly educational website presenting nutrition information and affordable recipes for four chronic diseases: Diabetes, Heart Disease, Obesity, and Hypertension.

**Educational content (JSON files in `/data/`) is managed directly in the repository. AWS is used only for comments and analytics.**

---

## 1. Local Development

No build step needed. Just open `index.html` in a browser — or run a local server for proper module loading:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

The site works fully without AWS credentials. Comments and analytics will simply be unavailable until the backend is deployed.

---

## 2. Editing Content (JSON)

Each disease has its own file in `/data/`:

- `data/diabetes.json`
- `data/heart-disease.json`
- `data/obesity.json`
- `data/hypertension.json`

### Adding a food item
Add an object to the `"foods"` array:
```json
{
  "id": "my-food-slug",
  "name": "My Food",
  "serving": "1 cup",
  "nutritionPerServing": {
    "calories": 150,
    "carbohydratesGrams": 30,
    "proteinGrams": 5,
    "fatGrams": 2,
    "saturatedFatGrams": null,
    "fiberGrams": 4,
    "sodiumMilligrams": 10
  },
  "notes": "Optional note.",
  "sources": [{"label": "USDA FoodData Central", "url": "https://fdc.nal.usda.gov"}]
}
```
Use `null` for any value you don't have — never use `0` to mean "unknown".

### Adding a recipe
Add an object to the `"recipes"` array. The `"id"` must be unique (kebab-case). Reference food IDs in `"foodId"` where applicable (or use `null`).

---

## 3. AWS Prerequisites

- Node.js 18+ and npm
- AWS CDK v2: `npm install -g aws-cdk`
- AWS CLI configured with the `maribao` profile

---

## 4. Infrastructure Deployment

> **Read every step. Do not deploy without reviewing the synthesized output.**

```bash
cd infrastructure
npm install
npm run build

# Preview what will be created — review before deploying
AWS_PROFILE=maribao npx cdk synth

# Bootstrap the account (one-time per account/region)
AWS_PROFILE=maribao npx cdk bootstrap

# Deploy (only after reviewing synth output and confirming costs)
AWS_PROFILE=maribao npx cdk deploy --context githubPagesOrigin=https://daniel25te.github.io/healthy-food-guide
```

After deploy, the terminal prints `ApiBaseUrl`. Copy that value.

---

## 5. Connecting the Frontend to the API

Open `assets/js/api.js` and set:

```js
export const API_BASE_URL = 'https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com';
```

Commit and push to GitHub. GitHub Pages will serve the updated file.

---

## 6. Cost Summary

This project uses serverless, pay-per-use services. **Free Tier is not guaranteed** — it depends on your account age, region, and current AWS offers.

| Service | What can cost money |
|---|---|
| API Gateway HTTP API | Requests beyond Free Tier (~1M/month for new accounts) |
| Lambda | Invocations and GB-seconds beyond Free Tier |
| DynamoDB (on-demand) | Read/write request units beyond Free Tier |
| CloudWatch Logs | Log ingestion and storage (kept short: 7–14 days) |
| Data transfer | Outbound data beyond 1 GB/month Free Tier |

For a school project with low traffic, charges will be very small or zero — but verify your account's current Free Tier status at [aws.amazon.com/free](https://aws.amazon.com/free).

---

## 7. Teardown

To delete all AWS resources:

```bash
cd infrastructure
AWS_PROFILE=maribao npx cdk destroy
```

**This permanently deletes all DynamoDB data (comments and analytics). There is no undo.** Confirm you are okay losing this data before running destroy.

The GitHub repository and static site on GitHub Pages are unaffected by `cdk destroy`.
