import fs from 'fs';
import readline from 'readline';

async function run() {
  const fileStream = fs.createReadStream('C:\\Users\\admin\\.gemini\\antigravity-ide\\brain\\0f970e22-9437-4fb8-929a-be3e10d02587\\.system_generated\\logs\\transcript_full.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;
  for await (const line of rl) {
    const obj = JSON.parse(line);
    if (obj.tool_calls) {
      for (const tc of obj.tool_calls) {
        if (tc.name && (tc.name.includes('replace') || tc.name.includes('write'))) {
          console.log(`Step ${obj.step_index}: Tool: ${tc.name}`);
          console.log('Args:', JSON.stringify(tc.args).substring(0, 500));
        }
      }
    }
    count++;
  }
}
run();
