# @fluvient-loom/nested-gesture

NestedGesture 协议核心：父子可滚动容器的手势移交（平台中立、零依赖）。Web 适配见 `@fluvient-loom/gesture-web`。

## 协议摘要

- **会话**：一次完整触摸生命周期；所有权唯一（子或父），父接受后锁死至会话结束；
- **三阶段消费**：父 pre（`preConsume` 回调，折叠头类先吃）→ 子（原生滚动或 `consumeToStart` 委托）→ 余量提议（`offer`，父 `preventDefault` 即接受）——`consumed { pre, child, remainder }` 逐 move 回写；
- **有效边界**：`setTopBoundProvider` 可插拔缝；
- **锁定/解锁双模式**，两模式均为累计 drift（业界 slop 语义；解锁模式下 `cancelable` 守卫防 pan 抢跑）；
- **LSQ2 速度**：`createVelocityTracker`（100ms 窗，Chromium HORIZON；二阶最小二乘，最新样本处取导数；`units` 参数 = Android `computeCurrentVelocity` 惯例，1000 → px/s）；
- **物理投影结算**：`projectSettlement`——速度是距离信号，viewport 归一化、真实 percent 距离、噪声地板、越端钳位；`projectionMs: 0` 是退化开关（纯最近位置）；
- **风险定价（区域封顶）**：`snapHorizon` 短于默认视野的吸附点是"被定价的"——投影落进它的最近区域（与相邻吸附点的中点分界）时，动量必须在该吸附点**自身视野**内真正可达，否则投影退到区域边界。定价对**任意远方**的破坏性目标生效（不止相邻点），从区域内部释放时则让位于就近规则；
- **物理剩余速度**：投影越过端点时，剩余速度 = fling 衰减模型在越边时刻的瞬时速度（闭式解 `v0·(1−d/(v0·τ))`），非启发式比值；
- **独立 fling 通道**：`createFling`（指数衰减，Compose 式）——`positionAt/velocityAt/settleDuration/distance/remaining`（打断时的剩余速度，供父接力）。

## 调参入口

| 参数 | 默认 | 含义 |
| --- | --- | --- |
| `projectionMs` | 调用方定（sheet 用 220） | 预测视野——"多相信用户的动能意图" |
| `snapHorizon(snap)` | 同 projectionMs | 风险定价：破坏性目标给短视野（sheet 的 close 用 120） |
| `noiseFloorPxPerMs` | 0.05 | 采样噪声地板（投影模型放大的噪声在此吸收） |
| `decayTauMs` | 160 | fling 衰减时间常数 |
| `units` | 1 | 速度单位倍率（1000 → px/s） |

**手感调参法**：固定一组手势（中段微甩/中甩/反向微甩/边界甩/停顿松手）对照落点——差异集就是手感地图，调 `projectionMs` 与短视野直到地图满意。`projectionMs: 0` 随时可退回纯位置吸附。

## 与业界的剩余差距

| 维度 | 本包 | 业界 | 状态 |
| --- | --- | --- | --- |
| 速度采样 | LSQ2（Cramer 3×3） | 同 | ✅ 已对齐 |
| 速度单位 | px/ms + units 倍率 | px/s 密度可调 | ✅ units 覆盖；密度缩放归调用方 |
| 结算 | 物理投影 + 剩余速度 | iOS targetContentOffset | ✅ 已对齐（阈值模型保留为退化参考） |
| 协议阶段 | pre / child / offer | pre / child / post | ✅ pre + offer≈post；post 的"父二次消费"由 offer 后续 track 语义承载 |
| 消费回写 | `consumed { pre, child, remainder }` | `consumed[]` | ✅ 已对齐 |
| Fling 通道 | `createFling`（衰减 + 打断剩余 {velocity, position}；地板下起步立即稳定） | TYPE_NON_TOUCH | ✅ 核心已对齐；Web 适配的 rAF 驱动动画未接（sheet 用 CSS transition 近似），通道留好 |
| 解锁 slop | 累计 drift + cancelable 守卫 | 累计 | ✅ 已对齐 |
| LSQ 数值法 | Cramer（密集公式） | Chromium 用加权/伪逆 | 等价精度；样本极多时可换增量拟合法 |

## 测试

30 个单测：LSQ2（干净斜坡/尖峰噪声/退化/units/过期窗口）、投影结算（手感五组地图、中点跨越、远方破坏性目标的区域封顶、区域内部就近规则、物理越边速度闭式解、退化开关、真实 percent 距离、噪声地板）、fling（衰减数学/打断剩余含位置/地板下零时长）、session（pre 阶段分解、consumed 回写、双模式累计、所有权锁、停顿 ~0）、兼容模型回归。
