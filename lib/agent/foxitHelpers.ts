import { createFoxitMcpClient } from "./mcpClient";

// Runs a Foxit MCP tool that follows the upload -> operate -> poll -> download pattern
export async function runFoxitFileOperation({
  filePath,
  operationToolName,
  operationArgs = {},
}: {
  filePath: string;
  operationToolName: string;
  operationArgs?: Record<string, any>;
}) {
  const client = createFoxitMcpClient();
  const tools = await client.getTools();

  const findTool = (name: string) => {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Foxit tool not found: ${name}`);
    return tool;
  };

  try {
    // Step 1: upload
    const uploadTool = findTool("upload_document");
    const uploadResult = await uploadTool.invoke({
      resourceUri: `file://${filePath}`,
    });
    const { documentId } = JSON.parse(uploadResult);

    // Step 2: run the requested operation
    const opTool = findTool(operationToolName);
    const opResult = await opTool.invoke({
      documentId,
      ...operationArgs,
    });
    const opParsed = JSON.parse(opResult);

    // Step 3: poll if async (has taskId)
    let resultDocumentId = opParsed.resultDocumentId;
    if (opParsed.taskId) {
      const getTaskResult = findTool("get_task_result");
      let status = "working";
      while (status === "working") {
        await new Promise((r) => setTimeout(r, 2000)); // wait 2s between polls
        const taskCheck = await getTaskResult.invoke({ task_id: opParsed.taskId });
        const taskParsed = JSON.parse(taskCheck);
        status = taskParsed.status;
        if (status === "completed") resultDocumentId = taskParsed.resultDocumentId;
        if (status === "failed") throw new Error(`Foxit task failed: ${taskParsed.error}`);
      }
    }

    return { resultDocumentId, client };
  } catch (err) {
    await client.close();
    throw err;
  }
}