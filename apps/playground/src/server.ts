import type { MockRoute } from "@fluvient-loom/mock";
import { log } from "./log";

export interface DemoArticle {
  readonly id: number;
  readonly title: string;
  readonly summary: string;
  readonly tag: string;
  readonly paragraphs: readonly string[];
}

export interface DemoRecommendation {
  readonly articleId: number;
  readonly reason: string;
}

const ARTICLES: readonly DemoArticle[] = [
  {
    id: 1,
    title: "端口与适配器：内核不认识任何宿主",
    summary: "内核只吃契约，node / web / mock 都是插上来的适配器。",
    tag: "架构",
    paragraphs: [
      "生命周期工厂的签名里只有 PersistencePort、DataTask 与 SchedulerPort——它不知道背后是 localStorage、fetch 还是内存路由。",
      "第四期的 contract 测试用同一工厂同一剧本跑了双宿主组装，投影序列完全一致；适配器无关从设计意图变成了回归门禁。",
      "换一个宿主，就是换一组适配器的装配，内核一行不动。",
    ],
  },
  {
    id: 2,
    title: "生命周期四段：restore → reconcile → mutate → project",
    summary: "同步恢复、异步校准、乐观写入、唯一投影出口。",
    tag: "架构",
    paragraphs: [
      "restore 是同步的，只走本地缓存；reconcile 走服务端真相；写入乐观生效、失败回滚、可重试。",
      "所有路径最终都流经同一个 project 钩子——本页的 data-theme 投影、收藏星标、本地缓存穿透都在那里。",
      "刷新页面后 restore 拿回最后一次投影，这就是你会话内的连续感。",
    ],
  },
  {
    id: 3,
    title: "栈 ≡ 日志的折叠：返回键是一等公民",
    summary: "浏览器 history 是日志，栈是它的语义折叠。",
    tag: "导航",
    paragraphs: [
      "本 demo 的页面进出骑在 NavigationPort 上：push 进页、popstate 返回，系统返回手势和页内返回走同一条路。",
      "返回列表页时滚动位置原样——视图 DOM 没有被销毁，这是将来保活池的迷你预演。",
      "真正的帧号快照与 LRU-K 池在页面运行时计划里，demo 先用手写迷你栈占位。",
    ],
  },
  {
    id: 4,
    title: "DataTask：可取消的读",
    summary: "懒启动、单次执行、协作与非协作取消都收口。",
    tag: "数据",
    paragraphs: [
      "每次进详情页都是一次新的 DataTask：start 懒执行、cancel 干净收口。",
      "页面被盖上时取消在途请求，回来的那次再拉一次——不泄漏也不 stale。",
      "mock 网络可以注入延迟与 hang，把超时和取消路径当面演给你看。",
    ],
  },
  {
    id: 5,
    title: "mock 适配器：服务端是一张路由表",
    summary: "内存网络、路径参数、可注入的失败与延迟。",
    tag: "数据",
    paragraphs: [
      "本页所有数据来自 @fluvient-loom/mock：精确路由加 :param 段匹配，未匹配落业务级 404。",
      "收藏接口有 failNext 注入——打开\"下次收藏失败\"，乐观点亮会回滚，横幅出现，重试再成功。",
      "传输层的延迟、超时、取消也在 mock 的能力清单里，零端口零网络。",
    ],
  },
  {
    id: 6,
    title: "写路径：乐观、回滚、重试",
    summary: "点一下星标，看请求飞行中的三种结局。",
    tag: "数据",
    paragraphs: [
      "星标点亮发生在请求之前——这就是乐观更新。",
      "服务端 500 时状态回滚到服务端真相，横幅带出重试按钮。",
      "重试批次合并了等待中的变更，不会重复写。",
    ],
  },
  {
    id: 7,
    title: "状态分层：什么进快照，什么永不进",
    summary: "页面状态随导航走，会话状态跨页面走。",
    tag: "架构",
    paragraphs: [
      "收藏是会话状态：跨页面、刷新存活、永不进导航快照。",
      "滚动位置是页面状态：属于列表页，返回时还原。",
      "作用域放错的狀态会让快照变成 bug 工厂——这页刻意示范正确分层。",
    ],
  },
  {
    id: 8,
    title: "Result 贯穿：失败是值，不是异常",
    summary: "从端口到生命周期，错误都是可分支的数据。",
    tag: "基建",
    paragraphs: [
      "read/write/request 的失败都返回类型化的 Result，隐私模式、断网、500 各有各的 kind。",
      "上层据此决定横幅、重试还是静默降级，没有 try/catch 地毯。",
      "这个形状从 common 包一路贯穿到本页的收藏逻辑。",
    ],
  },
  {
    id: 9,
    title: "适配器无关的装配：这份页面就是证明",
    summary: "渲染层没写一行框架代码。",
    tag: "架构",
    paragraphs: [
      "本页是 vanilla TS：project 回调直接驱动 DOM，没有 signal 镜像、没有虚拟 DOM。",
      "把同一套装配换成 Solid 适配，业务代码不变——那是接入期的故事。",
      "demo 即架构图：port 之下是内核，之上是宿主，页面只做粘合。",
    ],
  },
  {
    id: 10,
    title: "下一步：页面运行时四包",
    summary: "container / page / web / solid，导航脊柱在路上。",
    tag: "路线",
    paragraphs: [
      "手写迷你栈会被 container 包的正经导航事务替代：begin → commit → settle。",
      "帧号快照、槽与 form、LRU-K 保活池都在路线图上，R0 决策表待审。",
      "demo 今天演示的每一点，都是那条路的某一段的预演。",
    ],
  },
];

