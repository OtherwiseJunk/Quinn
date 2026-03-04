import { Sandbox } from "@e2b/code-interpreter";
import { env } from "../env.js";

const EXECUTION_TIMEOUT = 15_000;
const MAX_OUTPUT_CHARS = 4_000;

export interface CodeResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  durationMs: number;
}

export function isCodeExecutionEnabled(): boolean {
  return Boolean(env.e2bApiKey);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n...(truncated, ${text.length - max} chars omitted)`;
}

export async function executeCode(
  language: "python" | "javascript" | "bash",
  code: string
): Promise<CodeResult> {
  const startTime = Date.now();
  const sbx = await Sandbox.create({ apiKey: env.e2bApiKey! });
  try {
    if (language === "bash") {
      const result = await sbx.commands.run(code, { timeoutMs: EXECUTION_TIMEOUT });
      return {
        success: result.exitCode === 0,
        stdout: truncate(result.stdout, MAX_OUTPUT_CHARS),
        stderr: truncate(result.stderr, MAX_OUTPUT_CHARS),
        error: result.exitCode !== 0 ? `Exit code ${result.exitCode}` : undefined,
        durationMs: Date.now() - startTime,
      };
    }

    const execution = await sbx.runCode(code, {
      language,
      timeoutMs: EXECUTION_TIMEOUT,
    });

    const stdout = execution.logs.stdout.join("\n");
    const stderr = execution.logs.stderr.join("\n");
    const resultText = execution.results.map((r) => r.text).filter(Boolean).join("\n");
    const combinedStdout = [stdout, resultText].filter(Boolean).join("\n");

    return {
      success: !execution.error,
      stdout: truncate(combinedStdout, MAX_OUTPUT_CHARS),
      stderr: truncate(stderr, MAX_OUTPUT_CHARS),
      error: execution.error
        ? `${execution.error.name}: ${execution.error.value}`
        : undefined,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    };
  } finally {
    await sbx.kill().catch(() => {});
  }
}

export function formatCodeResult(
  language: string,
  code: string,
  result: CodeResult
): string {
  const parts = [
    `Code executed (${language}):`,
    "```" + language,
    code,
    "```",
    "",
    result.success ? "Execution succeeded." : "Execution failed.",
  ];

  if (result.stdout) {
    parts.push("", "stdout:", "```", result.stdout, "```");
  }
  if (result.stderr) {
    parts.push("", "stderr:", "```", result.stderr, "```");
  }
  if (result.error) {
    parts.push("", "Error: " + result.error);
  }

  return parts.join("\n");
}
