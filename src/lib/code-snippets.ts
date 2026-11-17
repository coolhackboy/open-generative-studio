/**
 * "Copy as code" — reproduces a generation as a runnable submit + poll script.
 * The API key is never embedded; snippets read it from an environment variable.
 */

export type SnippetLang = 'curl' | 'javascript' | 'python';

export interface SnippetArgs {
  baseUrl: string;
  model: string;
  input: Record<string, unknown>;
  /** e.g. "POYO_API_KEY" */
  keyEnvVar: string;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((l, i) => (i === 0 ? l : pad + l))
    .join('\n');
}

/** JSON → Python literal (True/False/None). */
function toPython(value: unknown, level = 0): string {
  const pad = '    '.repeat(level + 1);
  const end = '    '.repeat(level);
  if (value === null || value === undefined) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'None';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((v) => pad + toPython(v, level + 1)).join(',\n')},\n${end}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${toPython(v, level + 1)}`).join(',\n')},\n${end}}`;
  }
  return 'None';
}

export function curlSnippet({ baseUrl, model, input, keyEnvVar }: SnippetArgs): string {
  const body = JSON.stringify({ model, input }, null, 2);
  return `# Requires curl + jq. Export your key first: export ${keyEnvVar}=...
TASK_ID=$(curl -s -X POST "${baseUrl}/api/generate/submit" \\
  -H "Authorization: Bearer $${keyEnvVar}" \\
  -H "Content-Type: application/json" \\
  -d ${shellQuote(body)} | jq -r '.data.task_id')
echo "task: $TASK_ID"

# Poll every 3s until the task is finished or failed
while true; do
  RES=$(curl -s "${baseUrl}/api/generate/status/$TASK_ID" \\
    -H "Authorization: Bearer $${keyEnvVar}")
  STATUS=$(echo "$RES" | jq -r '.data.status')
  echo "$STATUS $(echo "$RES" | jq -r '.data.progress // 0')%"
  if [ "$STATUS" = "finished" ] || [ "$STATUS" = "failed" ]; then break; fi
  sleep 3
done
echo "$RES" | jq '.data.files // .data.error_message'
`;
}

export function jsSnippet({ baseUrl, model, input, keyEnvVar }: SnippetArgs): string {
  const payload = indent(JSON.stringify({ model, input }, null, 2), 2);
  return `// Node 18+ — save as poyo.mjs and run: ${keyEnvVar}=... node poyo.mjs
const API = "${baseUrl}";
const headers = {
  Authorization: \`Bearer \${process.env.${keyEnvVar}}\`,
  "Content-Type": "application/json",
};

const submit = await fetch(\`\${API}/api/generate/submit\`, {
  method: "POST",
  headers,
  body: JSON.stringify(${payload}),
}).then((r) => r.json());
if (submit.code !== 200) throw new Error(submit.message ?? submit.msg ?? "Submit failed");
const taskId = submit.data.task_id;

let task;
do {
  await new Promise((r) => setTimeout(r, 3000));
  const res = await fetch(\`\${API}/api/generate/status/\${taskId}\`, { headers }).then((r) => r.json());
  task = res.data;
  console.log(task.status, \`\${task.progress ?? 0}%\`);
} while (task.status !== "finished" && task.status !== "failed");

console.log(task.status === "finished" ? task.files : task.error_message);
`;
}

export function pythonSnippet({ baseUrl, model, input, keyEnvVar }: SnippetArgs): string {
  return `# pip install requests
import os
import time

import requests

API = "${baseUrl}"
HEADERS = {"Authorization": f"Bearer {os.environ['${keyEnvVar}']}"}

payload = {
    "model": ${JSON.stringify(model)},
    "input": ${toPython(input, 1)},
}

submit = requests.post(f"{API}/api/generate/submit", json=payload, headers=HEADERS).json()
if submit.get("code") != 200:
    raise RuntimeError(submit.get("message") or submit.get("msg") or submit)
task_id = submit["data"]["task_id"]

while True:
    time.sleep(3)
    task = requests.get(f"{API}/api/generate/status/{task_id}", headers=HEADERS).json()["data"]
    print(task["status"], f"{task.get('progress', 0)}%")
    if task["status"] in ("finished", "failed"):
        break

print(task.get("files") if task["status"] == "finished" else task.get("error_message"))
`;
}

export function snippet(lang: SnippetLang, args: SnippetArgs): string {
  switch (lang) {
    case 'curl':
      return curlSnippet(args);
    case 'javascript':
      return jsSnippet(args);
    case 'python':
      return pythonSnippet(args);
  }
}
