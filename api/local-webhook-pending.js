// /api/local-webhook-pending.js
import { consumePendingResults } from "./local-webhook";

export default async function handler(req, res) {
  const items = consumePendingResults();
  return res.status(200).json(items);
}
