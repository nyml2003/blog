/** 操作状态提示条：忙/错误/成功三态互斥展示。 */
export function Status(props: { busy: boolean; error?: string; ok?: string }) {
  return (
    <>
      {props.busy && (
        <div class="muted" role="status">
          处理中...
        </div>
      )}
      {props.error && (
        <div class="error" role="alert">
          {props.error}
        </div>
      )}
      {props.ok && (
        <div class="notice" role="status">
          {props.ok}
        </div>
      )}
    </>
  );
}
