type WeappEvent<T = Record<string, never>> = {
  readonly detail: T;
  readonly currentTarget: { readonly dataset: Record<string, string | number | undefined> };
  readonly target?: { readonly dataset?: Record<string, string | number | undefined> };
};

type WeappPageOptions<TData extends Record<string, unknown>> = {
  data: TData;
  id?: string;
  onLoad?: (options: Record<string, string | undefined>) => void;
  [key: string]: unknown;
};

type WeappPageThis<TData extends Record<string, unknown>> = WeappPageOptions<TData> & {
  setData(data: Partial<TData>): void;
};

declare function Page<TData extends Record<string, unknown>>(
  options: WeappPageOptions<TData> & ThisType<WeappPageThis<TData>>,
): void;

declare function App(options: { globalData: { apiOrigin: string }; onLaunch?: () => void }): void;

declare function getApp<T extends { globalData: { apiOrigin: string } }>(): T;

declare const wx: {
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  navigateTo(options: { url: string }): void;
  navigateBack(options: { delta: number }): void;
  reLaunch(options: { url: string }): void;
  setNavigationBarColor(options: { frontColor: string; backgroundColor: string }): void;
  setClipboardData(options: { data: string; success?: () => void }): void;
  showToast(options: { title: string }): void;
};

declare function setTimeout(handler: () => void, timeout: number): number;
declare function clearTimeout(handle: number): void;
