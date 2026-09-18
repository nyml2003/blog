import { createCancellationSource } from "../../kernel/cancellation";
import { createDataTask as createKernelDataTask } from "../../kernel/task";
import type {
  CancellationSource,
  DataTask,
  DataTaskDefinition,
} from "../../kernel/ports";

function createBrowserSource(): CancellationSource {
  const controller = new AbortController();
  return createCancellationSource(() => controller.abort());
}

export function createBrowserDataTask<T, E>(
  definition: DataTaskDefinition<T, E>,
): DataTask<T, E> {
  return createKernelDataTask(definition, createBrowserSource);
}