const RECOMMENDATIONS: readonly DemoRecommendation[] = [
  { articleId: 1, reason: "先看内核为什么中立" },
  { articleId: 2, reason: "四段生命周期串起一切" },
  { articleId: 3, reason: "返回键与栈的折叠" },
];

export interface DemoServer {
  readonly routes: readonly MockRoute[];
  /** Makes the next favorite write settle as a 500 (rehearse rollback). */
  failNextFavorite(): void;
  /** Server-side truth, for assertions and demos. */
  favoriteIds(): readonly number[];
}

export function createDemoServer(): DemoServer {
  const favorites = new Set<number>([4]);
  let failNext = false;
  const byId = (id: number) => ARTICLES.find((article) => article.id === id);
  const json = (status: number, body: unknown) => ({
    status,
    headers: { "content-type": "application/json" },
    body,
  });

  const traced = (routes: readonly MockRoute[]): readonly MockRoute[] =>
    routes.map((route) => ({
      ...route,
      respond(context) {
        log("mock-server", `${route.method} ${route.path}`, {
          params: context.params,
          body: context.body,
        });
        return route.respond(context);
      },
    }));
  return {
    routes: traced([
      {
        method: "GET",
        path: "/recommendations",
        respond: () =>
          json(
            200,
            RECOMMENDATIONS.map((recommendation) => ({
              ...recommendation,
              article: byId(recommendation.articleId),
            })),
          ),
      },
      {
        method: "GET",
        path: "/articles",
        respond: () => json(200, ARTICLES.map(({ paragraphs, ...rest }) => rest)),
      },
      {
        method: "GET",
        path: "/articles/:id",
        respond: (context) => {
          const article = byId(Number(context.params.id));
          return article === undefined
            ? json(404, { message: "no such article" })
            : json(200, article);
        },
      },
      {
        method: "GET",
        path: "/articles/:id/related",
        respond: (context) => {
          const id = Number(context.params.id);
          const related = ARTICLES.filter((article) => article.id !== id)
            .slice(0, 4)
            .map(({ paragraphs, ...rest }) => rest);
          return json(200, related);
        },
      },
      {
        method: "GET",
        path: "/favorites",
        respond: () => json(200, { ids: [...favorites] }),
      },
      {
        method: "POST",
        path: "/favorites",
        respond: (context) => {
          if (failNext) {
            failNext = false;
            return json(500, { message: "injected failure" });
          }
          const body = (context.body ?? {}) as { ids?: unknown };
          if (!Array.isArray(body.ids)) {
            return json(400, { message: "ids[] required" });
          }
          favorites.clear();
          for (const id of body.ids) {
            if (typeof id === "number") favorites.add(id);
          }
          return json(200, { ids: [...favorites] });
        },
      },
    ]),
    failNextFavorite() {
      failNext = true;
    },
    favoriteIds: () => [...favorites],
  };
}
