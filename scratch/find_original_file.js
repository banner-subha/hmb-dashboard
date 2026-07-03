import fs from 'fs';
import readline from 'readline';

async function run() {
  const fileStream = fs.createReadStream('C:\\Users\\admin\\.gemini\\antigravity-ide\\brain\\0f970e22-9437-4fb8-929a-be3e10d02587\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const obj = JSON.parse(line);
    // Find when we edited GeoIntelligence.jsx or read it
    if (obj.tool_calls) {
      for (const tc of obj.tool_calls) {
        if (tc.name === 'default_api:replace_file_content' || tc.name === 'default_api:multi_replace_file_content') {
          if (tc.args.TargetFile && tc.args.TargetFile.includes('GeoIntelligence.jsx')) {
            console.log('--- REPLACE TOOL CALL ---');
            console.log('Instruction:', tc.args.Instruction);
            console.log('TargetContent:', JSON.stringify(tc.args.TargetContent));
            console.log('ReplacementContent:', JSON.stringify(tc.args.ReplacementContent));
          }
        }
      }
    }
  }
}
run();
